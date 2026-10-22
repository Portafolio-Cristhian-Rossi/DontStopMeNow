import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

/** Archivos de audio bajo `dir` (recursivo), sin entradas ocultas. */
async function listAudioFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listAudioFiles(full)));
    else if (entry.isFile() && formatFromPath(entry.name)) out.push(full);
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
  const tracksOfRoot = db.prepare('SELECT id, rel_path, size, mtime FROM tracks WHERE root_id = ?');
  const upsertIssue = db.prepare(
    'INSERT OR REPLACE INTO scan_issues (path, error, detected_at) VALUES (?, ?, ?)',
  );
  const clearIssue = db.prepare('DELETE FROM scan_issues WHERE path = ?');

  async function run(scopes: Scope[]): Promise<ScanSummary> {
    let rootStatusChanged = false;
    const found = new Map<string, FoundFile>();
    const known = new Map<string, TrackRow & { rootId: number }>();

    for (const scope of scopes) {
      const root = db.prepare('SELECT id, path, status FROM roots WHERE id = ?').get(scope.rootId) as
        RootRow | undefined;
      if (!root) continue;

      const online = await isDirectory(root.path);
      const status = online ? 'online' : 'offline';
      if (status !== root.status) {
        setRootStatus.run(status, root.id);
        rootStatusChanged = true;
      }
      if (!online) continue;

      for (const row of tracksOfRoot.all(root.id) as unknown as TrackRow[]) {
        if (isUnderRelDir(row.rel_path, scope.relDir))
          known.set(`${root.id}:${row.rel_path}`, { ...row, rootId: root.id });
      }
      const dir = scope.relDir ? join(root.path, ...scope.relDir.split('/')) : root.path;
      for (const absPath of await listAudioFiles(dir)) {
        const relPath = toRelPath(root.path, absPath);
        found.set(`${root.id}:${relPath}`, { rootId: root.id, absPath, relPath, size: 0, mtimeMs: 0 });
      }
    }

    const total = found.size;
    let processed = 0;
    let issues = 0;
    setStatus({ running: true, processed, total });

    const scanned: ScannedFile[] = [];
    const missingTrackIds: string[] = [];
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
    for (const [key, row] of known) {
      if (!found.has(key)) missingTrackIds.push(row.id);
    }

    const result = reconcile(db, { scanned, missingTrackIds });
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
