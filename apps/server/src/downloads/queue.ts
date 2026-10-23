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
  deleteJob,
  findSourceByPlaylistId,
  getJob,
  getSource,
  insertJob,
  nextRunnableJob,
  resetInterrupted,
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
/** Fallas seguidas por límite de YouTube que pausan el trabajo. */
const LIMIT_STREAK = 3;
const RATE_LIMITED = /HTTP Error 429|Sign in to confirm/;
const LIMIT_REASON = 'YouTube está limitando las descargas: esperá un rato o actualizá yt-dlp';
const OFFLINE_REASON = 'La carpeta de destino no está conectada';

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

/** Pausa que se corta antes si se aborta `signal` (apagar el servidor no espera los 5 s). */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

export function createDownloadQueue(o: {
  db: DatabaseSync;
  bus: EventBus;
  scanner: Pick<Scanner, 'scanScopes'>;
  ytdlp: () => YtDlp | null;
  ffmpeg: () => boolean;
  tempRoot: string;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  log?: (err: unknown, msg: string) => void;
  /** Borra una carpeta temporal; en los tests se reemplaza para simular el EBUSY de Windows. */
  removeDir?: (dir: string) => void;
}): DownloadQueue {
  const { db, bus } = o;
  const wait = o.wait ?? sleep;
  const log = o.log ?? (() => {});
  const removeDir = o.removeDir ?? ((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

  /** Si Windows todavía tiene un archivo abierto, se deja: el próximo arranque limpia yt-tmp entero. */
  function removeTemp(dir: string) {
    try {
      removeDir(dir);
    } catch (err) {
      log(err, 'No se pudieron borrar los temporales de la descarga');
    }
  }

  let started = false;
  /** Se aborta en stop(): corta la pausa entre canciones. */
  let stopping = new AbortController();
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

  const tempDirOf = (jobId: number) => path.join(o.tempRoot, String(jobId));

  function pause(jobId: number, reason: string) {
    setJobStatus(db, jobId, 'paused', reason);
    emit(jobId);
  }

  async function runJob(job: StoredJob) {
    const ytdlp = o.ytdlp();
    const base = rootPath(job.rootId);
    const dest = base === undefined ? null : resolveRelDir(base, job.folder);
    if (!ytdlp) return pause(job.id, 'Configurá yt-dlp en Ajustes');
    if (!dest) return pause(job.id, 'La carpeta de destino no existe');
    setJobStatus(db, job.id, 'running');
    emit(job.id);
    const tempDir = tempDirOf(job.id);
    let limitStreak = 0;

    for (const item of job.items) {
      if (item.status !== 'pending') continue;
      // Lo que pudo cambiar mientras bajaba la anterior: apagado, cancelado, raíz quitada o desconectada.
      if (!started || getJob(db, job.id)?.status !== 'running') return;
      if (rootStatus(job.rootId) === 'offline') return pause(job.id, OFFLINE_REASON);
      try {
        mkdirSync(dest.abs, { recursive: true });
        mkdirSync(tempDir, { recursive: true });
      } catch (err) {
        return pause(job.id, `No se pudo preparar la carpeta de destino: ${errorMessage(err)}`);
      }

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
        limitStreak = 0;
        setItem(db, job.id, item.videoId, { status: 'done', filePath });
        emit(job.id);
        await wait(PAUSE_MS, stopping.signal);
      } catch (err) {
        // Cancelar ya dejó la base como corresponde; apagar deja la canción "downloading" para retomarla.
        if (controller.signal.aborted) {
          // yt-dlp ya cerró: recién ahora Windows deja borrar sus archivos a medio bajar.
          if (getJob(db, job.id)?.status === 'cancelled') removeTemp(tempDir);
          return;
        }
        const message = errorMessage(err);
        limitStreak = RATE_LIMITED.test(message) ? limitStreak + 1 : 0;
        if (limitStreak >= LIMIT_STREAK) {
          setItem(db, job.id, item.videoId, { status: 'pending', error: null });
          return pause(job.id, LIMIT_REASON);
        }
        setItem(db, job.id, item.videoId, { status: 'failed', error: message });
        emit(job.id);
      } finally {
        current = null;
      }
    }

    if (!started || getJob(db, job.id)?.status !== 'running') return;
    await finish(job);
    setJobStatus(db, job.id, 'done');
    removeTemp(tempDir);
    lastProgress.delete(job.id);
    emit(job.id);
  }

  function rootStatus(rootId: number): string | undefined {
    const row = db.prepare('SELECT status FROM roots WHERE id = ?').get(rootId) as
      { status: string } | undefined;
    return row?.status;
  }

  function existingJob(jobId: number): StoredJob {
    const job = getJob(db, jobId);
    if (!job) throw new HttpError(404, 'not_found', 'Descarga inexistente');
    return job;
  }

  async function run() {
    for (let job = nextRunnableJob(db); job && started; job = nextRunnableJob(db)) {
      try {
        await runJob(job);
      } catch (err) {
        // Algo inesperado: mejor pausado con el motivo que trabado en "Bajando".
        log(err, 'Falló una descarga');
        if (getJob(db, job.id)?.status === 'running') pause(job.id, `Error inesperado: ${errorMessage(err)}`);
      }
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
      resetInterrupted(db);
      removeTemp(o.tempRoot);
      stopping = new AbortController();
      started = true;
      kick();
    },

    async stop() {
      started = false;
      stopping.abort();
      current?.controller.abort();
      await loop;
    },

    cancel(jobId) {
      const job = existingJob(jobId);
      if (job.status === 'done' || job.status === 'cancelled') {
        throw new HttpError(409, 'conflict', 'El trabajo ya terminó');
      }
      for (const item of job.items) {
        if (item.status === 'pending' || item.status === 'downloading') {
          setItem(db, jobId, item.videoId, { status: 'cancelled' });
        }
      }
      setJobStatus(db, jobId, 'cancelled');
      // Si está bajando, los temporales se borran cuando yt-dlp termina de cerrar (ver runJob).
      if (current?.jobId === jobId) current.controller.abort();
      else removeTemp(tempDirOf(jobId));
      emit(jobId);
    },

    resume(jobId) {
      if (existingJob(jobId).status !== 'paused') {
        throw new HttpError(409, 'conflict', 'El trabajo no está pausado');
      }
      setJobStatus(db, jobId, 'pending');
      emit(jobId);
      kick();
    },

    retry(jobId) {
      const job = existingJob(jobId);
      if (job.status === 'running') {
        throw new HttpError(409, 'conflict', 'Esperá a que termine para reintentar');
      }
      for (const item of job.items) {
        if (item.status === 'failed' || item.status === 'cancelled') {
          setItem(db, jobId, item.videoId, { status: 'pending', error: null });
        }
      }
      setJobStatus(db, jobId, 'pending');
      emit(jobId);
      kick();
    },

    remove(jobId) {
      const job = existingJob(jobId);
      if (job.status === 'running' || job.status === 'paused') {
        throw new HttpError(409, 'conflict', 'Cancelá la descarga antes de quitarla');
      }
      deleteJob(db, jobId);
    },

    busy: () => current !== null,

    async idle() {
      while (loop) await loop;
    },
  };
}
