import type { Catalog, Track } from './schemas.ts';

/** Qué se quiere tener en el celular. `favorites` (con cualquier id) son todas las canciones favoritas. */
export type Selection = { kind: 'album' | 'playlist' | 'favorites'; id: string };
export type LocalDownload = { trackId: string; fingerprint: string };

export interface SyncPlan {
  download: Track[];
  delete: string[];
  prunedSelection: Selection[];
}

/**
 * Canciones que pide la selección, y la selección sin lo que ya no existe en el catálogo. De las favoritas se
 * toma una copia por huella (si el mismo archivo está dos veces, alcanza con bajar una).
 */
export function resolveSelection(
  catalog: Pick<Catalog, 'tracks' | 'albums' | 'playlists'>,
  selection: Selection[],
): { trackIds: Set<string>; pruned: Selection[] } {
  const albums = new Map(catalog.albums.map((a) => [a.id, a.trackIds]));
  const playlists = new Map(catalog.playlists.map((p) => [p.id, p.trackIds]));
  const pruned: Selection[] = [];
  const trackIds = new Set<string>();
  for (const sel of selection) {
    let ids: string[] | undefined;
    if (sel.kind === 'favorites') {
      const seen = new Set<string>();
      ids = catalog.tracks
        .filter((t) => t.favoritedAt && !seen.has(t.fingerprint) && seen.add(t.fingerprint))
        .map((t) => t.id);
    } else {
      ids = (sel.kind === 'album' ? albums : playlists).get(sel.id);
    }
    if (!ids) continue;
    pruned.push(sel);
    for (const id of ids) trackIds.add(id);
  }
  return { trackIds, pruned };
}

/** Calcula qué bajar y qué borrar en el celular para que coincida con la selección. */
export function computeSyncPlan(
  catalog: Pick<Catalog, 'tracks' | 'albums' | 'playlists'>,
  selection: Selection[],
  downloads: LocalDownload[],
): SyncPlan {
  const tracks = new Map(catalog.tracks.map((t) => [t.id, t]));
  const { trackIds: desired, pruned: prunedSelection } = resolveSelection(catalog, selection);

  const local = new Map(downloads.map((d) => [d.trackId, d.fingerprint]));
  const download: Track[] = [];
  for (const id of desired) {
    const track = tracks.get(id);
    if (track?.available && local.get(id) !== track.fingerprint) download.push(track);
  }

  const toDelete = [...local.keys()].filter((id) => !desired.has(id));
  return { download, delete: toDelete, prunedSelection };
}
