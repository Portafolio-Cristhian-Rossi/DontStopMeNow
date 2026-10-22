import { MDNS_SERVICE_TYPE } from '@dsmn/shared';
import Zeroconf, { type Service } from 'react-native-zeroconf';
import type { Discovery } from '../core/types.ts';

type Found = { serverId: string; name: string; url: string };

/**
 * Escucha anuncios mDNS (_dontstopmenow._tcp) hasta `timeoutMs` o hasta que `onFound` devuelva true.
 * Los errores de un servicio puntual se ignoran: la búsqueda termina por tiempo.
 */
function browse(timeoutMs: number, onFound: (found: Found) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const zeroconf = new Zeroconf();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      zeroconf.stop();
      zeroconf.removeDeviceListeners();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    zeroconf.addListener('resolved', (service: Service) => {
      const ip = service.ipv4[0] ?? service.addresses.find((a) => !a.includes(':'));
      const serverId = service.txt?.id;
      if (!ip || !serverId) return;
      if (onFound({ serverId, name: service.name, url: `http://${ip}:${service.port}` })) finish();
    });
    zeroconf.scan({ type: MDNS_SERVICE_TYPE, protocol: 'tcp', domain: 'local.' });
  });
}

export function createDiscovery(): Discovery {
  return {
    async find(serverId, timeoutMs) {
      let url: string | null = null;
      await browse(timeoutMs, (found) => {
        if (found.serverId !== serverId) return false;
        url = found.url;
        return true;
      });
      return url;
    },
    async list(timeoutMs) {
      const servers = new Map<string, Found>();
      await browse(timeoutMs, (found) => {
        servers.set(found.serverId, found);
        return false;
      });
      return [...servers.values()];
    },
  };
}
