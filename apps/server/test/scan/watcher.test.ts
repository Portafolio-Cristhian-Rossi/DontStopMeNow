import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Scanner, ScanSummary, Scope } from '../../src/scan/scanner.ts';
import { createWatcher } from '../../src/scan/watcher.ts';
import { addRootRow, makeDb, makeLibrary } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

const EMPTY: ScanSummary = { added: 0, updated: 0, moved: 0, removed: 0, issues: 0 };

function fakeScanner(scanned: Scope[][]): Scanner {
  return {
    scanScopes: async (s) => {
      scanned.push(s);
      return EMPTY;
    },
    scanAll: async () => EMPTY,
    status: () => ({ running: false, processed: 0, total: 0 }),
  };
}

describe('watcher', () => {
  it('agrupa eventos y escanea el directorio afectado', async () => {
    const db = makeDb();
    const libDir = await makeLibrary({});
    const rootId = addRootRow(db, libDir);
    const scanned: Scope[][] = [];
    const w = createWatcher({ db, scanner: fakeScanner(scanned), debounceMs: 100 });
    await w.sync();
    await mkdir(join(libDir, 'Nuevo'));
    await writeFile(join(libDir, 'Nuevo', 'a.mp3'), makeMp3({}));
    await writeFile(join(libDir, 'Nuevo', 'b.mp3'), makeMp3({}));
    await vi.waitFor(() => expect(scanned).toHaveLength(1), { timeout: 8000, interval: 100 });
    expect(scanned[0]).toEqual([{ rootId, relDir: 'Nuevo' }]);
    await w.close();
  });

  it('reescanea una raíz offline cuando vuelve', async () => {
    const db = makeDb();
    const libDir = await makeLibrary({ 'x.mp3': makeMp3({}) });
    const rootId = addRootRow(db, libDir);
    await rename(libDir, libDir + '-x');
    db.prepare("UPDATE roots SET status = 'offline'").run();
    const scanned: Scope[][] = [];
    const w = createWatcher({ db, scanner: fakeScanner(scanned), debounceMs: 100, offlinePollMs: 50 });
    await w.sync();
    await new Promise((r) => setTimeout(r, 150));
    expect(scanned).toEqual([]);
    await rename(libDir + '-x', libDir);
    await vi.waitFor(() => expect(scanned).toContainEqual([{ rootId, relDir: '' }]), { timeout: 3000 });
    await w.close();
  });
});
