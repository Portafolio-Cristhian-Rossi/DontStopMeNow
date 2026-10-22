import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/events.ts';
import { buildCatalog } from '../../src/library/catalog.ts';
import { createPlaylist } from '../../src/library/playlists.ts';
import { createScanner, type Scanner } from '../../src/scan/scanner.ts';
import { addRootRow, makeDb, makeLibrary, tmpDir } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

let db: DatabaseSync;
let bus: EventBus;
let scanner: Scanner;

beforeEach(async () => {
  db = makeDb();
  bus = new EventBus();
  scanner = createScanner({ db, bus, coversDir: await tmpDir() });
});

const titles = (ids: string[], cat: ReturnType<typeof buildCatalog>) =>
  ids.map((id) => cat.tracks.find((t) => t.id === id)!.title);

describe('buildCatalog', () => {
  it('lista de carpeta incluye subcarpetas y se actualiza sola', async () => {
    const dir = await makeLibrary({
      'Chill/a.mp3': makeMp3({ title: 'a' }),
      'Chill/Más/b.mp3': makeMp3({ title: 'b' }),
      'Otros/c.mp3': makeMp3({ title: 'c' }),
    });
    const rootId = addRootRow(db, dir);
    await scanner.scanAll();
    const pl = createPlaylist(db, bus, { type: 'folder', name: 'Chill', rootId, folderRelPath: 'Chill' });
    expect(titles(pl.trackIds, buildCatalog(db, 's'))).toEqual(['a', 'b']);
    expect(pl.folder).toEqual({ rootId, relPath: 'Chill' });

    await writeFile(join(dir, 'Chill', 'd.mp3'), makeMp3({ title: 'd' }));
    await scanner.scanAll();
    const cat = buildCatalog(db, 's');
    expect(titles(cat.playlists[0]!.trackIds, cat)).toEqual(['a', 'd', 'b']); // orden por ruta: Chill/d.mp3 < Chill/Más/b.mp3
  });

  it('arma álbumes ordenados por disco y pista, con serverId y revisión', async () => {
    const dir = await makeLibrary({
      '2.mp3': makeMp3({ title: 'dos', artist: 'Q', album: 'J', track: '2' }),
      '1.mp3': makeMp3({ title: 'uno', artist: 'Q', album: 'J', track: '1' }),
    });
    addRootRow(db, dir);
    await scanner.scanAll();
    const cat = buildCatalog(db, 'srv');
    expect(cat).toMatchObject({ serverId: 'srv', revision: 1 });
    expect(cat.albums).toHaveLength(1);
    expect(titles(cat.albums[0]!.trackIds, cat)).toEqual(['uno', 'dos']);
    expect(cat.tracks[0]).toMatchObject({ format: 'mp3', available: true, albumId: cat.albums[0]!.id });
  });

  it('marca no disponibles las canciones de raíces offline', async () => {
    const dir = await makeLibrary({ 'x.mp3': makeMp3({}) });
    addRootRow(db, dir);
    await scanner.scanAll();
    db.prepare("UPDATE roots SET status = 'offline'").run();
    expect(buildCatalog(db, 's').tracks[0]!.available).toBe(false);
  });
});
