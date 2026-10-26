import { describe, expect, it, vi } from 'vitest';
import {
  ServerError,
  ServerUnreachableError,
  UnauthorizedError,
  createServerClient,
} from '../src/core/http.ts';
import { applyPending, flushPending, newPlaylistId, type PendingChange } from '../src/core/pending.ts';
import { DeviceCreatePlaylistRequestSchema } from '@dsmn/shared';
import { LocalStore } from '../src/core/store.ts';
import { fakeFetch, makeCatalog, makeTrack, sqliteDb } from './helpers.ts';

const LIST = '6f1c2b1e-8a4b-4c55-9d3e-2f6a7b8c9d0e';

describe('applyPending', () => {
  it('sin cambios devuelve el mismo catálogo', () => {
    const catalog = makeCatalog();
    expect(applyPending(catalog, [])).toBe(catalog);
  });

  it('favoritas por huella: marcar y desmarcar', () => {
    const catalog = makeCatalog({
      tracks: [
        makeTrack('t1'),
        makeTrack('t2', { fingerprint: 'fp-t1' }),
        makeTrack('t3', { favoritedAt: 3 }),
      ],
    });
    const out = applyPending(catalog, [
      { kind: 'favorite', trackId: 't1', on: true, at: 10 },
      { kind: 'favorite', trackId: 't3', on: false, at: 11 },
    ]);
    expect(out.tracks.map((t) => t.favoritedAt ?? null)).toEqual([10, 10, null]);
  });

  it('lista nueva, agregar, quitar y renombrar, en orden', () => {
    const changes: PendingChange[] = [
      { kind: 'createPlaylist', id: LIST, name: 'Viaje', trackIds: ['t1', 'fantasma'] },
      { kind: 'addTracks', id: LIST, trackIds: ['t2', 't1'] },
      { kind: 'removeTrack', id: LIST, trackId: 't1' },
      { kind: 'renamePlaylist', id: LIST, name: 'Viaje largo' },
      { kind: 'addTracks', id: 'p1', trackIds: ['t1'] },
    ];
    const out = applyPending(makeCatalog(), changes);
    expect(out.playlists).toEqual([
      { id: 'p1', name: 'Lista', type: 'manual', folder: null, trackIds: ['t2', 't3', 't1'] },
      { id: LIST, name: 'Viaje largo', type: 'manual', folder: null, trackIds: ['t2'] },
    ]);
    expect(applyPending(out, [{ kind: 'deletePlaylist', id: LIST }]).playlists.map((p) => p.id)).toEqual([
      'p1',
    ]);
  });

  it('no toca las listas de carpeta', () => {
    const catalog = makeCatalog({
      playlists: [
        { id: 'f1', name: 'Carpeta', type: 'folder', folder: { rootId: 1, relPath: '' }, trackIds: ['t1'] },
      ],
    });
    const out = applyPending(catalog, [
      { kind: 'removeTrack', id: 'f1', trackId: 't1' },
      { kind: 'deletePlaylist', id: 'f1' },
    ]);
    expect(out.playlists).toEqual(catalog.playlists);
  });
});

describe('cambios pendientes en la base', () => {
  it('marcar y desmarcar la misma favorita deja solo lo último', () => {
    const store = new LocalStore(sqliteDb());
    store.addPending({ kind: 'favorite', trackId: 't1', on: true, at: 1 });
    store.addPending({ kind: 'favorite', trackId: 't2', on: true, at: 2 });
    store.addPending({ kind: 'favorite', trackId: 't1', on: false, at: 3 });
    expect(store.getPending().map((p) => p.change)).toEqual([
      { kind: 'favorite', trackId: 't2', on: true, at: 2 },
      { kind: 'favorite', trackId: 't1', on: false, at: 3 },
    ]);
  });
});

describe('flushPending', () => {
  function setup(fail: (change: PendingChange) => Error | null = () => null) {
    const store = new LocalStore(sqliteDb());
    const sent: PendingChange[] = [];
    const client = {
      applyChange: vi.fn(async (change: PendingChange) => {
        const err = fail(change);
        if (err) throw err;
        sent.push(change);
      }),
    };
    return { store, client, sent };
  }

  it('manda todo en orden y vacía la cola', async () => {
    const s = setup();
    s.store.addPending({ kind: 'createPlaylist', id: LIST, name: 'X', trackIds: [] });
    s.store.addPending({ kind: 'addTracks', id: LIST, trackIds: ['t1'] });
    expect(await flushPending(s)).toBe(2);
    expect(s.sent.map((c) => c.kind)).toEqual(['createPlaylist', 'addTracks']);
    expect(s.store.getPending()).toEqual([]);
  });

  it('lo que la compu rechaza (ya no existe) se descarta y sigue con lo demás', async () => {
    const s = setup((c) =>
      c.kind === 'favorite' ? new ServerError(404, 'not_found', 'Canción inexistente') : null,
    );
    s.store.addPending({ kind: 'favorite', trackId: 'borrada', on: true, at: 1 });
    s.store.addPending({ kind: 'renamePlaylist', id: 'p1', name: 'Y' });
    expect(await flushPending(s)).toBe(1);
    expect(s.store.getPending()).toEqual([]);
  });

  it('sin conexión, revocado o error de la compu: frena y conserva lo que falta', async () => {
    for (const err of [
      new ServerUnreachableError(),
      new UnauthorizedError('no'),
      new ServerError(500, 'internal', 'x'),
    ]) {
      const s = setup((c) => (c.kind === 'renamePlaylist' ? err : null));
      s.store.addPending({ kind: 'favorite', trackId: 't1', on: true, at: 1 });
      s.store.addPending({ kind: 'renamePlaylist', id: 'p1', name: 'Y' });
      s.store.addPending({ kind: 'deletePlaylist', id: 'p1' });
      await expect(flushPending(s)).rejects.toBe(err);
      expect(s.store.getPending().map((p) => p.change.kind)).toEqual(['renamePlaylist', 'deletePlaylist']);
    }
  });
});

describe('cliente: pedidos de cada cambio', () => {
  it('arma método, ruta y cuerpo; sin cuerpo no manda Content-Type', async () => {
    const fetch = fakeFetch({
      [`PUT http://srv/api/favorites/t%201`]: { status: 204 },
      [`POST http://srv/api/playlists`]: { status: 201, body: {} },
      [`DELETE http://srv/api/playlists/${LIST}/tracks/t1`]: { status: 200, body: {} },
      [`PATCH http://srv/api/playlists/p1`]: {
        status: 404,
        body: { error: { code: 'not_found', message: 'no' } },
      },
    });
    const client = createServerClient({ baseUrl: 'http://srv', token: 'tok', fetch });
    await client.applyChange({ kind: 'favorite', trackId: 't 1', on: true, at: 1 });
    await client.applyChange({ kind: 'createPlaylist', id: LIST, name: 'X', trackIds: ['t1'] });
    await client.applyChange({ kind: 'removeTrack', id: LIST, trackId: 't1' });
    await expect(client.applyChange({ kind: 'renamePlaylist', id: 'p1', name: 'Y' })).rejects.toMatchObject({
      status: 404,
    });
    expect(fetch.calls[0]).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer tok' } });
    expect(fetch.calls[0]!.headers['Content-Type']).toBeUndefined();
    expect(fetch.calls[1]).toMatchObject({
      body: { id: LIST, name: 'X', trackIds: ['t1'] },
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

describe('newPlaylistId', () => {
  it('arma un UUID que el servidor acepta, también sin crypto', () => {
    let seed = 7;
    const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (const id of [newPlaylistId(), newPlaylistId(random), newPlaylistId(random)]) {
      expect(DeviceCreatePlaylistRequestSchema.safeParse({ id, name: 'X' }).success).toBe(true);
    }
    expect(newPlaylistId(random)).not.toBe(newPlaylistId(random));
  });
});
