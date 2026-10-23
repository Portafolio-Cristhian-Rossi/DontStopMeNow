import {
  EnqueueRequestSchema,
  PreviewRequestSchema,
  SetYtDlpPathRequestSchema,
  analyzeEntries,
  type Preview,
  type YtDlpUpdateResponse,
} from '@dsmn/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../http/app.ts';
import { HttpError, intParam, parseBody } from '../http/errors.ts';
import type { DownloadQueue } from './queue.ts';
import type { YtDlpSettings } from './settings.ts';
import {
  deleteSource,
  downloadedVideoIds,
  findSourceByPlaylistId,
  getJob,
  getSource,
  libraryTracks,
  listJobs,
  listSources,
  touchSourceChecked,
} from './store.ts';
import { YtDlpError, type YtDlp } from './ytdlp.ts';

export interface Downloads {
  settings: YtDlpSettings;
  queue: DownloadQueue;
}

const admin = { config: { access: 'admin' as const } };
type IdParams = { Params: { id: string } };

export function downloadRoutes(app: FastifyInstance, deps: AppDeps, downloads: Downloads): void {
  const { db } = deps;
  const { settings, queue } = downloads;
  app.addHook('onClose', () => queue.stop());

  function configured(): YtDlp {
    const ytdlp = settings.current();
    if (!ytdlp) throw new HttpError(409, 'conflict', 'Configurá yt-dlp en Ajustes');
    return ytdlp;
  }

  /** Lee el link con yt-dlp y marca duplicados, lo que ya está en la biblioteca y lo ya bajado. */
  async function preview(url: string): Promise<Preview> {
    const ytdlp = configured();
    let raw;
    try {
      raw = await ytdlp.preview(url);
    } catch (err) {
      if (err instanceof YtDlpError) throw new HttpError(400, 'bad_request', err.message);
      throw err;
    }
    const source = raw.ytPlaylistId ? findSourceByPlaylistId(db, raw.ytPlaylistId) : undefined;
    const downloaded = source ? downloadedVideoIds(db, source.id) : new Set<string>();
    return {
      kind: raw.kind,
      ytPlaylistId: raw.ytPlaylistId,
      title: raw.title,
      url: raw.url,
      playlistSize: raw.entries.length,
      sourceId: source?.id ?? null,
      destination: source ? { rootId: source.rootId, folder: source.folder } : null,
      entries: analyzeEntries(raw.entries, libraryTracks(db), downloaded),
    };
  }

  function existingSource(id: string) {
    const source = getSource(db, intParam(id, 'id'));
    if (!source) throw new HttpError(404, 'not_found', 'Playlist inexistente');
    return source;
  }

  app.get('/api/admin/ytdlp', admin, () => settings.status());

  app.put('/api/admin/ytdlp', admin, (req) =>
    settings.setPath(parseBody(SetYtDlpPathRequestSchema, req.body).path),
  );

  app.post('/api/admin/ytdlp/update', admin, async (): Promise<YtDlpUpdateResponse> => {
    if (queue.busy()) throw new HttpError(409, 'conflict', 'Hay una descarga en curso');
    try {
      return await configured().update();
    } catch (err) {
      if (err instanceof YtDlpError) throw new HttpError(400, 'bad_request', err.message);
      throw err;
    }
  });

  app.post('/api/admin/downloads/preview', admin, (req) =>
    preview(parseBody(PreviewRequestSchema, req.body).url.trim()),
  );

  app.get('/api/admin/downloads/jobs', admin, async () => listJobs(db));

  app.post('/api/admin/downloads/jobs', admin, async (req, reply) =>
    reply.status(201).send(queue.enqueue(parseBody(EnqueueRequestSchema, req.body))),
  );

  for (const action of ['cancel', 'resume', 'retry'] as const) {
    app.post<IdParams>(`/api/admin/downloads/jobs/:id/${action}`, admin, async (req) => {
      const id = intParam(req.params.id, 'id');
      queue[action](id);
      return getJob(db, id);
    });
  }

  app.delete<IdParams>('/api/admin/downloads/jobs/:id', admin, async (req, reply) => {
    queue.remove(intParam(req.params.id, 'id'));
    return reply.status(204).send();
  });

  app.get('/api/admin/downloads/sources', admin, async () => listSources(db));

  app.post<IdParams>('/api/admin/downloads/sources/:id/check', admin, async (req) => {
    const source = existingSource(req.params.id);
    const result = await preview(source.url);
    touchSourceChecked(db, source.id, Date.now());
    return result;
  });

  app.delete<IdParams>('/api/admin/downloads/sources/:id', admin, async (req, reply) => {
    deleteSource(db, existingSource(req.params.id).id);
    return reply.status(204).send();
  });
}
