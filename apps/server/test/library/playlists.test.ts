import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { getRevision } from '../../src/db/meta.ts';
import { EventBus } from '../../src/events.ts';
import { createPlaylist, deletePlaylist, updatePlaylist } from '../../src/library/playlists.ts';
import { createScanner } from '../../src/scan/scanner.ts';
import { addRootRow, makeDb, makeLibrary, tmpDir } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

let db: DatabaseSync;
let bus: EventBus;
let ids: string[];
let rootId: number;

beforeEach(async () => {
  db = makeDb();
  bus = new EventBus();
  const dir = await makeLibrary({ 'a.mp3': makeMp3({ title: 'a' }), 'b.mp3': makeMp3({ title: 'b' }) });
  rootId = addRootRow(db, dir);
  await createScanner({ db, bus, coversDir: await tmpDir() }).scanAll();
  ids = (db.prepare('SELECT id FROM tracks ORDER BY title').all() as { id: string }[]).map((r) => r.id);
});

const status = (status: number) => expect.objectContaining({ status });

describe('playlists', () => {
  it('crear/editar/borrar lista manual sube la revisión', () => {
    const base = getRevision(db);
    const pl = createPlaylist(db, bus, { type: 'manual', name: 'Gym', trackIds: [ids[0]!, ids[1]!] });
    expect(pl).toMatchObject({ name: 'Gym', type: 'manual', folder: null, trackIds: [ids[0], ids[1]] });
    const updated = updatePlaylist(db, bus, pl.id, { name: 'Gym 2', trackIds: [ids[1]!, ids[0]!] });
    expect(updated).toMatchObject({ name: 'Gym 2', trackIds: [ids[1], ids[0]] });
    deletePlaylist(db, bus, pl.id);
    expect(getRevision(db)).toBe(base + 3);
    expect(() => deletePlaylist(db, bus, pl.id)).toThrow(status(404));
  });

  it('una canción puede repetirse en la lista manual', () => {
    const pl = createPlaylist(db, bus, { type: 'manual', name: 'X', trackIds: [ids[0]!, ids[0]!] });
    expect(pl.trackIds).toEqual([ids[0], ids[0]]);
  });

  it('rechaza trackIds desconocidos y carpetas con ..', () => {
    expect(() => createPlaylist(db, bus, { type: 'manual', name: 'X', trackIds: ['nope'] })).toThrow(
      status(400),
    );
    expect(() =>
      createPlaylist(db, bus, { type: 'folder', name: 'X', rootId, folderRelPath: '../afuera' }),
    ).toThrow(status(400));
    expect(() =>
      createPlaylist(db, bus, { type: 'folder', name: 'X', rootId: 999, folderRelPath: '' }),
    ).toThrow(status(400));
    expect(() =>
      createPlaylist(db, bus, { type: 'folder', name: 'X', rootId, folderRelPath: 'no-existe' }),
    ).toThrow(status(400));
  });

  it('normaliza la ruta de carpeta', () => {
    const pl = createPlaylist(db, bus, { type: 'folder', name: 'Todo', rootId, folderRelPath: '/' });
    expect(pl.folder).toEqual({ rootId, relPath: '' });
    expect(pl.trackIds).toHaveLength(2);
  });

  it('no permite fijar trackIds en una lista de carpeta', () => {
    const pl = createPlaylist(db, bus, { type: 'folder', name: 'F', rootId, folderRelPath: '' });
    expect(() => updatePlaylist(db, bus, pl.id, { trackIds: [] })).toThrow(status(409));
    expect(updatePlaylist(db, bus, pl.id, { name: 'G' }).name).toBe('G');
  });

  it('editar una lista inexistente → 404', () => {
    expect(() => updatePlaylist(db, bus, 'nope', { name: 'x' })).toThrow(status(404));
  });
});
