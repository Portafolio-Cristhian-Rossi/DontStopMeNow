import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRevision } from '../../src/db/meta.ts';
import { EventBus } from '../../src/events.ts';
import { createPlaylist } from '../../src/library/playlists.ts';
import { addRoot, browse, listRoots, removeRoot } from '../../src/library/roots.ts';
import { createScanner } from '../../src/scan/scanner.ts';
import { makeDb, makeLibrary, tmpDir } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

let db: DatabaseSync;
let bus: EventBus;

beforeEach(() => {
  db = makeDb();
  bus = new EventBus();
});

const status = (status: number) => expect.objectContaining({ status });
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('roots', () => {
  it('addRoot valida y rechaza raíces anidadas', async () => {
    const dir = await tmpDir();
    await mkdir(join(dir, 'sub'));
    expect(addRoot(db, bus, join(dir, 'sub')).status).toBe('online');
    expect(() => addRoot(db, bus, join(dir, 'sub'))).toThrow(status(409));
    expect(() => addRoot(db, bus, dir)).toThrow(status(409));
    expect(() => addRoot(db, bus, join(dir, 'sub', 'x'))).toThrow(status(400));
    expect(() => addRoot(db, bus, 'relativa')).toThrow(status(400));
    expect(() => addRoot(db, bus, join(dir, 'no-existe'))).toThrow(status(400));
    expect(listRoots(db)).toEqual([{ id: expect.any(Number), path: join(dir, 'sub'), status: 'online' }]);
    expect(getRevision(db)).toBe(1);
  });

  it('una raíz con prefijo parecido no cuenta como anidada', async () => {
    const dir = await tmpDir();
    await mkdir(join(dir, 'Music'));
    await mkdir(join(dir, 'Music2'));
    addRoot(db, bus, join(dir, 'Music'));
    expect(addRoot(db, bus, join(dir, 'Music2')).status).toBe('online');
  });

  it('browse lista subcarpetas y bloquea escapes', async () => {
    const dir = await tmpDir();
    for (const d of ['B', 'a', '.git', 'a/hija']) await mkdir(join(dir, d));
    const root = addRoot(db, bus, dir);
    expect(browse(db, root.id, '')).toEqual({ rootId: root.id, path: '', folders: ['a', 'B'] });
    expect(browse(db, root.id, 'a').folders).toEqual(['hija']);
    expect(() => browse(db, root.id, '../')).toThrow(status(400));
    expect(() => browse(db, 999, '')).toThrow(status(404));
    db.prepare("UPDATE roots SET status = 'offline'").run();
    expect(() => browse(db, root.id, '')).toThrow(status(409));
  });

  it('removeRoot borra canciones, álbumes y listas de carpeta', async () => {
    const dir = await makeLibrary({ 'x.mp3': makeMp3({}) });
    const root = addRoot(db, bus, dir);
    await createScanner({ db, bus, coversDir: await tmpDir() }).scanAll();
    createPlaylist(db, bus, { type: 'folder', name: 'F', rootId: root.id, folderRelPath: '' });
    removeRoot(db, bus, root.id);
    expect([count('tracks'), count('albums'), count('playlists'), count('roots')]).toEqual([0, 0, 0, 0]);
    expect(() => removeRoot(db, bus, root.id)).toThrow(status(404));
  });
});
