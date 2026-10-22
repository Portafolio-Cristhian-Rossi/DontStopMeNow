import type { Dirent } from 'node:fs';
import { existsSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { ScanStatus } from '@dsmn/shared';
import type { EventBus } from '../events.ts';
import { isUnderRelDir, toRelPath } from '../library/paths.ts';
import { bumpRevision } from '../library/revision.ts';
import { findFolderCover, saveCover } from './covers.ts';
import { fingerprintFile } from './fingerprint.ts';
import { formatFromPath, readTrackFile } from './readTrack.ts';
import { reconcile, type ScannedFile } from './reconcile.ts';

export type Scope = { rootId: number; relDir: string };

export interface ScanSummary {
  added: number;
  updated: number;
  moved: number;
  removed: number;
  issues: number;
}

export interface Scanner {
  scanAll(): Promise<ScanSummary>;
  scanScopes(scopes: Scope[]): Promise<ScanSummary>;
  status(): ScanStatus;
}

interface RootRow {
  id: number;
  path: string;
  status: 'online' | 'offline';
}

interface TrackRow {
  id: string;
  rel_path: string;
  size: number;
  mtime: number;
  fingerprint: string;
}

interface FoundFile {
  rootId: number;
  absPath: string;
  relPath: string;
  size: number;
  mtimeMs: number;
}

const PROGRESS_EVERY = 50;

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

interface Listing {
  files: string[];
  /** Carpetas que no se pudieron leer: sus canciones no deben darse por borradas. */
  failedDirs: string[];
}

/**
 * Archivos de audio bajo `dir` (recursivo), sin entradas ocultas. Sigue enlaces simbólicos y junctions
 * (como hace el vigilante), sin entrar dos veces en la misma carpeta real.
 */
async function listAudioFiles(dir: string, visited = new Set<string>()): Promise<Listing> {
  const out: Listing = { files: [], failedDirs: [] };
  let entries: Dirent[];
  try {
    const real = await realpath(dir);
    if (visited.has(real)) return out;
    visited.add(real);
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    out.failedDirs.push(dir);
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const target = await stat(full);
        isDir = target.isDirectory();
        isFile = target.isFile();
      } catch {
        continue; // enlace roto
      }
    }
    if (isDir) {
      const sub = await listAudioFiles(full, visited);
      out.files.push(...sub.files);
      out.failedDirs.push(...sub.failedDirs);
    } else if (isFile && formatFromPath(entry.name)) {
      out.files.push(full);
    }
  }
  return out;
}

export function createScanner(deps: { db: DatabaseSync; bus: EventBus; coversDir: string }): Scanner {
  const { db, bus, coversDir } = deps;
  let current: ScanStatus = { running: false, processed: 0, total: 0 };
  let queue: Promise<unknown> = Promise.resolve();

  const setStatus = (s: ScanStatus) => {
    current = s;
    bus.emit('scan', s);
  };

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const next = queue.then(job);
    queue = next.catch(() => undefined);
    return next;
  };

  const setRootStatus = db.prepare('UPDATE roots SET status = ? WHERE id = ?');
  const tracksOfRoot = db.prepare(
    'SELECT id, rel_path, size, mtime, fingerprint FROM tracks WHERE root_id = ?',
  );
  const upsertIssue = db.prepare(
    'INSERT OR REPLACE INTO scan_issues (path, error, detected_at) VALUES (?, ?, ?)',
  );
  const clearIssue = db.prepare('DELETE FROM scan_issues WHERE path = ?');

  const byFingerprint = db.prepare(
    `SELECT t.id, t.rel_path, r.path AS root_path, r.status FROM tracks t JOIN roots r ON r.id = t.root_id
     WHERE t.fingerprint = ?`,
  );

  /**
   * Canciones de la base con esa huella cuyo archivo ya no está en su ruta (raíz online):
   * candidatas a ser el origen de un movimiento que este escaneo parcial no ve.
   */
  function vanishedWithFingerprint(fingerprint: string): string[] {
    const rows = byFingerprint.all(fingerprint) as {
      id: string;
      rel_path: string;
      root_path: string;
      status: string;
    }[];
    return rows
      .filter((r) => r.status === 'online' && !existsSync(join(r.root_path, ...r.rel_path.split('/'))))
      .map((r) => r.id);
  }

  /** Borra problemas de archivos bajo las carpetas escaneadas que ya no existen. */
  function removeStaleIssues(dirs: string[], present: Set<string>) {
    const paths = db.prepare('SELECT path FROM scan_issues').all() as { path: string }[];
    for (const { path } of paths) {
      if (present.has(path)) continue;
      if (dirs.some((d) => path.startsWith(d + sep))) clearIssue.run(path);
    }
  }

  async function run(scopes: Scope[], statusChangedBefore = false): Promise<ScanSummary> {
    let rootStatusChanged = statusChangedBefore;
    const found = new Map<string, FoundFile>();
    const known = new Map<string, TrackRow & { rootId: number }>();
    const failed: { rootId: number; relDir: string }[] = [];
    const partialRoots = new Set<number>();
    const scannedDirs: string[] = [];

    for (const scope of scopes) {
      const root = db.prepare('SELECT id, path, status FROM roots WHERE id = ?').get(scope.rootId) as
        RootRow | undefined;
      if (!root) continue;

      const dir = scope.relDir ? join(root.path, ...scope.relDir.split('/')) : root.path;
      const listing = (await isDirectory(root.path)) ? await listAudioFiles(dir) : null;
      const rows = (tracksOfRoot.all(root.id) as unknown as TrackRow[]).filter((r) =>
        isUnderRelDir(r.rel_path, scope.relDir),
      );
      // Una raíz que de golpe aparece vacía pero tenía canciones es casi siempre un disco sin montar
      // (en Linux el punto de montaje sigue existiendo vacío): se trata como desconectada.
      const looksUnmounted =
        listing !== null && scope.relDir === '' && listing.files.length === 0 && rows.length > 0;
      const online = listing !== null && !looksUnmounted;

      const status = online ? 'online' : 'offline';
      if (status !== root.status) {
        setRootStatus.run(status, root.id);
        rootStatusChanged = true;
      }
      if (!online) continue;

      if (!scopes.some((sc) => sc.rootId === root.id && sc.relDir === '')) partialRoots.add(root.id);
      scannedDirs.push(dir);
      for (const row of rows) known.set(`${root.id}:${row.rel_path}`, { ...row, rootId: root.id });
      for (const absPath of listing.files) {
        const relPath = toRelPath(root.path, absPath);
        found.set(`${root.id}:${relPath}`, { rootId: root.id, absPath, relPath, size: 0, mtimeMs: 0 });
      }
      for (const failedDir of listing.failedDirs) {
        failed.push({ rootId: root.id, relDir: toRelPath(root.path, failedDir) });
      }
    }

    const total = found.size;
    let processed = 0;
    let issues = 0;
    setStatus({ running: true, processed, total });

    const scanned: ScannedFile[] = [];
    for (const [key, file] of found) {
      try {
        const info = await stat(file.absPath);
        file.size = info.size;
        file.mtimeMs = Math.trunc(info.mtimeMs);
        const row = known.get(key);
        if (!row || row.size !== file.size || row.mtime !== file.mtimeMs) {
          const { meta, picture } = await readTrackFile(file.absPath);
          const fingerprint = await fingerprintFile(file.absPath, file.size);
          const pic = picture ?? (await findFolderCover(dirname(file.absPath)));
          const coverId = pic ? saveCover(db, coversDir, pic) : null;
          scanned.push({ ...file, fingerprint, meta, coverId });
        }
        clearIssue.run(file.absPath);
      } catch (err) {
        issues++;
        upsertIssue.run(file.absPath, err instanceof Error ? err.message : String(err), Date.now());
      }
      processed++;
      if (processed % PROGRESS_EVERY === 0) setStatus({ running: true, processed, total });
    }

    // Faltantes: filas del alcance sin archivo, salvo las que están bajo una carpeta que no se pudo leer.
    const missing = [...known]
      .filter(
        ([key, row]) =>
          !found.has(key) &&
          !failed.some((f) => f.rootId === row.rootId && isUnderRelDir(row.rel_path, f.relDir)),
      )
      .map(([, row]) => row);

    // Un escaneo parcial solo ve sus carpetas: si algo falta sin una huella que lo explique, puede haberse
    // movido a otra carpeta todavía no escaneada. Se repite con la raíz completa antes de borrar nada.
    const scannedFingerprints = new Set(scanned.map((f) => f.fingerprint));
    const unexplained = missing.filter(
      (r) => partialRoots.has(r.rootId) && !scannedFingerprints.has(r.fingerprint),
    );
    if (unexplained.length > 0) {
      const wholeRoots = [...new Set(unexplained.map((r) => r.rootId))].map((rootId) => ({
        rootId,
        relDir: '',
      }));
      return run([...scopes, ...wholeRoots], rootStatusChanged);
    }

    // Y al revés: un archivo nuevo puede venir de una carpeta que este escaneo no mira.
    const missingTrackIds = new Set(missing.map((r) => r.id));
    for (const file of scanned) {
      if (known.has(`${file.rootId}:${file.relPath}`)) continue;
      const origin = vanishedWithFingerprint(file.fingerprint).find((id) => !missingTrackIds.has(id));
      if (origin) missingTrackIds.add(origin);
    }

    const result = reconcile(db, { scanned, missingTrackIds: [...missingTrackIds] });
    removeStaleIssues(scannedDirs, new Set([...found.values()].map((f) => f.absPath)));
    const changed = result.added + result.updated + result.moved + result.removed > 0 || rootStatusChanged;
    if (changed) bumpRevision(db, bus);
    setStatus({ running: false, processed, total });
    return { ...result, issues };
  }

  return {
    scanScopes: (scopes) => enqueue(() => run(scopes)),
    scanAll: () =>
      enqueue(() => {
        const roots = db.prepare('SELECT id FROM roots').all() as { id: number }[];
        return run(roots.map((r) => ({ rootId: r.id, relDir: '' })));
      }),
    status: () => current,
  };
}
