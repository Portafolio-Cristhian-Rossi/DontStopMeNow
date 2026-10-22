import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { notFoundHandler } from './errors.ts';

const NOT_BUILT = 'La interfaz web no está compilada. Ejecutá: npm run build -w @dsmn/web';

/**
 * Sirve la web compilada. Las rutas de la SPA (/listas/abc, …) devuelven index.html para que
 * recargar la página funcione; los /api/* inexistentes siguen dando el 404 en JSON.
 */
export function registerStatic(app: FastifyInstance, webDir: string | null): void {
  if (!webDir) {
    app.get('/', async (_req, reply) => reply.type('text/plain; charset=utf-8').send(NOT_BUILT));
    app.setNotFoundHandler(notFoundHandler);
    return;
  }
  app.register(fastifyStatic, { root: webDir, wildcard: false, index: 'index.html' });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.type('text/html; charset=utf-8').sendFile('index.html');
    }
    return notFoundHandler(req, reply);
  });
}
