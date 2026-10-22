import type { Catalog, Track } from './schemas.ts';

export type Selection = { kind: 'album' | 'playlist'; id: string };
export type LocalDownload = { trackId: string; fingerprint: string };

export interface SyncPlan {
  download: Track[];
  delete: string[];
  prunedSelection: Selection[];
}

/** Calcula qué bajar y qué borrar en el celular para que coincida con la selección. */
export function computeSyncPlan(
  catalog: Pick<Catalog, 'tracks' | 'albums' | 'playlists'>,
  selection: Selection[],
  downloads: LocalDownload[],
): SyncPlan {
  const tracks = new Map(catalog.tracks.map((t) => [t.id, t]));
  const albums = new Map(catalog.albums.map((a) => [a.id, a]));
  const playlists = new Map(catalog.playlists.map((p) => [p.id, p]));

  const prunedSelection: Selection[] = [];
  const desired = new Set<string>();
  for (const sel of selection) {
    const entry = sel.kind === 'album' ? albums.get(sel.id) : playlists.get(sel.id);
    if (!entry) continue;
    prunedSelection.push(sel);
    for (const id of entry.trackIds) desired.add(id);
  }

  const local = new Map(downloads.map((d) => [d.trackId, d.fingerprint]));
  const download: Track[] = [];
  for (const id of desired) {
    const track = tracks.get(id);
    if (track?.available && local.get(id) !== track.fingerprint) download.push(track);
  }

  const toDelete = [...local.keys()].filter((id) => !desired.has(id));
  return { download, delete: toDelete, prunedSelection };
}
