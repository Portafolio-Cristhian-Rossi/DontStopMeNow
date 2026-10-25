import type { Catalog } from '@dsmn/shared';
import type { LocalStore } from './store.ts';
import type { FileStore, PlaceableTrack } from './types.ts';

export interface RelocateReport {
  moved: number;
  /** Canciones que no se pudieron copiar: quedan donde estaban, igual se escuchan. */
  failed: number;
  /** Las que se saltearon porque estaban sonando (se mueven la próxima vez). */
  skipped: number;
}

const EXTENSION = /\.(\w+)$/;

/**
 * Mueve lo ya descargado al destino actual (por ejemplo, de la memoria del celular a la carpeta de la SD):
 * copia cada canción, comprueba que la copia tenga el mismo tamaño y recién ahí borra el original y guarda la
 * ruta nueva. Una copia fallida o cortada no pierde nada: la canción queda en su lugar anterior.
 */
export async function relocateDownloads(deps: {
  store: LocalStore;
  files: FileStore;
  catalog: Catalog | null;
  /** No se tocan (la que suena: su archivo está abierto en el reproductor). */
  protectedTrackIds?: Set<string>;
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
}): Promise<RelocateReport> {
  const { store, files } = deps;
  const tracks = new Map((deps.catalog?.tracks ?? []).map((t) => [t.id, t]));
  const pending = store.getDownloads().filter((d) => !files.isInTarget(d.path));
  const report: RelocateReport = { moved: 0, failed: 0, skipped: 0 };

  for (const [i, d] of pending.entries()) {
    if (deps.signal?.aborted) break;
    deps.onProgress?.(i, pending.length);
    if (deps.protectedTrackIds?.has(d.trackId)) {
      report.skipped++;
      continue;
    }
    const known = tracks.get(d.trackId);
    const track: PlaceableTrack = known ?? {
      id: d.trackId,
      title: d.trackId,
      artist: '',
      format: (d.path.match(EXTENSION)?.[1] ?? 'mp3') as PlaceableTrack['format'],
    };
    let copy: string | null = null;
    try {
      copy = await files.copyToTarget(d.path, track);
      if (files.size(copy) !== files.size(d.path)) throw new Error('La copia quedó incompleta');
      store.updateDownloadPath(d.trackId, copy);
      files.remove(d.path);
      report.moved++;
    } catch {
      if (copy && files.exists(copy)) files.remove(copy);
      report.failed++;
    }
  }
  deps.onProgress?.(pending.length, pending.length);
  return report;
}
