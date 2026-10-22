import { describe, expect, it } from 'vitest';
import { ServerUnreachableError, UnauthorizedError, createServerClient } from '../src/core/http.ts';
import { fakeFetch, makeCatalog } from './helpers.ts';

const BASE = 'http://192.168.1.10:4747';

describe('ServerClient', () => {
  it('trae el catálogo con su ETag y manda el token', async () => {
    const fetch = fakeFetch({
      [`GET ${BASE}/api/catalog`]: { status: 200, body: makeCatalog(), headers: { ETag: '"3"' } },
    });
    const client = createServerClient({ baseUrl: BASE, token: 'tok', fetch });
    const r = await client.catalog();
    expect(r).toMatchObject({ notModified: false, etag: '"3"', catalog: { serverId: 'srv' } });
    expect(fetch.calls[0]?.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('304 → notModified y manda If-None-Match', async () => {
    const fetch = fakeFetch({ [`GET ${BASE}/api/catalog`]: { status: 304 } });
    const client = createServerClient({ baseUrl: BASE, token: 'tok', fetch });
    expect(await client.catalog('"3"')).toEqual({ notModified: true });
    expect(fetch.calls[0]?.headers).toMatchObject({ 'If-None-Match': '"3"' });
  });

  it('401 → UnauthorizedError; sin red → ServerUnreachableError; timeout → ServerUnreachableError', async () => {
    const unauthorized = createServerClient({
      baseUrl: BASE,
      token: 't',
      fetch: fakeFetch({
        [`GET ${BASE}/api/catalog`]: { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } },
      }),
    });
    await expect(unauthorized.catalog()).rejects.toBeInstanceOf(UnauthorizedError);
    const down = createServerClient({ baseUrl: BASE, token: 't', fetch: fakeFetch({}) });
    await expect(down.catalog()).rejects.toBeInstanceOf(ServerUnreachableError);
    const slow = createServerClient({
      baseUrl: BASE,
      token: 't',
      timeoutMs: 50,
      fetch: fakeFetch({ [`GET ${BASE}/api/catalog`]: 'hang' }),
    });
    await expect(slow.catalog()).rejects.toBeInstanceOf(ServerUnreachableError);
  });

  it('rechaza un catálogo con forma inválida', async () => {
    const client = createServerClient({
      baseUrl: BASE,
      token: 't',
      fetch: fakeFetch({ [`GET ${BASE}/api/catalog`]: { status: 200, body: { nope: true } } }),
    });
    await expect(client.catalog()).rejects.toThrow();
  });

  it('trackUrl y authHeaders', () => {
    const client = createServerClient({ baseUrl: BASE, token: 'tok', fetch: fakeFetch({}) });
    expect(client.trackUrl('a b')).toBe(`${BASE}/api/tracks/a%20b/file`);
    expect(client.authHeaders()).toEqual({ Authorization: 'Bearer tok' });
  });
});
