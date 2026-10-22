import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { CreatePlaylistRequest, Playlist, UpdatePlaylistRequest } from '@dsmn/shared';
import type { EventBus } from '../events.ts';
import { HttpError } from '../http/errors.ts';
import { getPlaylist } from './catalog.ts';
import { resolveRelDir } from './paths.ts';
import { bumpRevision } from './revision.ts';

function assertTracksExist(db: DatabaseSync, trackIds: string[]): void {
  const exists = db.prepare('SELECT 1 FROM tracks WHERE id = ?');
  const unknown = trackIds.find((id) => !exists.get(id));
  if (unknown) throw new HttpError(400, 'bad_request', `Canción desconocida: ${unknown}`);
}

function setTracks(db: DatabaseSync, playlistId: string, trackIds: string[]): void {
  db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(playlistId);
  const insert = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
  trackIds.forEach((id, i) => insert.run(playlistId, id, i));
}

/** Normaliza y valida la carpeta de una lista de carpeta; devuelve el rel_path. */
function resolveFolder(db: DatabaseSync, rootId: number, folderRelPath: string): string {
  const root = db.prepare('SELECT path FROM roots WHERE id = ?').get(rootId) as { path: string } | undefined;
  if (!root) throw new HttpError(400, 'bad_request', `Carpeta raíz desconocida: ${rootId}`);
  const resolved = resolveRelDir(root.path, folderRelPath);
  if (!resolved) throw new HttpError(400, 'bad_request', 'La carpeta debe estar dentro de la raíz');
  const { abs, rel } = resolved;
  let isDir = false;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    // no existe
  }
  if (!isDir) throw new HttpError(400, 'bad_request', `La carpeta no existe: ${rel}`);
  return rel;
}

function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function createPlaylist(db: DatabaseSync, bus: EventBus, req: CreatePlaylistRequest): Playlist {
  const id = randomUUID();
  const now = Date.now();
  inTransaction(db, () => {
    if (req.type === 'manual') {
      const trackIds = req.trackIds ?? [];
      assertTracksExist(db, trackIds);
      db.prepare(
        "INSERT INTO playlists (id, name, type, created_at, updated_at) VALUES (?, ?, 'manual', ?, ?)",
      ).run(id, req.name, now, now);
      setTracks(db, id, trackIds);
    } else {
      const rel = resolveFolder(db, req.rootId, req.folderRelPath);
      db.prepare(
        `INSERT INTO playlists (id, name, type, root_id, folder_rel_path, created_at, updated_at)
         VALUES (?, ?, 'folder', ?, ?, ?, ?)`,
      ).run(id, req.name, req.rootId, rel, now, now);
    }
  });
  bumpRevision(db, bus);
  return getPlaylist(db, id)!;
}

export function updatePlaylist(
  db: DatabaseSync,
  bus: EventBus,
  id: string,
  req: UpdatePlaylistRequest,
): Playlist {
  const current = getPlaylist(db, id);
  if (!current) throw new HttpError(404, 'not_found', 'Lista inexistente');
  if (req.trackIds && current.type === 'folder') {
    throw new HttpError(409, 'conflict', 'Una lista de carpeta no admite canciones fijas');
  }
  inTransaction(db, () => {
    if (req.trackIds) {
      assertTracksExist(db, req.trackIds);
      setTracks(db, id, req.trackIds);
    }
    db.prepare('UPDATE playlists SET name = COALESCE(?, name), updated_at = ? WHERE id = ?').run(
      req.name ?? null,
      Date.now(),
      id,
    );
  });
  bumpRevision(db, bus);
  return getPlaylist(db, id)!;
}

export function deletePlaylist(db: DatabaseSync, bus: EventBus, id: string): void {
  const r = db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
  if (r.changes === 0) throw new HttpError(404, 'not_found', 'Lista inexistente');
  bumpRevision(db, bus);
}
