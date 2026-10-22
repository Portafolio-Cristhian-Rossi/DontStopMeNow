import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { BrowseResponse, Root } from '@dsmn/shared';
import type { EventBus } from '../events.ts';
import { HttpError } from '../http/errors.ts';
import { refreshAlbums } from '../scan/reconcile.ts';
import { resolveRelDir } from './paths.ts';
import { bumpRevision } from './revision.ts';

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** ¿`inner` es `outer` o está dentro de ella? */
function contains(outer: string, inner: string): boolean {
  const rel = path.relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function listRoots(db: DatabaseSync): Root[] {
  return db.prepare('SELECT id, path, status FROM roots ORDER BY path').all() as unknown as Root[];
}

export function addRoot(db: DatabaseSync, bus: EventBus, absPath: string): Root {
  if (!path.isAbsolute(absPath)) throw new HttpError(400, 'bad_request', 'La ruta debe ser absoluta');
  const normalized = path.resolve(absPath);
  if (!isDirectory(normalized)) throw new HttpError(400, 'bad_request', `No es una carpeta: ${absPath}`);
  for (const root of listRoots(db)) {
    if (contains(root.path, normalized) || contains(normalized, root.path)) {
      throw new HttpError(409, 'conflict', `Se superpone con la carpeta ya agregada ${root.path}`);
    }
  }
  const r = db
    .prepare("INSERT INTO roots (path, status, created_at) VALUES (?, 'online', ?)")
    .run(normalized, Date.now());
  bumpRevision(db, bus);
  return { id: Number(r.lastInsertRowid), path: normalized, status: 'online' };
}

export function removeRoot(db: DatabaseSync, bus: EventBus, id: number): void {
  const root = db.prepare('SELECT path FROM roots WHERE id = ?').get(id) as { path: string } | undefined;
  if (!root) throw new HttpError(404, 'not_found', 'Carpeta raíz inexistente');
  db.prepare('DELETE FROM roots WHERE id = ?').run(id);
  const prefix = root.path.endsWith(path.sep) ? root.path : root.path + path.sep;
  db.prepare('DELETE FROM scan_issues WHERE substr(path, 1, length(?)) = ?').run(prefix, prefix);
  refreshAlbums(db);
  bumpRevision(db, bus);
}

export function browse(db: DatabaseSync, rootId: number, relPath: string): BrowseResponse {
  const root = db.prepare('SELECT path, status FROM roots WHERE id = ?').get(rootId) as
    { path: string; status: Root['status'] } | undefined;
  if (!root) throw new HttpError(404, 'not_found', 'Carpeta raíz inexistente');
  if (root.status === 'offline') throw new HttpError(409, 'conflict', 'La carpeta raíz no está disponible');
  const resolved = resolveRelDir(root.path, relPath);
  if (!resolved) throw new HttpError(400, 'bad_request', 'La carpeta debe estar dentro de la raíz');
  if (!isDirectory(resolved.abs))
    throw new HttpError(400, 'bad_request', `La carpeta no existe: ${resolved.rel}`);
  const folders = readdirSync(resolved.abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  return { rootId, path: resolved.rel, folders };
}
