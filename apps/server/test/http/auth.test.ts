import { describe, expect, it } from 'vitest';
import { REMOTE, makeApp } from '../helpers/app.ts';

describe('autenticación', () => {
  it('pedido local con Host ajeno → 403 (DNS rebinding)', async () => {
    const { app } = await makeApp();
    const get = (host: string) => app.inject({ url: '/api/admin/roots', headers: { host } });
    expect((await get('evil.example:4747')).statusCode).toBe(403);
    expect((await get('localhost:4747')).statusCode).toBe(200);
    expect((await get('127.0.0.1:5173')).statusCode).toBe(200);
    expect((await get('[::1]:4747')).statusCode).toBe(200);
    expect((await get('localhost')).statusCode).toBe(200);
  });

  it('una ruta sin access declarado es solo local', async () => {
    const { app } = await makeApp();
    app.get('/extra', async () => 'ok');
    expect((await app.inject({ url: '/extra', remoteAddress: REMOTE })).statusCode).toBe(403);
    expect((await app.inject({ url: '/extra' })).statusCode).toBe(200);
  });
});
