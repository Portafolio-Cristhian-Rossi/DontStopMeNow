import { describe, expect, it } from 'vitest';
import { REMOTE, makeApp } from '../helpers/app.ts';
import { enc, makeLibrary } from '../helpers/fixtures.ts';

describe('interfaz web', () => {
  it('sirve index.html, assets y el fallback de la SPA', async () => {
    const webDir = await makeLibrary({
      'index.html': enc('<div id="root"></div>'),
      'assets/app.js': enc('console.log(1)'),
    });
    const { app } = await makeApp({ webDir });
    expect((await app.inject({ url: '/' })).body).toContain('id="root"');
    expect((await app.inject({ url: '/assets/app.js' })).headers['content-type']).toContain('javascript');
    const deep = await app.inject({ url: '/listas/abc' });
    expect(deep.statusCode).toBe(200);
    expect(deep.headers['content-type']).toContain('text/html');
    expect(deep.body).toContain('id="root"');
    const api = await app.inject({ url: '/api/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe('not_found');
  });

  it('la web no se sirve a la red', async () => {
    const webDir = await makeLibrary({ 'index.html': enc('x') });
    const { app } = await makeApp({ webDir });
    expect((await app.inject({ url: '/', remoteAddress: REMOTE })).statusCode).toBe(403);
    expect((await app.inject({ url: '/listas/abc', remoteAddress: REMOTE })).statusCode).toBe(403);
  });

  it('sin compilar muestra cómo compilar', async () => {
    const { app } = await makeApp();
    const r = await app.inject({ url: '/' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('npm run build -w @dsmn/web');
  });
});
