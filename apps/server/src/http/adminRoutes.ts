import {
  AddRootRequestSchema,
  CreatePlaylistRequestSchema,
  QrPayloadSchema,
  UpdatePlaylistRequestSchema,
  type PairingCodeResponse,
  type QrPayload,
  type ScanIssue,
} from '@dsmn/shared';
import type { FastifyInstance } from 'fastify';
import { getRevision } from '../db/meta.ts';
import type { BusEvents } from '../events.ts';
import { createPlaylist, deletePlaylist, updatePlaylist } from '../library/playlists.ts';
import { addRoot, browse, listRoots, removeRoot } from '../library/roots.ts';
import type { AppDeps } from './app.ts';
import { HttpError, parseBody } from './errors.ts';

const admin = { config: { access: 'admin' as const } };
const PING_MS = 25_000;

type IdParams = { Params: { id: string } };

function intParam(value: string | undefined, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, 'bad_request', `${name} inválido`);
  return n;
}

export function adminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, bus, scanner, pairing } = deps;

  const scanInBackground = (job: Promise<unknown>) => {
    job.catch((err) => app.log.error(err, 'Falló el escaneo'));
  };

  app.get('/api/admin/roots', admin, async () => listRoots(db));

  app.post('/api/admin/roots', admin, async (req, reply) => {
    const { path } = parseBody(AddRootRequestSchema, req.body);
    const root = addRoot(db, bus, path);
    deps.onRootsChanged?.();
    scanInBackground(scanner.scanScopes([{ rootId: root.id, relDir: '' }]));
    return reply.status(201).send(root);
  });

  app.delete<IdParams>('/api/admin/roots/:id', admin, async (req, reply) => {
    removeRoot(db, bus, intParam(req.params.id, 'id'));
    deps.onRootsChanged?.();
    return reply.status(204).send();
  });

  app.get<{ Querystring: { rootId?: string; path?: string } }>('/api/admin/browse', admin, async (req) =>
    browse(db, intParam(req.query.rootId, 'rootId'), req.query.path ?? ''),
  );

  app.post('/api/admin/scan', admin, async (_req, reply) => {
    scanInBackground(scanner.scanAll());
    return reply.status(202).send({ started: true });
  });

  app.get('/api/admin/issues', admin, async (): Promise<ScanIssue[]> => {
    const rows = db.prepare('SELECT path, error, detected_at FROM scan_issues ORDER BY path').all() as {
      path: string;
      error: string;
      detected_at: number;
    }[];
    return rows.map((r) => ({ path: r.path, error: r.error, detectedAt: r.detected_at }));
  });

  app.post('/api/admin/playlists', admin, async (req, reply) => {
    const body = parseBody(CreatePlaylistRequestSchema, req.body);
    return reply.status(201).send(createPlaylist(db, bus, body));
  });

  app.patch<IdParams>('/api/admin/playlists/:id', admin, async (req) =>
    updatePlaylist(db, bus, req.params.id, parseBody(UpdatePlaylistRequestSchema, req.body)),
  );

  app.delete<IdParams>('/api/admin/playlists/:id', admin, async (req, reply) => {
    deletePlaylist(db, bus, req.params.id);
    return reply.status(204).send();
  });

  app.post('/api/admin/pairing-code', admin, async (): Promise<PairingCodeResponse> => {
    const urls = deps.lanUrls();
    if (urls.length === 0) throw new HttpError(409, 'conflict', 'La compu no está conectada a una red local');
    const { code, expiresAt } = pairing.createCode();
    const payload: QrPayload = QrPayloadSchema.parse({ v: 1, serverId: deps.serverId, urls, code });
    return { code, expiresAt, qrPayload: JSON.stringify(payload) };
  });

  app.get('/api/admin/devices', admin, async () => pairing.listDevices());

  app.delete<IdParams>('/api/admin/devices/:id', admin, async (req, reply) => {
    if (!pairing.revokeDevice(req.params.id))
      throw new HttpError(404, 'not_found', 'Dispositivo inexistente');
    return reply.status(204).send();
  });

  app.get('/api/admin/events', admin, (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = <K extends keyof BusEvents>(event: K, data: BusEvents[K]) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const onScan = (s: BusEvents['scan']) => send('scan', s);
    const onRevision = (r: BusEvents['revision']) => send('revision', r);

    send('scan', scanner.status());
    send('revision', { revision: getRevision(db) });
    bus.on('scan', onScan);
    bus.on('revision', onRevision);
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);

    req.raw.on('close', () => {
      clearInterval(ping);
      bus.off('scan', onScan);
      bus.off('revision', onRevision);
    });
  });
}
