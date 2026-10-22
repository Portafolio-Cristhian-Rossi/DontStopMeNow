import { describe, expect, it, vi } from 'vitest';
import { resolveServerUrl } from '../src/core/discovery.ts';
import { fakeFetch } from './helpers.ts';

const server = { serverId: 'srv', name: 'PC', url: 'http://192.168.1.10:4747', token: 't' };

describe('resolveServerUrl', () => {
  it('usa la URL guardada si responde', async () => {
    const discovery = { find: vi.fn() };
    const fetch = fakeFetch({ 'GET http://192.168.1.10:4747/api/catalog': { status: 401 } });
    expect(await resolveServerUrl(server, { fetch, discovery })).toBe(server.url);
    expect(discovery.find).not.toHaveBeenCalled();
  });

  it('usa mDNS cuando cambió la IP', async () => {
    const discovery = { find: vi.fn(async () => 'http://192.168.1.77:4747') };
    const fetch = fakeFetch({
      'GET http://192.168.1.10:4747/api/catalog': 'fail',
      'GET http://192.168.1.77:4747/api/catalog': { status: 401 },
    });
    expect(await resolveServerUrl(server, { fetch, discovery })).toBe('http://192.168.1.77:4747');
    expect(discovery.find).toHaveBeenCalledWith('srv', 5000);
  });

  it('null si no lo encuentra', async () => {
    const discovery = { find: vi.fn(async () => null) };
    expect(await resolveServerUrl(server, { fetch: fakeFetch({}), discovery })).toBeNull();
  });
});
