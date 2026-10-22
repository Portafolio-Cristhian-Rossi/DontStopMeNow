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

export function isLocalAddress(ip: string): boolean {
  return LOCAL.has(ip);
}

/**
 * Desde la propia compu se permite todo (la web de gestión). Desde la red solo las rutas
 * públicas y las de dispositivo con un token válido.
 */
export function authHook(pairing: Pairing) {
  return async (req: FastifyRequest) => {
    if (isLocalAddress(req.socket.remoteAddress ?? '')) return;
    const access = req.url.startsWith('/api/admin') ? 'admin' : req.routeOptions.config?.access;
    if (!access || access === 'public') return;
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
