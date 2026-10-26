import type { Catalog } from '@dsmn/shared';
import { describe, expect, it, vi } from 'vitest';
import { ServerUnreachableError, type ServerClient } from '../src/core/http.ts';
import { selectionSummary, sizeLookup } from '../src/core/library.ts';
import { LocalStore } from '../src/core/store.ts';
import { runSync } from '../src/core/syncEngine.ts';
import { fakeDownloader, makeTrack, memoryFiles, sqliteDb, trackFor, type Behavior } from './helpers.ts';

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);
const URL = (id: string) => `http://srv/api/tracks/${id}/file`;
const server = { serverId: 'srv', name: 'PC', url: 'http://192.168.1.10:4747', token: 'tok' };

function setup(behave?: (url: string, attempt: number) => Behavior) {
  const data = { t1: bytes(1000, 1), t2: bytes(1200, 2), t3: bytes(1400, 3) };
  const catalog: Catalog = {
    serverId: 'srv',
    revision: 1,
    tracks: Object.entries(data).map(([id, d]) => trackFor(id, d)),
    albums: [
      { id: 'al1', title: 'Disco', artist: 'A', year: null, coverId: null, trackIds: ['t1', 't2', 't3'] },
    ],
    playlists: [],
  };
  const client: ServerClient = {
    catalog: vi.fn(async () => ({ notModified: false as const, catalog, etag: '"1"' })),
    trackUrl: URL,
    coverUrl: (id: string) => `http://srv/api/covers/${id}`,
    authHeaders: () => ({ Authorization: 'Bearer tok' }),
    applyChange: vi.fn(async () => {}),
  };
  const store = new LocalStore(sqliteDb());
  store.setServer(server);
  const files = memoryFiles();
  const downloader = fakeDownloader(
    files,
    new Map(Object.entries(data).map(([id, d]) => [URL(id), d])),
    behave,
  );
  const sleep = vi.fn(async (_ms: number) => {});
  return { client, store, files, downloader, sleep, catalog };
}

describe('desvincular y volver a vincular', () => {
  it('conserva lo descargado al volver a vincular el mismo servidor', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await runSync({ ...s });
    s.store.clearServer();
    s.store.setServer(server);
    const report = await runSync({ ...s });
    expect(report.deleted).toBe(0);
    expect(s.store.getDownloads()).toHaveLength(3);
  });

  it('si la sincronización se abortó antes de borrar, no borra nada', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await runSync({ ...s });
    s.store.replaceSelection([]);
    const abort = new AbortController();
    abort.abort();
    const report = await runSync({ ...s, signal: abort.signal });
    expect(report).toMatchObject({ deleted: 0, paused: true });
    expect(s.store.getDownloads()).toHaveLength(3);
  });
});

describe('servidor que se va a mitad de la descarga', () => {
  it('un error de red genérico con el servidor caído frena todo sin esperas', async () => {
    const s = setup((url) => (url === URL('t2') ? 'fail' : undefined));
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    let calls = 0;
    s.client.catalog = vi.fn(async () => {
      calls++;
      if (calls > 1) throw new ServerUnreachableError();
      return { notModified: false as const, catalog: s.catalog, etag: '"1"' };
    });
    await expect(runSync({ ...s })).rejects.toBeInstanceOf(ServerUnreachableError);
    expect(s.sleep).not.toHaveBeenCalled();
  });

  it('abortar durante la espera de un reintento pausa sin más descargas', async () => {
    const abort = new AbortController();
    const s = setup((url) => (url === URL('t1') ? 'fail' : undefined));
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const sleep = vi.fn(async () => abort.abort());
    const report = await runSync({ ...s, sleep, signal: abort.signal });
    expect(report.paused).toBe(true);
    expect(s.downloader.calls.filter((c) => c.url === URL('t1'))).toHaveLength(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('mensajes de error en español', () => {
  it('traduce los errores del descargador', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    s.downloader.download = vi.fn(async (req) => {
      if (req.url === URL('t1')) throw new Error('Unable to download a file: HTTP 409');
      if (req.url === URL('t2')) throw new Error('Unable to download a file: HTTP 404');
      throw new Error('Unable to download a file: timeout');
    });
    const report = await runSync({ ...s });
    expect(report.failed).toEqual([
      { trackId: 't1', error: 'La carpeta de esta canción no está conectada en la compu' },
      { trackId: 't2', error: 'La canción ya no está en la compu' },
      { trackId: 't3', error: 'Se cortó la descarga' },
    ]);
  });
});

describe('bibliotecas grandes', () => {
  it('calcular el tamaño de cada álbum y lista es rápido', () => {
    const tracks = Array.from({ length: 20_000 }, (_, i) => makeTrack(`t${i}`, { size: 5_000_000 }));
    const albums = Array.from({ length: 1700 }, (_, a) => ({
      id: `a${a}`,
      title: `Álbum ${a}`,
      artist: 'X',
      year: null,
      coverId: null,
      trackIds: tracks.slice(a * 11, a * 11 + 12).map((t) => t.id),
    }));
    const catalog: Catalog = { serverId: 's', revision: 1, tracks, albums, playlists: [] };
    const t0 = performance.now();
    const size = sizeLookup(catalog);
    const total = albums.reduce((sum, a) => sum + size(a.trackIds), 0);
    selectionSummary(
      catalog,
      albums.map((a) => ({ kind: 'album' as const, id: a.id })),
    );
    expect(performance.now() - t0).toBeLessThan(300);
    expect(total).toBeGreaterThan(0);
  });
});

describe('LocalStore', () => {
  it('desvincular conserva la selección', () => {
    const store = new LocalStore(sqliteDb());
    store.setSelected({ kind: 'album', id: 'al1' }, true);
    store.clearServer();
    expect(store.getSelection()).toEqual([{ kind: 'album', id: 'al1' }]);
  });

  it('el catálogo se lee de memoria sin volver a parsearlo', () => {
    const store = new LocalStore(sqliteDb());
    store.setCatalog({ serverId: 's', revision: 1, tracks: [], albums: [], playlists: [] }, '"1"');
    expect(store.getCatalog()?.catalog).toBe(store.getCatalog()?.catalog);
  });
});
