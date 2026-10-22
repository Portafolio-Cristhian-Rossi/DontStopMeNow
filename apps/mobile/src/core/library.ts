import type { Album, Catalog, Playlist, Selection, Track } from '@dsmn/shared';

export interface LibraryView {
  albums: Album[];
  artists: { name: string; albumIds: string[] }[];
  playlists: Playlist[];
  tracks: Track[];
}

/** La biblioteca que se puede escuchar sin conexión: solo lo que ya está descargado. */
export function libraryView(catalog: Catalog, downloadedIds: Set<string>): LibraryView {
  const keep = (ids: string[]) => ids.filter((id) => downloadedIds.has(id));
  const albums = catalog.albums
    .map((a) => ({ ...a, trackIds: keep(a.trackIds) }))
    .filter((a) => a.trackIds.length > 0);
  const playlists = catalog.playlists
    .map((p) => ({ ...p, trackIds: keep(p.trackIds) }))
    .filter((p) => p.trackIds.length > 0);

  const byArtist = new Map<string, string[]>();
  for (const a of albums) byArtist.set(a.artist, [...(byArtist.get(a.artist) ?? []), a.id]);
  const artists = [...byArtist]
    .map(([name, albumIds]) => ({ name, albumIds }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return { albums, artists, playlists, tracks: catalog.tracks.filter((t) => downloadedIds.has(t.id)) };
}

function selectedTrackIds(catalog: Catalog, selection: Selection[]): Set<string> {
  const ids = new Set<string>();
  for (const sel of selection) {
    const list = sel.kind === 'album' ? catalog.albums : catalog.playlists;
    for (const id of list.find((e) => e.id === sel.id)?.trackIds ?? []) ids.add(id);
  }
  return ids;
}

/** Cuántas canciones distintas y cuántos bytes suma la selección (las compartidas cuentan una vez). */
export function selectionSummary(
  catalog: Catalog,
  selection: Selection[],
): { trackCount: number; bytes: number } {
  const ids = selectedTrackIds(catalog, selection);
  return { trackCount: ids.size, bytes: entrySize(catalog, [...ids]) };
}

export function entrySize(catalog: Catalog, trackIds: string[]): number {
  const sizes = new Map(catalog.tracks.map((t) => [t.id, t.size]));
  return trackIds.reduce((sum, id) => sum + (sizes.get(id) ?? 0), 0);
}
