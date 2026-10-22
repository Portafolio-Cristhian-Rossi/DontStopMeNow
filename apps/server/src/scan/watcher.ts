import { statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { watch, type FSWatcher } from 'chokidar';
import { isUnderRelDir, toRelPath } from '../library/paths.ts';
import type { Scanner, Scope } from './scanner.ts';

export interface Watcher {
  sync(): Promise<void>;
  close(): Promise<void>;
}

interface RootRow {
  id: number;
  path: string;
  status: 'online' | 'offline';
}

function exists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Quita scopes contenidos en otro de la misma raíz. */
function dedupe(scopes: Scope[]): Scope[] {
  const sorted = [...scopes].sort((a, b) => a.relDir.length - b.relDir.length);
  const kept: Scope[] = [];
  for (const s of sorted) {
    if (!kept.some((k) => k.rootId === s.rootId && isUnderRelDir(s.relDir, k.relDir))) kept.push(s);
  }
  return kept;
}

/**
 * Observa las carpetas raíz y pide escaneos parciales de los directorios que cambian,
 * agrupando los eventos que llegan juntos. También detecta raíces offline que vuelven.
 */
export function createWatcher(deps: {
  db: DatabaseSync;
  scanner: Scanner;
  debounceMs?: number;
  offlinePollMs?: number;
}): Watcher {
  const { db, scanner } = deps;
  const debounceMs = deps.debounceMs ?? 2000;
  let watchers: FSWatcher[] = [];
  let pending = new Map<string, Scope>();
  let timer: NodeJS.Timeout | undefined;
  const reviving = new Set<number>();

  const flush = () => {
    timer = undefined;
    const scopes = dedupe([...pending.values()]);
    pending = new Map();
    if (scopes.length) scanner.scanScopes(scopes).catch(() => undefined);
  };

  const enqueue = (root: RootRow, dirAbs: string) => {
    let relDir: string;
    try {
      relDir = toRelPath(root.path, dirAbs);
    } catch {
      return;
    }
    pending.set(`${root.id}:${relDir}`, { rootId: root.id, relDir });
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const roots = () => db.prepare('SELECT id, path, status FROM roots').all() as unknown as RootRow[];

  async function closeWatchers() {
    await Promise.all(watchers.map((w) => w.close()));
    watchers = [];
  }

  async function sync() {
    await closeWatchers();
    for (const root of roots()) {
      if (root.status !== 'online') continue;
      const w = watch(root.path, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000 },
        ignored: (p: string) => p !== root.path && basename(p).startsWith('.'),
      });
      w.on('all', (event, p) => {
        if (event === 'addDir' || event === 'unlinkDir') enqueue(root, p);
        else if (event === 'add' || event === 'change' || event === 'unlink') enqueue(root, dirname(p));
      });
      w.on('error', () => undefined);
      await new Promise<void>((resolve) => w.once('ready', () => resolve()));
      watchers.push(w);
    }
  }

  const poll = setInterval(() => {
    for (const root of roots()) {
      if (root.status !== 'offline' || reviving.has(root.id) || !exists(root.path)) continue;
      reviving.add(root.id);
      scanner
        .scanScopes([{ rootId: root.id, relDir: '' }])
        .then(() => sync())
        .catch(() => undefined)
        .finally(() => reviving.delete(root.id));
    }
  }, deps.offlinePollMs ?? 60_000);

  return {
    sync,
    async close() {
      clearInterval(poll);
      clearTimeout(timer);
      await closeWatchers();
    },
  };
}
