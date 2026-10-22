import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRevision } from '../../src/db/meta.ts';
import { EventBus } from '../../src/events.ts';
import { createScanner, type Scanner } from '../../src/scan/scanner.ts';
import { addRootRow, enc, makeDb, makeLibrary, tmpDir } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

let db: DatabaseSync;
let scanner: Scanner;

beforeEach(async () => {
  db = makeDb();
  scanner = createScanner({ db, bus: new EventBus(), coversDir: await tmpDir() });
});

const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
const idOf = (relPath: string) =>
  (db.prepare('SELECT id FROM tracks WHERE rel_path = ?').get(relPath) as { id: string } | undefined)?.id;
const rootStatus = (id: number) =>
  (db.prepare('SELECT status FROM roots WHERE id = ?').get(id) as { status: string }).status;

describe('scanner', () => {
  it('escanea una biblioteca y es idempotente', async () => {
    const dir = await makeLibrary({
      'Queen/Jazz/01.mp3': makeMp3({ artist: 'Queen', album: 'Jazz' }),
      'notas.txt': enc('x'),
      '.oculto.mp3': makeMp3({}),
    });
    addRootRow(db, dir);
    expect(await scanner.scanAll()).toMatchObject({ added: 1, issues: 0 });
    expect(getRevision(db)).toBe(1);
    expect(await scanner.scanAll()).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(getRevision(db)).toBe(1);
    expect(scanner.status()).toEqual({ running: false, processed: 1, total: 1 });
  });

  it('guarda títulos y rutas Unicode', async () => {
    const dir = await makeLibrary({ 'Música/Canción ñandú.mp3': makeMp3({ artist: 'Björk' }) });
    addRootRow(db, dir);
    await scanner.scanAll();
    expect({ ...db.prepare('SELECT rel_path, artist, title FROM tracks').get() }).toEqual({
      rel_path: 'Música/Canción ñandú.mp3',
      artist: 'Björk',
      title: 'Canción ñandú',
    });
  });

  it('detecta un movimiento entre carpetas', async () => {
    const dir = await makeLibrary({ 'A/x.mp3': makeMp3({ title: 'X' }) });
    addRootRow(db, dir);
    await scanner.scanAll();
    const id = idOf('A/x.mp3');
    await rename(join(dir, 'A'), join(dir, 'B'));
    expect(await scanner.scanAll()).toMatchObject({ moved: 1, added: 0, removed: 0 });
    expect(idOf('B/x.mp3')).toBe(id);
  });

  it('raíz desconectada: no borra y la marca offline; al volver, online', async () => {
    const dir = await makeLibrary({ 'x.mp3': makeMp3({}) });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    await rename(dir, dir + '-x');
    expect(await scanner.scanAll()).toMatchObject({ removed: 0 });
    expect(rootStatus(rootId)).toBe('offline');
    expect(getRevision(db)).toBe(2);
    expect(count('SELECT COUNT(*) AS n FROM tracks')).toBe(1);
    await rename(dir + '-x', dir);
    await scanner.scanAll();
    expect(rootStatus(rootId)).toBe('online');
    expect(count('SELECT COUNT(*) AS n FROM tracks')).toBe(1);
  });

  it('archivo truncado va a issues y se limpia al completarse', async () => {
    const dir = await makeLibrary({});
    addRootRow(db, dir);
    const full = makeMp3({ title: 'Grande' }, { seconds: 3 });
    await writeFile(join(dir, 'g.mp3'), full.slice(0, 5));
    expect((await scanner.scanAll()).issues).toBe(1);
    expect(count('SELECT COUNT(*) AS n FROM scan_issues')).toBe(1);
    await writeFile(join(dir, 'g.mp3'), full);
    expect(await scanner.scanAll()).toMatchObject({ added: 1, issues: 0 });
    expect(count('SELECT COUNT(*) AS n FROM scan_issues')).toBe(0);
  });

  it('scanScopes solo mira el subárbol pedido', async () => {
    const dir = await makeLibrary({ 'A/a.mp3': makeMp3({ title: 'a' }), 'B/b.mp3': makeMp3({ title: 'b' }) });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    await writeFile(join(dir, 'A', 'c.mp3'), makeMp3({ title: 'c' }));
    await writeFile(join(dir, 'B', 'd.mp3'), makeMp3({ title: 'd' }));
    expect(await scanner.scanScopes([{ rootId, relDir: 'A' }])).toMatchObject({ added: 1, removed: 0 });
    expect(idOf('B/d.mp3')).toBeUndefined();
  });

  it('usa folder.jpg cuando no hay portada incrustada', async () => {
    const dir = await makeLibrary({ 'Alb/1.mp3': makeMp3({}), 'Alb/folder.jpg': new Uint8Array([1, 2, 3]) });
    addRootRow(db, dir);
    await scanner.scanAll();
    expect(
      (db.prepare('SELECT cover_id FROM tracks').get() as { cover_id: string | null }).cover_id,
    ).not.toBeNull();
  });

  it('serializa llamadas concurrentes', async () => {
    const dir = await makeLibrary({ 'x.mp3': makeMp3({}) });
    addRootRow(db, dir);
    const [a, b] = await Promise.all([scanner.scanAll(), scanner.scanAll()]);
    expect(a.added + b.added).toBe(1);
  });
});
