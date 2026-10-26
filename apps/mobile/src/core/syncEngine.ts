import { FINGERPRINT_WINDOW, computeSyncPlan, fingerprintFromWindows, type Track } from '@dsmn/shared';
import { ServerUnreachableError, UnauthorizedError, type ServerClient } from './http.ts';
import { flushPending } from './pending.ts';
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
/**
 * No se pudo guardar una canción ya bajada en su destino (la carpeta elegida se llenó, se sacó la tarjeta o
 * Android quitó el permiso). Corta la sincronización: con las demás canciones pasaría lo mismo.
 */
export class TargetWriteError extends Error {
  constructor() {
    super('No se pudo guardar la música en la carpeta elegida');
  }
}

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

const isFatal = (err: unknown) =>
  err instanceof UnauthorizedError ||
  err instanceof ServerUnreachableError ||
  err instanceof TargetWriteError;

/** Mensaje en español para una canción que no se pudo bajar. */
export function describeDownloadError(err: unknown): string {
  if (err instanceof FingerprintMismatchError) return err.message;
  const message = err instanceof Error ? err.message : String(err);
  if (/HTTP 409/.test(message)) return 'La carpeta de esta canción no está conectada en la compu';
  if (/HTTP 404/.test(message)) return 'La canción ya no está en la compu';
  const status = /HTTP (\d{3})/.exec(message)?.[1];
  if (status) return `El servidor respondió con un error (${status})`;
  return 'Se cortó la descarga';
}

/** Dónde se guarda una portada en el celular. */
export function coverPath(files: FileStore, coverId: string): string {
  return `${files.coversDir}/${coverId}`;
}

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

  // 1. Cambios hechos en el celular (favoritas, listas) y después el catálogo, que ya los trae. Antes de tocar
  // archivos: un token revocado o el servidor caído cortan acá.
  emit({ phase: 'catalog', done: 0, total: 0, bytesDone: 0, bytesTotal: 0 });
  await flushPending({ store, client });
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
  const targetFree = files.freeBytes();
  if (targetFree !== null) {
    const available = targetFree - FREE_SPACE_MARGIN;
    if (bytesTotal > available) throw new InsufficientSpaceError(bytesTotal - available);
  } else {
    // Carpeta elegida (SD): no se sabe su espacio; al menos tiene que entrar el temporal más grande.
    const largest = plan.download.reduce((max, t) => Math.max(max, t.size), 0);
    const available = files.tempFreeBytes() - FREE_SPACE_MARGIN;
    if (largest > available) throw new InsufficientSpaceError(largest - available);
  }

  // Detener (o desvincular) antes de llegar acá no debe borrar nada.
  if (signal.aborted) return { ...report, paused: true };

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
        let final: string;
        try {
          final = await files.place(part, track);
        } catch {
          files.remove(part);
          throw new TargetWriteError();
        }
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

  /** Espera que termina antes si se aborta la sincronización. */
  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        resolve();
      };
      signal.addEventListener('abort', done);
      void sleep(ms).then(done);
    });
  }

  /** Tras un error de una canción: si el servidor ya no responde, se corta todo (no tiene sentido seguir). */
  async function checkServer(): Promise<void> {
    try {
      await client.catalog(store.getCatalog()?.etag);
    } catch (err) {
      if (isFatal(err)) throw err;
    }
  }

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
          try {
            if (isFatal(err)) throw err;
            if (!(err instanceof FingerprintMismatchError)) await checkServer();
          } catch (fatalErr) {
            fatal ??= fatalErr;
            return;
          }
          if (fatal) return;
          const retryable = !(err instanceof FingerprintMismatchError) && attempt < RETRY_DELAYS_MS.length;
          if (!retryable) {
            report.failed.push({ trackId: track.id, error: describeDownloadError(err) });
            break;
          }
          await wait(RETRY_DELAYS_MS[attempt]!);
          if (signal.aborted || fatal) {
            report.paused = signal.aborted;
            return;
          }
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

  /**
   * Portadas de lo descargado: baja las que faltan y borra las que ya no usa ninguna canción.
   * Una portada que no baja no es una falla de la sincronización.
   */
  async function syncCovers() {
    const downloaded = new Set(store.getDownloads().map((d) => d.trackId));
    const needed = new Set(
      catalog!.tracks.filter((t) => downloaded.has(t.id) && t.coverId).map((t) => t.coverId as string),
    );
    for (const id of needed) {
      const dest = coverPath(files, id);
      if (files.exists(dest) || signal.aborted) continue;
      // Como las canciones: se baja a .part y se mueve solo si terminó (una portada a medias no se repara sola).
      const part = `${dest}.part`;
      try {
        const result = await downloader.download({
          url: client.coverUrl(id),
          headers: client.authHeaders(),
          dest: part,
          signal,
          onProgress: () => {},
        });
        if (result.status === 'done') files.move(part, dest);
      } catch {
        // Una portada que no baja no es una falla de la sincronización.
      }
      if (files.exists(part)) files.remove(part);
    }
    for (const name of files.list(files.coversDir)) {
      if (!needed.has(name)) files.remove(`${files.coversDir}/${name}`);
    }
  }

  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
  if (fatal) throw fatal;

  store.setFailures(report.failed);
  if (!report.paused) await syncCovers();
  emit({ phase: 'done', done, total: plan.download.length, bytesDone: bytesDone(), bytesTotal });
  return report;
}
