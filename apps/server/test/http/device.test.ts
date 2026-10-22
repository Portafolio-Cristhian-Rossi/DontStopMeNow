import { rename } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { addRoot } from '../../src/library/roots.ts';
import { REMOTE, makeApp } from '../helpers/app.ts';
import { makeLibrary } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

async function appWithTrack(name = 'a.mp3', picture?: { mime: string; data: Uint8Array }) {
  const { app, deps } = await makeApp();
  const data = makeMp3({ title: 'T' }, { picture });
  const dir = await makeLibrary({ [name]: data });
  addRoot(deps.db, deps.bus, dir);
  await deps.scanner.scanAll();
  const track = (await app.inject({ url: '/api/catalog' })).json().tracks[0];
  return { app, deps, dir, data, track };
}

describe('rutas de dispositivo', () => {
  it('desde la red: catálogo requiere token y admin está prohibido', async () => {
    const { app } = await makeApp();
    expect((await app.inject({ url: '/api/catalog', remoteAddress: REMOTE })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/catalog',
          remoteAddress: REMOTE,
          headers: { authorization: 'Bearer x' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: '/api/admin/devices', remoteAddress: REMOTE })).statusCode).toBe(403);
  });

  it('vinculación completa y catálogo con ETag', async () => {
    const { app, deps } = await makeApp();
    const { code } = deps.pairing.createCode();
    const pair = await app.inject({
      method: 'POST',
      url: '/api/pair',
      remoteAddress: REMOTE,
      payload: { code, deviceName: 'Pixel' },
    });
    expect(pair.statusCode).toBe(200);
    expect(pair.json()).toMatchObject({ serverId: deps.serverId, serverName: 'PC-Test' });
    const auth = { authorization: `Bearer ${pair.json().token}` };
    const cat = await app.inject({ url: '/api/catalog', remoteAddress: REMOTE, headers: auth });
    expect(cat.statusCode).toBe(200);
    expect(cat.json().serverId).toBe(deps.serverId);
    const again = await app.inject({
      url: '/api/catalog',
      remoteAddress: REMOTE,
      headers: { ...auth, 'if-none-match': cat.headers.etag as string },
    });
    expect(again.statusCode).toBe(304);
  });

  it('código inválido → 401 con formato de error', async () => {
    const { app } = await makeApp();
    const r = await app.inject({
      method: 'POST',
      url: '/api/pair',
      remoteAddress: REMOTE,
      payload: { code: 'NOPE', deviceName: 'x' },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
  });

  it('cuerpo inválido en /api/pair → 400', async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: 'POST', url: '/api/pair', payload: { code: 'X' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('bad_request');
  });

  it('sirve el archivo completo y por rangos', async () => {
    const { app, data, track } = await appWithTrack();
    const full = await app.inject({ url: `/api/tracks/${track.id}/file` });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('audio/mpeg');
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(Number(full.headers['content-length'])).toBe(data.length);
    expect(full.rawPayload.equals(Buffer.from(data))).toBe(true);

    const part = await app.inject({ url: `/api/tracks/${track.id}/file`, headers: { range: 'bytes=10-19' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 10-19/${data.length}`);
    expect(part.rawPayload.equals(Buffer.from(data.subarray(10, 20)))).toBe(true);
  });

  it('retomar una descarga completa → 416', async () => {
    const { app, data, track } = await appWithTrack();
    const r = await app.inject({
      url: `/api/tracks/${track.id}/file`,
      headers: { range: `bytes=${data.length}-` },
    });
    expect(r.statusCode).toBe(416);
    expect(r.headers['content-range']).toBe(`bytes */${data.length}`);
  });

  it('id desconocido → 404; raíz offline → 409', async () => {
    const { app, dir, track } = await appWithTrack();
    expect((await app.inject({ url: '/api/tracks/nope/file' })).statusCode).toBe(404);
    await rename(dir, dir + '-x');
    const r = await app.inject({ url: `/api/tracks/${track.id}/file` });
    expect(r.statusCode).toBe(409);
    await rename(dir + '-x', dir);
  });

  it('sirve archivos con nombres Unicode', async () => {
    const { app, track } = await appWithTrack('Canción ñandú.mp3');
    expect((await app.inject({ url: `/api/tracks/${track.id}/file` })).statusCode).toBe(200);
  });

  it('sirve portadas con caché larga', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7, 7]);
    const { app, track } = await appWithTrack('c.mp3', { mime: 'image/png', data: png });
    const r = await app.inject({ url: `/api/covers/${track.coverId}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await app.inject({ url: '/api/covers/nope' })).statusCode).toBe(404);
  });
});
