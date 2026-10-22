import { FINGERPRINT_WINDOW, computeSyncPlan, fingerprintFromWindows, type Track } from '@dsmn/shared';
import { ServerUnreachableError, UnauthorizedError, type ServerClient } from './http.ts';
import type { LocalStore } from './store.ts';
import type { Downloader, FileStore } from './types.ts';

/** Espacio que siempre se deja libre en el celular. */
export const FREE_SPACE_MARGIN = 200 * 1024 * 1024;
const RETRY_DELAYS_MS = [2000, 4000, 8000];
const PARALLEL_DOWNLOADS = 2;

export class InsufficientSpaceError extends Error {
  constructor(public readonly missingBytes: number) {
    super(`Faltan ${missingBytes} bytes de espacio libre`);
  }
}

/** La huella no coincidió ni con una descarga completa nueva: no tiene sentido reintentar. */
class FingerprintMismatchError extends Error {
  constructor() {
    super('La huella no coincide');
  }
}

export interface SyncProgress {
  phase: 'catalog' | 'deleting' | 'downloading' | 'done';
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
}

export interface SyncReport {
  downloaded: number;
  deleted: number;
  failed: { trackId: string; error: string }[];
  paused: boolean;
}

export interface SyncDeps {
  client: ServerClient;
  store: LocalStore;
  files: FileStore;
  downloader: Downloader;
  /** Canciones que no se borran aunque estén desmarcadas (la que está sonando). */
  protectedTrackIds?: Set<string>;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (p: SyncProgress) => void;
}

const isFatal = (err: unknown) => err instanceof UnauthorizedError || err instanceof ServerUnreachableError;

async function fingerprintOf(files: FileStore, path: string): Promise<string> {
  const size = files.size(path);
  if (size <= 2 * FINGERPRINT_WINDOW)
    return fingerprintFromWindows(size, await files.read(path, 0, size), new Uint8Array());
  return fingerprintFromWindows(
    size,
    await files.read(path, 0, FINGERPRINT_WINDOW),
    await files.read(path, size - FINGERPRINT_WINDOW, FINGERPRINT_WINDOW),
  );
}

/**
 * Deja el celular igual a la selección: trae el catálogo, borra lo desmarcado y baja lo que falta,
 * verificando cada archivo con su huella. Token revocado o servidor inalcanzable cortan todo.
 */
export async function runSync(deps: SyncDeps): Promise<SyncReport> {
  const { client, store, files, downloader } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const signal = deps.signal ?? new AbortController().signal;
  const report: SyncReport = { downloaded: 0, deleted: 0, failed: [], paused: false };
  const emit = (p: SyncProgress) => deps.onProgress?.(p);

  // 1. Catálogo (antes de tocar archivos: un token revocado o el servidor caído cortan acá).
  emit({ phase: 'catalog', done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
  const stored = store.getCatalog();
  const fetched = await client.catalog(stored?.etag);
  let catalog = stored?.catalog;
  if (!fetched.notModified) {
    catalog = fetched.catalog;
    store.setCatalog(fetched.catalog, fetched.etag);
  }
  if (!catalog) throw new Error('No hay catálogo');

  // 2. Plan.
  const downloads = store.getDownloads();
  const plan = computeSyncPlan(catalog, store.getSelection(), downloads);
  store.replaceSelection(plan.prunedSelection);

  // 3. Espacio.
  const bytesTotal = plan.download.reduce((sum, t) => sum + t.size, 0);
  const available = files.freeBytes() - FREE_SPACE_MARGIN;
  if (bytesTotal > available) throw new InsufficientSpaceError(bytesTotal - available);

  // 4. Borrados.
  emit({ phase: 'deleting', done: 0, total: plan.download.length, bytesDone: 0, bytesTotal });
  const paths = new Map(downloads.map((d) => [d.trackId, d.path]));
  for (const id of plan.delete) {
    if (deps.protectedTrackIds?.has(id)) continue;
    const path = paths.get(id);
    if (path && files.exists(path)) files.remove(path);
    store.removeDownload(id);
    report.deleted++;
  }

  // 5. Descargas.
  const progress = new Map<string, number>();
  let done = 0;
  const bytesDone = () => [...progress.values()].reduce((a, b) => a + b, 0);
  const emitDownloading = () =>
    emit({ phase: 'downloading', done, total: plan.download.length, bytesDone: bytesDone(), bytesTotal });

  async function downloadOnce(track: Track, part: string, resumeState: string | undefined) {
    const result = await downloader.download({
      url: client.trackUrl(track.id),
      // Al retomar, If-Range hace que el servidor mande el archivo completo si cambió en la compu.
      headers: resumeState
        ? { ...client.authHeaders(), 'If-Range': `"${track.fingerprint}"` }
        : client.authHeaders(),
      dest: part,
      resumeState,
      signal,
      onProgress: (bytes) => {
        progress.set(track.id, bytes);
        emitDownloading();
      },
    });
    return result;
  }

  /** Baja, verifica y registra una canción. Devuelve false si quedó en pausa. */
  async function fetchTrack(track: Track): Promise<boolean> {
    const part = `${files.musicDir}/${track.id}.part`;
    const final = `${files.musicDir}/${track.id}.${track.format}`;
    const partial = store.getPartial(track.id);
    let resumeState = partial?.fingerprint === track.fingerprint ? partial.state : undefined;
    if (partial && !resumeState) store.removePartial(track.id);
    if (!resumeState && files.exists(part)) files.remove(part);

    for (let fullRetry = 0; ; fullRetry++) {
      const result = await downloadOnce(track, part, resumeState);
      if (result.status === 'paused') {
        store.setPartial(track.id, track.fingerprint, result.state);
        return false;
      }
      store.removePartial(track.id);
      if ((await fingerprintOf(files, part)) === track.fingerprint) {
        files.move(part, final);
        store.addDownload({
          trackId: track.id,
          fingerprint: track.fingerprint,
          path: final,
          size: track.size,
        });
        progress.set(track.id, track.size);
        return true;
      }
      // Bytes de otra versión del archivo o corruptos: se descarta y se baja completa una vez más.
      files.remove(part);
      resumeState = undefined;
      progress.set(track.id, 0);
      if (fullRetry >= 1) throw new FingerprintMismatchError();
    }
  }

  const queue = [...plan.download];
  let fatal: unknown = null;

  async function worker() {
    while (queue.length > 0 && !fatal && !report.paused) {
      if (signal.aborted) {
        report.paused = true;
        return;
      }
      const track = queue.shift()!;
      for (let attempt = 0; ; attempt++) {
        try {
          if (await fetchTrack(track)) report.downloaded++;
          else report.paused = true;
          break;
        } catch (err) {
          if (isFatal(err)) {
            fatal ??= err;
            return;
          }
          const retryable = !(err instanceof FingerprintMismatchError) && attempt < RETRY_DELAYS_MS.length;
          if (!retryable || signal.aborted) {
            report.failed.push({
              trackId: track.id,
              error: err instanceof Error ? err.message : String(err),
            });
            break;
          }
          await sleep(RETRY_DELAYS_MS[attempt]!);
          const part = `${files.musicDir}/${track.id}.part`;
          if (files.exists(part)) files.remove(part);
          store.removePartial(track.id);
          progress.set(track.id, 0);
        }
      }
      done++;
      emitDownloading();
    }
  }

  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
  if (fatal) throw fatal;

  store.setFailures(report.failed);
  emit({ phase: 'done', done, total: plan.download.length, bytesDone: bytesDone(), bytesTotal });
  return report;
}
