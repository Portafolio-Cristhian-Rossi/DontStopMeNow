import type { FastifyRequest } from 'fastify';
import type { Pairing } from '../pairing/pairing.ts';
import { HttpError } from './errors.ts';

export type Access = 'public' | 'device' | 'admin';

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
}

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalAddress(ip: string): boolean {
  return LOCAL.has(ip);
}

/** Hostname de un header Host (`localhost:4747`, `[::1]:4747`, `localhost`). */
function hostname(host: string): string {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0] ?? '';
}

/**
 * Desde la propia compu se permite todo (la web de gestión), siempre que el Host sea local: así una
 * página externa que resuelva a 127.0.0.1 (DNS rebinding) no puede usar la API. Desde la red solo
 * las rutas públicas y las de dispositivo con token; cualquier otra ruta se trata como de gestión.
 */
export function authHook(pairing: Pairing) {
  return async (req: FastifyRequest) => {
    if (isLocalAddress(req.socket.remoteAddress ?? '')) {
      const host = req.headers.host;
      if (host !== undefined && !LOCAL_HOSTNAMES.has(hostname(host).toLowerCase())) {
        throw new HttpError(403, 'forbidden', 'Host no permitido');
      }
      return;
    }
    const access = req.url.startsWith('/api/admin') ? 'admin' : (req.routeOptions.config?.access ?? 'admin');
    if (access === 'public') return;
    if (access === 'admin') {
      throw new HttpError(403, 'forbidden', 'Solo disponible desde la compu del servidor');
    }
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !pairing.verifyToken(token)) {
      throw new HttpError(401, 'unauthorized', 'Dispositivo no vinculado');
    }
  };
}
