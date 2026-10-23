import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { sanitizeFolderName, type DownloadEvent, type DownloadJob, type EnqueueRequest } from '@dsmn/shared';
import type { EventBus } from '../events.ts';
import { HttpError } from '../http/errors.ts';
import { resolveRelDir } from '../library/paths.ts';
import { createPlaylist } from '../library/playlists.ts';
import type { Scanner } from '../scan/scanner.ts';
import { buildDownloadArgs, numberWidthFor } from './recipe.ts';
import {
  createSource,
  findSourceByPlaylistId,
  getJob,
  getSource,
  insertJob,
  nextRunnableJob,
  setItem,
  setJobStatus,
  setSourcePlaylist,
  type StoredJob,
} from './store.ts';
import type { DownloadProgress, YtDlp } from './ytdlp.ts';

/** Pausa después de cada canción bajada, como el --sleep-interval 5 de la receta. */
const PAUSE_MS = 5000;
/** Como mucho un evento de progreso cada 250 ms por trabajo. */
const PROGRESS_EVERY_MS = 250;

export interface DownloadQueue {
  enqueue(req: EnqueueRequest): DownloadJob;
  start(): void;
  stop(): Promise<void>;
  cancel(jobId: number): void;
  resume(jobId: number): void;
  retry(jobId: number): void;
  remove(jobId: number): void;
  /** Hay una canción bajando. */
  busy(): boolean;
  /** Se resuelve cuando no queda trabajo ejecutable. */
  idle(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

export function createDownloadQueue(o: {
  db: DatabaseSync;
  bus: EventBus;
  scanner: Pick<Scanner, 'scanScopes'>;
  ytdlp: () => YtDlp | null;
  ffmpeg: () => boolean;
  tempRoot: string;
  wait?: (ms: number) => Promise<void>;
  log?: (err: unknown, msg: string) => void;
}): DownloadQueue {
  const { db, bus } = o;
  const wait = o.wait ?? sleep;
  const log = o.log ?? (() => {});

  let started = false;
  let loop: Promise<void> | null = null;
  let current: { jobId: number; videoId: string; controller: AbortController } | null = null;
  const lastProgress = new Map<number, number>();

  function emit(jobId: number, now?: { videoId: string; title: string; progress: DownloadProgress }) {
    const job = getJob(db, jobId);
    if (!job) return;
    const event: DownloadEvent = {
      jobId,
      status: job.status,
      done: job.items.filter((i) => i.status === 'done').length,
      failed: job.items.filter((i) => i.status === 'failed').length,
      total: job.items.length,
      current: now
        ? { videoId: now.videoId, title: now.title, stage: now.progress.stage, percent: now.progress.percent }
        : null,
    };
    bus.emit('download', event);
  }

  function emitProgress(jobId: number, videoId: string, title: string, progress: DownloadProgress) {
    const t = Date.now();
    if (t - (lastProgress.get(jobId) ?? 0) < PROGRESS_EVERY_MS) return;
    lastProgress.set(jobId, t);
    emit(jobId, { videoId, title, progress });
  }

  function rootPath(rootId: number): string | undefined {
    const row = db.prepare('SELECT path FROM roots WHERE id = ?').get(rootId) as { path: string } | undefined;
    return row?.path;
  }

  /** Al terminar: escanea la carpeta y, si es una playlist sin lista, crea su lista de carpeta. */
  async function finish(job: StoredJob) {
    if (!getJob(db, job.id)!.items.some((i) => i.status === 'done')) return;
    try {
      await o.scanner.scanScopes([{ rootId: job.rootId, relDir: job.folder }]);
    } catch (err) {
      log(err, 'No se pudo escanear lo descargado');
    }
    const source = job.sourceId === null ? undefined : getSource(db, job.sourceId);
    if (source && !source.playlistId) {
      try {
        const playlist = createPlaylist(db, bus, {
          type: 'folder',
          name: source.title.slice(0, 100),
          rootId: source.rootId,
          folderRelPath: source.folder,
        });
        setSourcePlaylist(db, source.id, playlist.id);
      } catch (err) {
        log(err, 'No se pudo crear la lista de la playlist');
      }
    }
  }

  async function runJob(job: StoredJob) {
    const ytdlp = o.ytdlp();
    const base = rootPath(job.rootId);
    const dest = base === undefined ? null : resolveRelDir(base, job.folder);
    if (!ytdlp || !dest) {
      setJobStatus(
        db,
        job.id,
        'paused',
        ytdlp ? 'La carpeta de destino no existe' : 'Configurá yt-dlp en Ajustes',
      );
      emit(job.id);
      return;
    }
    setJobStatus(db, job.id, 'running');
    emit(job.id);
    const tempDir = path.join(o.tempRoot, String(job.id));
    mkdirSync(dest.abs, { recursive: true });
    mkdirSync(tempDir, { recursive: true });

    for (const item of job.items) {
      if (item.status !== 'pending') continue;
      setItem(db, job.id, item.videoId, { status: 'downloading', error: null });
      emit(job.id, { videoId: item.videoId, title: item.title, progress: { stage: 'download', percent: 0 } });
      const controller = new AbortController();
      current = { jobId: job.id, videoId: item.videoId, controller };
      try {
        const args = buildDownloadArgs({
          videoUrl: videoUrl(item.videoId),
          destDir: dest.abs,
          tempDir,
          position: item.position,
          numberWidth: job.numberWidth,
        });
        const { filePath } = await ytdlp.downloadOne(
          args,
          (p) => emitProgress(job.id, item.videoId, item.title, p),
          controller.signal,
        );
        setItem(db, job.id, item.videoId, { status: 'done', filePath });
        emit(job.id);
        await wait(PAUSE_MS);
      } catch (err) {
        setItem(db, job.id, item.videoId, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        emit(job.id);
      } finally {
        current = null;
      }
    }

    await finish(job);
    setJobStatus(db, job.id, 'done');
    rmSync(tempDir, { recursive: true, force: true });
    lastProgress.delete(job.id);
    emit(job.id);
  }

  async function run() {
    for (let job = nextRunnableJob(db); job && started; job = nextRunnableJob(db)) {
      await runJob(job);
    }
  }

  function kick() {
    if (!started || loop) return;
    loop = run()
      .catch((err) => log(err, 'Falló la cola de descargas'))
      .finally(() => {
        loop = null;
        // Algo encolado justo cuando el bucle salía.
        if (started && nextRunnableJob(db)) kick();
      });
  }

  /** Subcarpeta como un solo nombre válido; vacía = directo en la carpeta de música. */
  function folderFor(req: EnqueueRequest): string {
    const raw = req.folder.trim();
    if (raw === '') return req.kind === 'playlist' ? sanitizeFolderName(req.title) : '';
    return sanitizeFolderName(raw);
  }

  const pending = () => {
    throw new Error('pendiente');
  };

  return {
    enqueue(req) {
      if (!o.ytdlp()) throw new HttpError(409, 'conflict', 'Configurá yt-dlp en Ajustes');
      if (!o.ffmpeg()) throw new HttpError(409, 'conflict', 'No se encontró ffmpeg');
      const base = rootPath(req.rootId);
      if (base === undefined) throw new HttpError(404, 'not_found', 'Carpeta raíz inexistente');
      const resolved = resolveRelDir(base, folderFor(req));
      if (!resolved) throw new HttpError(400, 'bad_request', 'La carpeta debe estar dentro de la raíz');

      let sourceId: number | null = null;
      if (req.kind === 'playlist' && req.ytPlaylistId) {
        const existing = findSourceByPlaylistId(db, req.ytPlaylistId);
        if (existing && (existing.rootId !== req.rootId || existing.folder !== resolved.rel)) {
          const where = path.join(rootPath(existing.rootId) ?? '', ...existing.folder.split('/'));
          throw new HttpError(409, 'conflict', `Esta playlist ya se baja en ${where}`);
        }
        sourceId = (
          existing ??
          createSource(db, {
            url: req.url,
            ytPlaylistId: req.ytPlaylistId,
            title: req.title,
            rootId: req.rootId,
            folder: resolved.rel,
          })
        ).id;
      }

      const job = insertJob(db, {
        sourceId,
        url: req.url,
        title: req.title,
        rootId: req.rootId,
        folder: resolved.rel,
        numberWidth: numberWidthFor(req.playlistSize),
        items: req.items,
      });
      emit(job.id);
      kick();
      return job;
    },

    start() {
      started = true;
      kick();
    },

    async stop() {
      started = false;
      current?.controller.abort();
      await loop;
    },

    cancel: pending,
    resume: pending,
    retry: pending,
    remove: pending,

    busy: () => current !== null,

    async idle() {
      while (loop) await loop;
    },
  };
}
