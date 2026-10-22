import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { PairRequestSchema, type AudioFormat, type PairResponse } from '@dsmn/shared';
import type { FastifyInstance } from 'fastify';
import { getRevision } from '../db/meta.ts';
import { buildCatalog } from '../library/catalog.ts';
import type { AppDeps } from './app.ts';
import { HttpError, parseBody } from './errors.ts';
import { parseRange } from './range.ts';

const CONTENT_TYPES: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
};

interface FileRow {
  rel_path: string;
  format: AudioFormat;
  path: string;
  status: 'online' | 'offline';
}

export function deviceRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, pairing } = deps;

  app.post('/api/pair', { config: { access: 'public' } }, async (req): Promise<PairResponse> => {
    const body = parseBody(PairRequestSchema, req.body);
    const result = pairing.redeem(body.code, body.deviceName);
    if (!result) throw new HttpError(401, 'unauthorized', 'Código inválido o vencido');
    return { token: result.token, serverId: deps.serverId, serverName: deps.serverName };
  });

  app.get('/api/catalog', { config: { access: 'device' } }, async (req, reply) => {
    const etag = `"${getRevision(db)}"`;
    reply.header('etag', etag);
    if (req.headers['if-none-match'] === etag) return reply.status(304).send();
    return buildCatalog(db, deps.serverId);
  });

  app.get<{ Params: { id: string } }>(
    '/api/tracks/:id/file',
    { config: { access: 'device' } },
    async (req, reply) => {
      const row = db
        .prepare(
          `SELECT t.rel_path, t.format, r.path, r.status FROM tracks t JOIN roots r ON r.id = t.root_id
           WHERE t.id = ?`,
        )
        .get(req.params.id) as FileRow | undefined;
      if (!row) throw new HttpError(404, 'not_found', 'Canción inexistente');
      const file = join(row.path, ...row.rel_path.split('/'));
      let size: number;
      try {
        if (row.status === 'offline') throw new Error('offline');
        size = statSync(file).size;
      } catch {
        throw new HttpError(409, 'conflict', 'El archivo no está disponible ahora');
      }

      reply.header('accept-ranges', 'bytes').header('content-type', CONTENT_TYPES[row.format]);
      const range = parseRange(req.headers.range, size);
      if (range === 'invalid') {
        reply.header('content-range', `bytes */${size}`);
        throw new HttpError(416, 'range_not_satisfiable', 'Rango inválido');
      }
      if (!range) {
        reply.header('content-length', size);
        return reply.send(createReadStream(file));
      }
      reply
        .status(206)
        .header('content-range', `bytes ${range.start}-${range.end}/${size}`)
        .header('content-length', range.end - range.start + 1);
      return reply.send(createReadStream(file, { start: range.start, end: range.end }));
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/covers/:id',
    { config: { access: 'device' } },
    async (req, reply) => {
      const row = db.prepare('SELECT mime FROM covers WHERE id = ?').get(req.params.id) as
        { mime: string } | undefined;
      if (!row) throw new HttpError(404, 'not_found', 'Portada inexistente');
      reply.header('content-type', row.mime).header('cache-control', 'public, max-age=31536000, immutable');
      return reply.send(createReadStream(join(deps.config.coversDir, req.params.id)));
    },
  );
}
