import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { getLanUrls, startupMessage } from '../../src/net/lanUrls.ts';

const iface = (address: string, family: 'IPv4' | 'IPv6', internal: boolean) =>
  ({ address, family, internal }) as NetworkInterfaceInfo;

describe('getLanUrls', () => {
  it('filtra IPs privadas IPv4', () => {
    expect(
      getLanUrls(4747, {
        lo: [iface('127.0.0.1', 'IPv4', true)],
        eth: [iface('192.168.1.20', 'IPv4', false), iface('fe80::1', 'IPv6', false)],
        wifi: [iface('10.0.0.5', 'IPv4', false), iface('172.20.1.1', 'IPv4', false)],
        vpn: [iface('100.64.0.2', 'IPv4', false), iface('172.32.0.1', 'IPv4', false)],
      }),
    ).toEqual(['http://192.168.1.20:4747', 'http://10.0.0.5:4747', 'http://172.20.1.1:4747']);
  });

  it('sin IPs privadas usa cualquier IPv4 no interna salvo link-local', () => {
    expect(
      getLanUrls(4747, { eth: [iface('100.64.0.2', 'IPv4', false), iface('169.254.3.4', 'IPv4', false)] }),
    ).toEqual(['http://100.64.0.2:4747']);
    expect(getLanUrls(4747, { lo: [iface('127.0.0.1', 'IPv4', true)] })).toEqual([]);
  });
});

describe('startupMessage', () => {
  it('indica abrir localhost en la compu y deja las IPs para el celular', () => {
    const msg = startupMessage(4747, ['http://192.168.1.20:4747']);
    expect(msg.split('\n')[0]).toBe('Abrí http://localhost:4747 en esta compu para gestionar tu música.');
    expect(msg).toContain('Direcciones para el celular:\n  http://192.168.1.20:4747');
  });
  it('avisa si no hay red local', () => {
    expect(startupMessage(4747, [])).toContain('No se detectó una red local');
  });
});
