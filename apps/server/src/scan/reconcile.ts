import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { albumId } from '@dsmn/shared';
import type { TrackMeta } from './readTrack.ts';

export interface ScannedFile {
  rootId: number;
  relPath: string;
  size: number;
  mtimeMs: number;
  fingerprint: string;
  meta: TrackMeta;
  coverId: string | null;
}

export interface ReconcileResult {
  added: number;
  updated: number;
  moved: number;
  removed: number;
}

/**
 * Aplica a la base el resultado de un escaneo: actualiza rutas conocidas, detecta movimientos
 * (misma huella que una canción faltante), inserta nuevas y borra las faltantes no reclamadas.
 */
export function reconcile(
  db: DatabaseSync,
  input: { scanned: ScannedFile[]; missingTrackIds: string[] },
): ReconcileResult {
  const result: ReconcileResult = { added: 0, updated: 0, moved: 0, removed: 0 };
  const byPath = db.prepare('SELECT id FROM tracks WHERE root_id = ? AND rel_path = ?');
  const fingerprintOf = db.prepare('SELECT fingerprint FROM tracks WHERE id = ?');
  const update = db.prepare(`
    UPDATE tracks SET root_id = :rootId, rel_path = :relPath, size = :size, mtime = :mtime,
      fingerprint = :fingerprint, title = :title, artist = :artist, album_artist = :albumArtist,
      album = :album, track_no = :trackNo, disc_no = :discNo, year = :year, duration_ms = :durationMs,
      format = :format, album_id = :albumId, cover_id = :coverId, updated_at = :now
    WHERE id = :id`);
  const insert = db.prepare(`
    INSERT INTO tracks (id, root_id, rel_path, size, mtime, fingerprint, title, artist, album_artist,
      album, track_no, disc_no, year, duration_ms, format, album_id, cover_id, updated_at)
    VALUES (:id, :rootId, :relPath, :size, :mtime, :fingerprint, :title, :artist, :albumArtist,
      :album, :trackNo, :discNo, :year, :durationMs, :format, :albumId, :coverId, :now)`);
  const remove = db.prepare('DELETE FROM tracks WHERE id = ?');

  // Faltantes agrupados por huella, para reclamarlos como movimientos.
  const missingByFingerprint = new Map<string, string[]>();
  for (const id of input.missingTrackIds) {
    const row = fingerprintOf.get(id) as { fingerprint: string } | undefined;
    if (!row) continue;
    const list = missingByFingerprint.get(row.fingerprint) ?? [];
    list.push(id);
    missingByFingerprint.set(row.fingerprint, list);
  }

  db.exec('BEGIN');
  try {
    const now = Date.now();
    for (const file of input.scanned) {
      const { meta } = file;
      const params = {
        rootId: file.rootId,
        relPath: file.relPath,
        size: file.size,
        mtime: Math.trunc(file.mtimeMs),
        fingerprint: file.fingerprint,
        title: meta.title,
        artist: meta.artist,
        albumArtist: meta.albumArtist,
        album: meta.album,
        trackNo: meta.trackNo,
        discNo: meta.discNo,
        year: meta.year,
        durationMs: meta.durationMs,
        format: meta.format,
        albumId: albumId(meta.albumArtist ?? meta.artist, meta.album),
        coverId: file.coverId,
        now,
      };
      const existing = byPath.get(file.rootId, file.relPath) as { id: string } | undefined;
      if (existing) {
        update.run({ ...params, id: existing.id });
        result.updated++;
        continue;
      }
      const movedId = missingByFingerprint.get(file.fingerprint)?.shift();
      if (movedId) {
        update.run({ ...params, id: movedId });
        result.moved++;
      } else {
        insert.run({ ...params, id: randomUUID() });
        result.added++;
      }
    }
    for (const ids of missingByFingerprint.values()) {
      for (const id of ids) {
        remove.run(id);
        result.removed++;
      }
    }
    refreshAlbums(db);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return result;
}

interface AlbumTrackRow {
  album_id: string;
  album: string;
  artist: string;
  album_artist: string | null;
  year: number | null;
  cover_id: string | null;
}

/** Reconstruye la tabla de álbumes a partir de las canciones. */
export function refreshAlbums(db: DatabaseSync): void {
  const rows = db
    .prepare(
      `SELECT album_id, album, artist, album_artist, year, cover_id FROM tracks
       ORDER BY album_id, disc_no IS NULL, disc_no, track_no IS NULL, track_no, title`,
    )
    .all() as unknown as AlbumTrackRow[];

  const albums = new Map<
    string,
    { title: string; artist: string; year: number | null; coverId: string | null }
  >();
  for (const r of rows) {
    const album = albums.get(r.album_id);
    if (!album) {
      albums.set(r.album_id, {
        title: r.album,
        artist: r.album_artist ?? r.artist,
        year: r.year,
        coverId: r.cover_id,
      });
      continue;
    }
    if (r.year !== null && (album.year === null || r.year > album.year)) album.year = r.year;
    album.coverId ??= r.cover_id;
  }

  db.exec('DELETE FROM albums');
  const insert = db.prepare('INSERT INTO albums (id, title, artist, cover_id, year) VALUES (?, ?, ?, ?, ?)');
  for (const [id, a] of albums) insert.run(id, a.title, a.artist, a.coverId, a.year);
}
