import { describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/client.ts';
import { fakeServer } from './utils.tsx';

describe('cliente de la API', () => {
  it('convierte errores de la API en ApiRequestError', async () => {
    fakeServer({
      'POST /api/admin/roots': () =>
        new Response(JSON.stringify({ error: { code: 'conflict', message: 'Se superpone' } }), {
          status: 409,
        }),
    });
    await expect(api.addRoot('D:\\M')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'Se superpone',
    });
  });

  it('una respuesta de error sin JSON', async () => {
    fakeServer({ 'GET /api/admin/roots': () => new Response('boom', { status: 502 }) });
    await expect(api.roots()).rejects.toMatchObject({ status: 502, code: 'internal', message: 'Error 502' });
  });

  it('204 devuelve undefined', async () => {
    fakeServer({ 'DELETE /api/admin/roots/3': () => new Response(null, { status: 204 }) });
    await expect(api.removeRoot(3)).resolves.toBeUndefined();
  });

  it('rutas de descargas', async () => {
    const server = fakeServer({
      'POST /api/admin/downloads/preview': () => ({}),
      'POST /api/admin/downloads/jobs/4/cancel': () => ({}),
      'POST /api/admin/downloads/jobs/4/resume': () => ({}),
      'POST /api/admin/downloads/jobs/4/retry': () => ({}),
      'DELETE /api/admin/downloads/jobs/4': () => undefined,
      'POST /api/admin/downloads/sources/2/check': () => ({}),
      'DELETE /api/admin/downloads/sources/2': () => undefined,
      'POST /api/admin/ytdlp/update': () => ({}),
    });
    await api.preview('https://youtu.be/x');
    await api.cancelJob(4);
    await api.resumeJob(4);
    await api.retryJob(4);
    await api.removeJob(4);
    await api.checkSource(2);
    await api.forgetSource(2);
    await api.updateYtdlp();
    expect(server.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/admin/downloads/preview',
      'POST /api/admin/downloads/jobs/4/cancel',
      'POST /api/admin/downloads/jobs/4/resume',
      'POST /api/admin/downloads/jobs/4/retry',
      'DELETE /api/admin/downloads/jobs/4',
      'POST /api/admin/downloads/sources/2/check',
      'DELETE /api/admin/downloads/sources/2',
      'POST /api/admin/ytdlp/update',
    ]);
    expect(server.calls[0]?.body).toEqual({ url: 'https://youtu.be/x' });
  });

  it('error de red', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api.roots()).rejects.toMatchObject({
      status: 0,
      message: 'No se pudo conectar con el servidor',
    });
  });

  it('browse codifica la ruta', async () => {
    const server = fakeServer({
      'GET /api/admin/browse': (_b, url) => ({ rootId: 1, path: url.searchParams.get('path'), folders: [] }),
    });
    await expect(api.browse(1, 'Rock & Roll/Más')).resolves.toMatchObject({ path: 'Rock & Roll/Más' });
    expect(server.calls[0]?.path).toBe('/api/admin/browse');
  });
});
