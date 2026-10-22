import { describe, expect, it } from 'vitest';
import { ServerError } from '../src/core/http.ts';
import { pairManually, pairWithQr, parseQr, pickReachableUrl } from '../src/core/pairing.ts';
import { fakeFetch } from './helpers.ts';

const DEAD = 'http://172.20.0.1:4747';
const LIVE = 'http://192.168.1.10:4747';
const pairOk = { status: 200, body: { token: 'tok', serverId: 'srv', serverName: 'PC' } };

describe('vinculación', () => {
  it('pickReachableUrl no espera a las URLs muertas', async () => {
    const fetch = fakeFetch({
      [`GET ${DEAD}/api/catalog`]: 'hang',
      [`GET ${LIVE}/api/catalog`]: { status: 401 },
    });
    const t0 = Date.now();
    expect(await pickReachableUrl([DEAD, LIVE], fetch, 3000)).toBe(LIVE);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('pickReachableUrl devuelve null si ninguna responde', async () => {
    expect(await pickReachableUrl([DEAD], fakeFetch({ [`GET ${DEAD}/api/catalog`]: 'hang' }), 50)).toBeNull();
  });

  it('pairWithQr canjea el código en la URL alcanzable', async () => {
    const fetch = fakeFetch({
      [`GET ${DEAD}/api/catalog`]: 'fail',
      [`GET ${LIVE}/api/catalog`]: { status: 401 },
      [`POST ${LIVE}/api/pair`]: pairOk,
    });
    const server = await pairWithQr(
      { v: 1, serverId: 'srv', urls: [DEAD, LIVE], code: 'ABC234' },
      'Pixel',
      fetch,
    );
    expect(server).toEqual({ serverId: 'srv', name: 'PC', url: LIVE, token: 'tok' });
    expect(fetch.calls.find((c) => c.method === 'POST')?.body).toEqual({
      code: 'ABC234',
      deviceName: 'Pixel',
    });
  });

  it('pairWithQr sin servidor alcanzable → mensaje claro', async () => {
    await expect(
      pairWithQr({ v: 1, serverId: 'srv', urls: [DEAD], code: 'X' }, 'Pixel', fakeFetch({})),
    ).rejects.toThrow('No se encuentra el servidor');
  });

  it('pairManually normaliza la dirección', async () => {
    for (const address of [
      '192.168.1.10',
      '192.168.1.10:4747',
      'http://192.168.1.10:4747/',
      ' 192.168.1.10 ',
    ]) {
      const fetch = fakeFetch({ [`POST ${LIVE}/api/pair`]: pairOk });
      expect((await pairManually(address, 'abc234', 'Pixel', fetch)).url).toBe(LIVE);
      expect(fetch.calls[0]?.body).toEqual({ code: 'ABC234', deviceName: 'Pixel' });
    }
  });

  it('código inválido → ServerError con el mensaje del servidor', async () => {
    const fetch = fakeFetch({
      [`POST ${LIVE}/api/pair`]: {
        status: 401,
        body: { error: { code: 'unauthorized', message: 'Código inválido o vencido' } },
      },
    });
    const err = await pairManually('192.168.1.10', 'NOPE', 'Pixel', fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as Error).message).toBe('Código inválido o vencido');
  });

  it('parseQr acepta el QR del servidor y rechaza otros', () => {
    expect(parseQr(JSON.stringify({ v: 1, serverId: 's', urls: [LIVE], code: 'C' }))).toMatchObject({
      code: 'C',
    });
    expect(parseQr('https://example.com')).toBeNull();
    expect(parseQr('{"v":2}')).toBeNull();
  });
});
