import type { DatabaseSync } from 'node:sqlite';
import type { Album, Catalog, Playlist, Track } from '@dsmn/shared';
import { getRevision } from '../db/meta.ts';
import { isUnderRelDir } from './paths.ts';

interface TrackRow {
  id: string;
  root_id: number;
  rel_path: string;
  title: string;
  artist: string;
  album_id: string;
  track_no: number | null;
  disc_no: number | null;
  duration_ms: number;
  size: number;
  format: Track['format'];
  fingerprint: string;
  cover_id: string | null;
  status: 'online' | 'offline';
}

interface PlaylistRow {
  id: string;
  name: string;
  type: 'manual' | 'folder';
  root_id: number | null;
  folder_rel_path: string | null;
}

const TRACK_ORDER = 'disc_no IS NULL, disc_no, track_no IS NULL, track_no, title';

function toTrack(r: TrackRow): Track {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    albumId: r.album_id,
    trackNo: r.track_no,
    discNo: r.disc_no,
    durationMs: r.duration_ms,
    size: r.size,
    format: r.format,
    fingerprint: r.fingerprint,
    coverId: r.cover_id,
    available: r.status === 'online',
  };
}

/** Lista tal como la ve el catálogo; las de carpeta se calculan en el momento. */
export function getPlaylist(db: DatabaseSync, id: string): Playlist | null {
  const row = db
    .prepare('SELECT id, name, type, root_id, folder_rel_path FROM playlists WHERE id = ?')
    .get(id) as PlaylistRow | undefined;
  return row ? toPlaylist(db, row) : null;
}

function toPlaylist(db: DatabaseSync, row: PlaylistRow): Playlist {
  if (row.type === 'manual') {
    const ids = db
      .prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position')
      .all(row.id) as { track_id: string }[];
    return { id: row.id, name: row.name, type: 'manual', folder: null, trackIds: ids.map((r) => r.track_id) };
  }
  const relPath = row.folder_rel_path ?? '';
  const rows = db.prepare('SELECT id, rel_path FROM tracks WHERE root_id = ?').all(row.root_id) as {
    id: string;
    rel_path: string;
  }[];
  rows.sort((x, y) =>
    x.rel_path.localeCompare(y.rel_path, undefined, { sensitivity: 'base', numeric: true }),
  );
  return {
    id: row.id,
    name: row.name,
    type: 'folder',
    folder: { rootId: row.root_id!, relPath },
    trackIds: rows.filter((r) => isUnderRelDir(r.rel_path, relPath)).map((r) => r.id),
  };
}

export function buildCatalog(db: DatabaseSync, serverId: string): Catalog {
  const trackRows = db
    .prepare(
      `SELECT t.*, r.status FROM tracks t JOIN roots r ON r.id = t.root_id
       ORDER BY t.artist COLLATE NOCASE, t.album COLLATE NOCASE, ${TRACK_ORDER}`,
    )
    .all() as unknown as TrackRow[];

  const albumTracks = new Map<string, string[]>();
  const byAlbumOrder = db.prepare(`SELECT id, album_id FROM tracks ORDER BY ${TRACK_ORDER}`).all() as {
    id: string;
    album_id: string;
  }[];
  for (const r of byAlbumOrder) {
    const list = albumTracks.get(r.album_id) ?? [];
    list.push(r.id);
    albumTracks.set(r.album_id, list);
  }

  const albums: Album[] = (
    db
      .prepare(
        'SELECT id, title, artist, year, cover_id FROM albums ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE',
      )
      .all() as { id: string; title: string; artist: string; year: number | null; cover_id: string | null }[]
  ).map((a) => ({
    id: a.id,
    title: a.title,
    artist: a.artist,
    year: a.year,
    coverId: a.cover_id,
    trackIds: albumTracks.get(a.id) ?? [],
  }));

  const playlists = (
    db
      .prepare('SELECT id, name, type, root_id, folder_rel_path FROM playlists ORDER BY name COLLATE NOCASE')
      .all() as unknown as PlaylistRow[]
  ).map((row) => toPlaylist(db, row));

  return { serverId, revision: getRevision(db), tracks: trackRows.map(toTrack), albums, playlists };
}
