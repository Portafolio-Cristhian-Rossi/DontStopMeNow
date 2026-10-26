import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getRevision } from '../../src/db/meta.ts';
import { createPlaylist } from '../../src/library/playlists.ts';
import { addRoot } from '../../src/library/roots.ts';
import { REMOTE, makeApp } from '../helpers/app.ts';
import { makeLibrary } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

/** App con tres canciones y un celular vinculado; `call` hace pedidos desde la red con su token. */
async function setup() {
  const { app, deps } = await makeApp();
  const dir = await makeLibrary({
    'a.mp3': makeMp3({ title: 'a' }),
    'b.mp3': makeMp3({ title: 'b' }),
    'c.mp3': makeMp3({ title: 'c' }),
  });
  addRoot(deps.db, deps.bus, dir);
  await deps.scanner.scanAll();
  const { code } = deps.pairing.createCode();
  const { token } = (
    await app.inject({
      method: 'POST',
      url: '/api/pair',
      remoteAddress: REMOTE,
      payload: { code, deviceName: 'Pixel' },
    })
  ).json();
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      payload,
      remoteAddress: REMOTE,
      headers: { authorization: `Bearer ${token}` },
    });
  const catalog = async () => (await call('GET', '/api/catalog')).json();
  const ids = ((await catalog()).tracks as { id: string; title: string }[])
    .sort((x, y) => x.title.localeCompare(y.title))
    .map((t) => t.id);
  return { app, deps, call, catalog, ids };
}

describe('el celular edita favoritas y listas', () => {
  it('favoritas: marcar dos veces no cambia nada; sin token no se puede', async () => {
    const s = await setup();
    const base = getRevision(s.deps.db);
    expect((await s.call('PUT', `/api/favorites/${s.ids[0]}`)).statusCode).toBe(204);
    expect((await s.call('PUT', `/api/favorites/${s.ids[0]}`)).statusCode).toBe(204);
    expect(getRevision(s.deps.db)).toBe(base + 1);
    const fav = (await s.catalog()).tracks.find((t: { id: string }) => t.id === s.ids[0]);
    expect(fav.favoritedAt).toEqual(expect.any(Number));
    expect((await s.call('DELETE', `/api/favorites/${s.ids[0]}`)).statusCode).toBe(204);
    expect((await s.call('PUT', '/api/favorites/nope')).statusCode).toBe(404);
    expect(
      (await s.app.inject({ method: 'PUT', url: `/api/favorites/${s.ids[0]}`, remoteAddress: REMOTE }))
        .statusCode,
    ).toBe(401);
  });

  it('crear con el id del celular: un reintento devuelve la misma lista', async () => {
    const s = await setup();
    const id = randomUUID();
    const body = { id, name: 'Viaje', trackIds: [s.ids[0], 'ya-no-existe'] };
    const first = await s.call('POST', '/api/playlists', body);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ id, name: 'Viaje', type: 'manual', trackIds: [s.ids[0]] });
    const rev = getRevision(s.deps.db);
    expect((await s.call('POST', '/api/playlists', body)).json()).toMatchObject({ id, trackIds: [s.ids[0]] });
    expect(getRevision(s.deps.db)).toBe(rev);
    expect((await s.call('POST', '/api/playlists', { id: 'no-uuid', name: 'X' })).statusCode).toBe(400);
  });

  it('agregar y quitar canciones no pisa lo agregado desde la web', async () => {
    const s = await setup();
    const id = randomUUID();
    await s.call('POST', '/api/playlists', { id, name: 'Mix', trackIds: [s.ids[0]] });
    // Mientras tanto, en la web se agrega otra.
    await s.app.inject({
      method: 'PATCH',
      url: `/api/admin/playlists/${id}`,
      payload: { trackIds: [s.ids[0], s.ids[1]] },
    });
    const added = await s.call('POST', `/api/playlists/${id}/tracks`, { trackIds: [s.ids[2], s.ids[0]] });
    expect(added.json().trackIds).toEqual([s.ids[0], s.ids[1], s.ids[2]]);
    const rev = getRevision(s.deps.db);
    await s.call('POST', `/api/playlists/${id}/tracks`, { trackIds: [s.ids[2]] });
    expect(getRevision(s.deps.db)).toBe(rev);

    const removed = await s.call('DELETE', `/api/playlists/${id}/tracks/${s.ids[1]}`);
    expect(removed.json().trackIds).toEqual([s.ids[0], s.ids[2]]);
    await s.call('DELETE', `/api/playlists/${id}/tracks/${s.ids[1]}`);
    expect(getRevision(s.deps.db)).toBe(rev + 1);
    // Después de quitar, agregar sigue al final.
    const again = await s.call('POST', `/api/playlists/${id}/tracks`, { trackIds: [s.ids[1]] });
    expect(again.json().trackIds).toEqual([s.ids[0], s.ids[2], s.ids[1]]);
  });

  it('renombrar y borrar; las listas de carpeta no se tocan desde el celular', async () => {
    const s = await setup();
    const id = randomUUID();
    await s.call('POST', '/api/playlists', { id, name: 'Viejo' });
    expect((await s.call('PATCH', `/api/playlists/${id}`, { name: ' Nuevo ' })).json().name).toBe('Nuevo');
    expect((await s.call('DELETE', `/api/playlists/${id}`)).statusCode).toBe(204);
    expect((await s.call('DELETE', `/api/playlists/${id}`)).statusCode).toBe(404);
    expect((await s.call('POST', `/api/playlists/${id}/tracks`, { trackIds: [s.ids[0]] })).statusCode).toBe(
      404,
    );

    const rootId = (s.deps.db.prepare('SELECT id FROM roots').get() as { id: number }).id;
    const folder = createPlaylist(s.deps.db, s.deps.bus, {
      type: 'folder',
      name: 'Todo',
      rootId,
      folderRelPath: '',
    });
    expect((await s.call('PATCH', `/api/playlists/${folder.id}`, { name: 'X' })).statusCode).toBe(409);
    expect((await s.call('DELETE', `/api/playlists/${folder.id}`)).statusCode).toBe(409);
    expect((await s.call('DELETE', `/api/playlists/${folder.id}/tracks/${s.ids[0]}`)).statusCode).toBe(409);
  });
});
