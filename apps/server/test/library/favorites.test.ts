import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRevision } from '../../src/db/meta.ts';
import { EventBus } from '../../src/events.ts';
import { buildCatalog } from '../../src/library/catalog.ts';
import { setFavorite } from '../../src/library/favorites.ts';
import { createScanner } from '../../src/scan/scanner.ts';
import { addRootRow, makeDb, makeLibrary, tmpDir } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

let db: DatabaseSync;
let bus: EventBus;
let ids: Record<string, string>;

beforeEach(async () => {
  db = makeDb();
  bus = new EventBus();
  const copia = makeMp3({ title: 'a' });
  const dir = await makeLibrary({
    'a.mp3': copia,
    'otra/a.mp3': copia,
    'b.mp3': makeMp3({ title: 'b' }),
  });
  addRootRow(db, dir);
  await createScanner({ db, bus, coversDir: await tmpDir() }).scanAll();
  ids = Object.fromEntries(
    (db.prepare('SELECT id, rel_path FROM tracks').all() as { id: string; rel_path: string }[]).map((r) => [
      r.rel_path.replaceAll('\\', '/'),
      r.id,
    ]),
  );
});

const favoritedAt = (id: string) => buildCatalog(db, 's').tracks.find((t) => t.id === id)?.favoritedAt;

describe('favoritas', () => {
  it('marcar pone la fecha en el catálogo y desmarcar la saca, subiendo la revisión', () => {
    const base = getRevision(db);
    expect(favoritedAt(ids['b.mp3']!)).toBeNull();
    setFavorite(db, bus, ids['b.mp3']!, true);
    expect(favoritedAt(ids['b.mp3']!)).toEqual(expect.any(Number));
    setFavorite(db, bus, ids['b.mp3']!, false);
    expect(favoritedAt(ids['b.mp3']!)).toBeNull();
    expect(getRevision(db)).toBe(base + 2);
  });

  it('es idempotente: repetir no cambia la fecha ni la revisión', () => {
    setFavorite(db, bus, ids['b.mp3']!, true);
    const when = favoritedAt(ids['b.mp3']!);
    const revision = getRevision(db);
    setFavorite(db, bus, ids['b.mp3']!, true);
    setFavorite(db, bus, ids['a.mp3']!, false);
    expect(favoritedAt(ids['b.mp3']!)).toBe(when);
    expect(getRevision(db)).toBe(revision);
  });

  it('las copias del mismo archivo quedan marcadas juntas', () => {
    setFavorite(db, bus, ids['a.mp3']!, true);
    expect(favoritedAt(ids['otra/a.mp3']!)).toEqual(expect.any(Number));
  });

  it('una canción desconocida da 404', () => {
    expect(() => setFavorite(db, bus, 'nope', true)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
