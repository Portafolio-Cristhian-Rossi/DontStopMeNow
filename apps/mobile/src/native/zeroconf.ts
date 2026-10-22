import { MDNS_SERVICE_TYPE } from '@dsmn/shared';
import Zeroconf from 'react-native-zeroconf';
import type { Discovery } from '../core/types.ts';

/** Busca el servidor por mDNS (_dontstopmenow._tcp) y lo reconoce por su serverId. */
export function createDiscovery(): Discovery {
  return {
    find(serverId, timeoutMs) {
      return new Promise((resolve) => {
        const zeroconf = new Zeroconf();
        let done = false;
        const finish = (url: string | null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          zeroconf.stop();
          zeroconf.removeDeviceListeners();
          resolve(url);
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        zeroconf.addListener('resolved', (service) => {
          const ip = service.ipv4[0] ?? service.addresses.find((a) => !a.includes(':'));
          if (service.txt?.id === serverId && ip) finish(`http://${ip}:${service.port}`);
        });
        zeroconf.addListener('error', () => finish(null));
        zeroconf.scan({ type: MDNS_SERVICE_TYPE, protocol: 'tcp', domain: 'local.' });
      });
    },
  };
}
