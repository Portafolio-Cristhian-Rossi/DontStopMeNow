import {
  resolveSelection,
  type Album,
  type Catalog,
  type Playlist,
  type Selection,
  type Track,
} from '@dsmn/shared';

/** Id de la lista especial Favoritas en la app (no choca con los de las listas, que son UUID). */
export const FAVORITES_ID = 'favoritas';

export interface LibraryView {
  albums: Album[];
  artists: { name: string; albumIds: string[] }[];
  playlists: Playlist[];
  tracks: Track[];
  /** Favoritas descargadas, la última marcada primero (una vez por huella aunque haya copias). */
  favorites: Track[];
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

  const tracks = catalog.tracks.filter((t) => downloadedIds.has(t.id));
  const seen = new Set<string>();
  const favorites = tracks
    .filter((t) => t.favoritedAt)
    .sort((a, b) => b.favoritedAt! - a.favoritedAt!)
    .filter((t) => !seen.has(t.fingerprint) && seen.add(t.fingerprint));

  return { albums, artists, playlists, tracks, favorites };
}

/** Función que suma tamaños de canciones; arma el índice una sola vez por catálogo. */
export function sizeLookup(catalog: Catalog): (trackIds: string[]) => number {
  const sizes = new Map(catalog.tracks.map((t) => [t.id, t.size]));
  return (trackIds) => trackIds.reduce((sum, id) => sum + (sizes.get(id) ?? 0), 0);
}

/** Cuántas canciones distintas y cuántos bytes suma la selección (las compartidas cuentan una vez). */
export function selectionSummary(
  catalog: Catalog,
  selection: Selection[],
): { trackCount: number; bytes: number } {
  const ids = resolveSelection(catalog, selection).trackIds;
  return { trackCount: ids.size, bytes: sizeLookup(catalog)([...ids]) };
}

export function entrySize(catalog: Catalog, trackIds: string[]): number {
  return sizeLookup(catalog)(trackIds);
}
