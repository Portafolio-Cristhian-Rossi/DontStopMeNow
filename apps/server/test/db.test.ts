import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from '../src/db/database.ts';
import { ensureServerId, getRevision } from '../src/db/meta.ts';
import { MIGRATIONS } from '../src/db/schema.ts';
import { EventBus } from '../src/events.ts';
import { bumpRevision } from '../src/library/revision.ts';
import { makeDb } from './helpers/fixtures.ts';

describe('base de datos', () => {
  it('migra y es idempotente', () => {
    const db = makeDb();
    migrate(db);
    expect({ ...db.prepare('PRAGMA user_version').get() }).toEqual({ user_version: MIGRATIONS.length });
  });

  it('la migración 2 crea las tablas de descargas sin tocar los datos existentes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(MIGRATIONS[0]!);
    db.exec('PRAGMA user_version = 1');
    db.prepare("INSERT INTO roots (path, status, created_at) VALUES ('D:\\Music', 'online', 0)").run();
    migrate(db);
    expect({ ...db.prepare('PRAGMA user_version').get() }).toEqual({ user_version: MIGRATIONS.length });
    for (const t of ['yt_sources', 'yt_jobs', 'yt_items']) {
      expect(db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(t)).toBeTruthy();
    }
    expect(db.prepare('SELECT path FROM roots').all()).toEqual([{ path: 'D:\\Music' }]);
  });

  it('la migración 3 crea la tabla de favoritas sin tocar los datos existentes', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(MIGRATIONS[0]!);
    db.exec(MIGRATIONS[1]!);
    db.exec('PRAGMA user_version = 2');
    db.prepare("INSERT INTO roots (path, status, created_at) VALUES ('D:\\Music', 'online', 0)").run();
    migrate(db);
    expect({ ...db.prepare('PRAGMA user_version').get() }).toEqual({ user_version: 3 });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'favorites'").get()).toBeTruthy();
    expect(db.prepare('SELECT path FROM roots').all()).toEqual([{ path: 'D:\\Music' }]);
  });

  it('serverId persiste', () => {
    const db = makeDb();
    expect(ensureServerId(db)).toBe(ensureServerId(db));
  });

  it('bumpRevision incrementa y emite', () => {
    const db = makeDb();
    const bus = new EventBus();
    const seen: number[] = [];
    bus.on('revision', (e) => seen.push(e.revision));
    expect([bumpRevision(db, bus), bumpRevision(db, bus)]).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
    expect(getRevision(db)).toBe(2);
  });

  it('borrar una raíz borra sus canciones y listas de carpeta en cascada', () => {
    const db = makeDb();
    db.prepare("INSERT INTO roots (id, path, status, created_at) VALUES (1, '/m', 'online', 0)").run();
    db.prepare(
      `INSERT INTO tracks (id, root_id, rel_path, size, mtime, fingerprint, title, artist, album, duration_ms, format, album_id, updated_at)
       VALUES ('t1', 1, 'a.mp3', 1, 0, 'f', 'T', 'A', 'B', 0, 'mp3', 'x', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO playlists (id, name, type, root_id, folder_rel_path, created_at, updated_at)
       VALUES ('p1', 'P', 'folder', 1, '', 0, 0)`,
    ).run();
    db.prepare('DELETE FROM roots WHERE id = 1').run();
    expect({ ...db.prepare('SELECT COUNT(*) AS n FROM tracks').get() }).toEqual({ n: 0 });
    expect({ ...db.prepare('SELECT COUNT(*) AS n FROM playlists').get() }).toEqual({ n: 0 });
  });
});
