import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { getLanUrls } from '../../src/net/lanUrls.ts';

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
});
