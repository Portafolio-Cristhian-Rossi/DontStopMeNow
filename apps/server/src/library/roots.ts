import { readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { BrowseResponse, FsBrowseResponse, FsFolder, Root } from '@dsmn/shared';
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

/** Ocultas o del sistema: `.git`, `$RECYCLE.BIN`, `System Volume Information`. */
function isHiddenFolder(name: string): boolean {
  return name.startsWith('.') || name.startsWith('$') || name === 'System Volume Information';
}

/** Nombres de las subcarpetas visibles de `abs`, en orden alfabético natural. */
function subfolders(abs: string): string[] {
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !isHiddenFolder(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
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
  return { rootId, path: resolved.rel, folders: subfolders(resolved.abs) };
}

/** Accesos rápidos para elegir una raíz nueva: carpetas del usuario que existan y las unidades. */
export function listPlaces(home = os.homedir()): FsFolder[] {
  const places: FsFolder[] = [];
  const candidates: [string, string[]][] = [
    ['Música', ['Music', 'Música']],
    ['Escritorio', ['Desktop', 'Escritorio']],
    ['Descargas', ['Downloads', 'Descargas']],
    ['Documentos', ['Documents', 'Documentos']],
  ];
  for (const [name, dirs] of candidates) {
    const found = dirs.map((d) => path.join(home, d)).find(isDirectory);
    if (found) places.push({ name, path: found });
  }
  if (isDirectory(home)) places.push({ name: 'Carpeta personal', path: home });
  if (process.platform === 'win32') {
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const drive = `${letter}:\\`;
      if (isDirectory(drive)) places.push({ name: `${letter}:`, path: drive });
    }
  } else {
    places.push({ name: '/', path: '/' });
    for (const dir of ['/media', '/mnt', '/Volumes']) {
      if (isDirectory(dir)) places.push({ name: dir, path: dir });
    }
  }
  return places;
}

/** Explorador de todo el disco, para elegir una raíz nueva (solo gestión local). */
export function listFolders(input: string): FsBrowseResponse {
  // "D:" a secas es relativa al directorio actual de esa unidad: la tomamos como su raíz.
  const raw = /^[a-zA-Z]:$/.test(input) && path.sep === '\\' ? input + path.sep : input;
  if (!path.isAbsolute(raw)) throw new HttpError(400, 'bad_request', 'La ruta debe ser absoluta');
  const abs = path.resolve(raw);
  let names: string[];
  try {
    names = subfolders(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR')
      throw new HttpError(400, 'bad_request', `La carpeta no existe: ${abs}`);
    throw new HttpError(403, 'forbidden', `No hay permiso para abrir ${abs}`);
  }
  const parent = path.dirname(abs);
  return {
    path: abs,
    parent: parent === abs ? null : parent,
    folders: names.map((name) => ({ name, path: path.join(abs, name) })),
  };
}
