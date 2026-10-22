import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { QrPayloadSchema } from '@dsmn/shared';
import { describe, expect, it, vi } from 'vitest';
import { bumpRevision } from '../../src/library/revision.ts';
import { makeApp } from '../helpers/app.ts';
import { makeLibrary } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(marker)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  // incluir la línea de datos que sigue al marcador
  while (!/\n\n$/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe('rutas de gestión', () => {
  it('flujo de raíz: agregar escanea y aparece en el catálogo', async () => {
    const { app, deps } = await makeApp();
    const onRootsChanged = vi.fn();
    deps.onRootsChanged = onRootsChanged;
    const libDir = await makeLibrary({ 'a.mp3': makeMp3({ title: 'a' }), 'b.mp3': makeMp3({ title: 'b' }) });
    const r = await app.inject({ method: 'POST', url: '/api/admin/roots', payload: { path: libDir } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ path: libDir, status: 'online' });
    await vi.waitFor(async () =>
      expect((await app.inject({ url: '/api/catalog' })).json().tracks).toHaveLength(2),
    );
    expect(onRootsChanged).toHaveBeenCalledTimes(1);

    expect((await app.inject({ url: '/api/admin/roots' })).json()).toHaveLength(1);
    const del = await app.inject({ method: 'DELETE', url: `/api/admin/roots/${r.json().id}` });
    expect(del.statusCode).toBe(204);
    expect(onRootsChanged).toHaveBeenCalledTimes(2);
    expect((await app.inject({ url: '/api/catalog' })).json().tracks).toHaveLength(0);
  });

  it('cuerpo inválido → 400', async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: 'POST', url: '/api/admin/playlists', payload: { type: 'manual' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('bad_request');
  });

  it('CRUD de listas', async () => {
    const { app, deps } = await makeApp();
    const libDir = await makeLibrary({ 'a.mp3': makeMp3({ title: 'a' }), 'b.mp3': makeMp3({ title: 'b' }) });
    await app.inject({ method: 'POST', url: '/api/admin/roots', payload: { path: libDir } });
    await vi.waitFor(() => expect(deps.scanner.status()).toMatchObject({ running: false, total: 2 }));
    const ids = (await app.inject({ url: '/api/catalog' })).json().tracks.map((t: { id: string }) => t.id);

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/playlists',
      payload: { type: 'manual', name: 'Gym', trackIds: ids },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/playlists/${id}`,
      payload: { trackIds: [...ids].reverse() },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().trackIds).toEqual([...ids].reverse());
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/playlists/${id}` })).statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'PATCH', url: `/api/admin/playlists/${id}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
  });

  it('browse, scan e issues', async () => {
    const { app } = await makeApp();
    const libDir = await makeLibrary({
      'Rock/x.mp3': makeMp3({}),
      'roto.mp3': new TextEncoder().encode('no'),
    });
    await mkdir(join(libDir, 'Jazz'));
    const root = (
      await app.inject({ method: 'POST', url: '/api/admin/roots', payload: { path: libDir } })
    ).json();
    const b = await app.inject({ url: `/api/admin/browse?rootId=${root.id}` });
    expect(b.json()).toEqual({ rootId: root.id, path: '', folders: ['Jazz', 'Rock'] });
    expect((await app.inject({ method: 'POST', url: '/api/admin/scan' })).statusCode).toBe(202);
    await vi.waitFor(async () =>
      expect((await app.inject({ url: '/api/admin/issues' })).json()).toEqual([
        { path: join(libDir, 'roto.mp3'), error: expect.any(String), detectedAt: expect.any(Number) },
      ]),
    );
  });

  it('pairing-code devuelve un QR válido', async () => {
    const { app, deps } = await makeApp();
    const r = (await app.inject({ method: 'POST', url: '/api/admin/pairing-code' })).json();
    expect(QrPayloadSchema.parse(JSON.parse(r.qrPayload))).toEqual({
      v: 1,
      serverId: deps.serverId,
      urls: ['http://192.168.1.10:4747'],
      code: r.code,
    });
    expect(r.expiresAt).toBeGreaterThan(Date.now());
  });

  it('pairing-code sin red local → 409', async () => {
    const { app, deps } = await makeApp();
    deps.lanUrls = () => [];
    const r = await app.inject({ method: 'POST', url: '/api/admin/pairing-code' });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.message).toBe('La compu no está conectada a una red local');
  });

  it('revocar dispositivo', async () => {
    const { app, deps } = await makeApp();
    const { deviceId } = deps.pairing.redeem(deps.pairing.createCode().code, 'Pixel')!;
    expect((await app.inject({ url: '/api/admin/devices' })).json()).toMatchObject([
      { id: deviceId, name: 'Pixel' },
    ]);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/devices/${deviceId}` })).statusCode).toBe(
      204,
    );
    expect((await app.inject({ url: '/api/admin/devices' })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/devices/${deviceId}` })).statusCode).toBe(
      404,
    );
  });

  it('SSE envía estado inicial y cambios de revisión', async () => {
    const { app, deps } = await makeApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/events`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const first = await readUntil(reader, 'event: revision');
    expect(first).toContain('event: scan');
    expect(first).toMatch(/"revision":0/);
    bumpRevision(deps.db, deps.bus);
    expect(await readUntil(reader, 'event: revision')).toMatch(/"revision":1/);
    await reader.cancel();
  });
});
