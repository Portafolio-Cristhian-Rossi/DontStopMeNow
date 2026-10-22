import { mkdir, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/events.ts';
import { createScanner, type Scanner } from '../../src/scan/scanner.ts';
import { addRootRow, makeDb, makeLibrary, tmpDir } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

// Permite simular carpetas que fallan al listarse (USB que se desconecta, unidad de red, permisos).
const failing = new Set<string>();
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: (async (p: string, opts?: unknown) => {
      if (failing.has(String(p))) throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
      return (actual.readdir as (p: string, o?: unknown) => Promise<unknown>)(p, opts);
    }) as typeof actual.readdir,
  };
});

let db: DatabaseSync;
let scanner: Scanner;

beforeEach(async () => {
  failing.clear();
  db = makeDb();
  scanner = createScanner({ db, bus: new EventBus(), coversDir: await tmpDir() });
  db.prepare(
    "INSERT INTO playlists (id, name, type, created_at, updated_at) VALUES ('p', 'P', 'manual', 0, 0)",
  ).run();
});

const idOf = (relPath: string) =>
  (db.prepare('SELECT id FROM tracks WHERE rel_path = ?').get(relPath) as { id: string } | undefined)?.id;
const addToPlaylist = (id: string) =>
  db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('p', ?, 0)").run(id);
const playlistSize = () => (db.prepare('SELECT COUNT(*) AS n FROM playlist_tracks').get() as { n: number }).n;

describe('el escáner no borra canciones por error', () => {
  it('mover un archivo: escaneo parcial de la carpeta de origen primero', async () => {
    const dir = await makeLibrary({ 'Rock/a.mp3': makeMp3({ title: 'a' }) });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    const id = idOf('Rock/a.mp3')!;
    addToPlaylist(id);
    await mkdir(join(dir, 'Pop'));
    await rename(join(dir, 'Rock', 'a.mp3'), join(dir, 'Pop', 'a.mp3'));

    expect(await scanner.scanScopes([{ rootId, relDir: 'Rock' }])).toMatchObject({ moved: 1, removed: 0 });
    expect(await scanner.scanScopes([{ rootId, relDir: 'Pop' }])).toMatchObject({ added: 0, removed: 0 });
    expect(idOf('Pop/a.mp3')).toBe(id);
    expect(playlistSize()).toBe(1);
  });

  it('mover un archivo: escaneo parcial de la carpeta de destino primero', async () => {
    const dir = await makeLibrary({ 'Rock/a.mp3': makeMp3({ title: 'a' }) });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    const id = idOf('Rock/a.mp3')!;
    addToPlaylist(id);
    await mkdir(join(dir, 'Pop'));
    await rename(join(dir, 'Rock', 'a.mp3'), join(dir, 'Pop', 'a.mp3'));

    expect(await scanner.scanScopes([{ rootId, relDir: 'Pop' }])).toMatchObject({ moved: 1, added: 0 });
    expect(await scanner.scanScopes([{ rootId, relDir: 'Rock' }])).toMatchObject({ removed: 0 });
    expect(idOf('Pop/a.mp3')).toBe(id);
    expect(playlistSize()).toBe(1);
  });

  it('un borrado real en un escaneo parcial sigue borrando', async () => {
    const dir = await makeLibrary({ 'Rock/a.mp3': makeMp3({ title: 'a' }) });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    await rm(join(dir, 'Rock', 'a.mp3'));
    expect(await scanner.scanScopes([{ rootId, relDir: 'Rock' }])).toMatchObject({ removed: 1 });
  });

  it('una carpeta que no se puede leer no borra sus canciones', async () => {
    const dir = await makeLibrary({ 'A/a.mp3': makeMp3({ title: 'a' }), 'B/b.mp3': makeMp3({ title: 'b' }) });
    addRootRow(db, dir);
    await scanner.scanAll();
    addToPlaylist(idOf('A/a.mp3')!);
    failing.add(join(dir, 'A'));
    expect(await scanner.scanAll()).toMatchObject({ removed: 0 });
    expect(idOf('A/a.mp3')).toBeDefined();
    expect(playlistSize()).toBe(1);
  });

  it('una raíz que aparece vacía pero tenía canciones se trata como offline', async () => {
    const dir = await makeLibrary({ 'A/a.mp3': makeMp3({ title: 'a' }) });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    await rm(join(dir, 'A'), { recursive: true });
    expect(await readdir(dir)).toEqual([]);
    expect(await scanner.scanAll()).toMatchObject({ removed: 0 });
    expect(
      (db.prepare('SELECT status FROM roots WHERE id = ?').get(rootId) as { status: string }).status,
    ).toBe('offline');
  });

  it('incluye carpetas enlazadas (symlink / junction) y es estable entre escaneos', async () => {
    const outside = await makeLibrary({ 'x.mp3': makeMp3({ title: 'x' }) });
    const dir = await makeLibrary({ 'a.mp3': makeMp3({ title: 'a' }) });
    await symlink(outside, join(dir, 'Linked'), 'junction');
    await symlink(dir, join(dir, 'Loop'), 'junction');
    addRootRow(db, dir);
    expect(await scanner.scanAll()).toMatchObject({ added: 2 });
    expect(idOf('Linked/x.mp3')).toBeDefined();
    await writeFile(join(outside, 'y.mp3'), makeMp3({ title: 'y' }));
    expect(await scanner.scanAll()).toMatchObject({ added: 1, removed: 0 });
    expect(await scanner.scanAll()).toMatchObject({ added: 0, removed: 0 });
  });
});
