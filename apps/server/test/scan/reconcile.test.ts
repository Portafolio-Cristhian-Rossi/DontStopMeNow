import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TrackMeta } from '../../src/scan/readTrack.ts';
import { reconcile, type ScannedFile } from '../../src/scan/reconcile.ts';
import { makeDb } from '../helpers/fixtures.ts';

let db: DatabaseSync;

beforeEach(() => {
  db = makeDb();
  db.prepare("INSERT INTO roots (id, path, status, created_at) VALUES (1, '/m', 'online', 0)").run();
  db.prepare(
    "INSERT INTO playlists (id, name, type, created_at, updated_at) VALUES ('p', 'P', 'manual', 0, 0)",
  ).run();
});

function sf(relPath: string, fingerprint: string, meta: Partial<TrackMeta> = {}): ScannedFile {
  return {
    rootId: 1,
    relPath,
    size: 100,
    mtimeMs: 1,
    fingerprint,
    coverId: null,
    meta: {
      title: relPath,
      artist: 'A',
      albumArtist: null,
      album: 'B',
      trackNo: null,
      discNo: null,
      year: null,
      durationMs: 1000,
      format: 'mp3',
      ...meta,
    },
  };
}

const trackId = (relPath: string) =>
  (db.prepare('SELECT id FROM tracks WHERE rel_path = ?').get(relPath) as { id: string } | undefined)?.id;
const addToManualPlaylist = (id: string) =>
  db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('p', ?, 0)").run(id);
const playlistTrackIds = () =>
  (
    db.prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id = 'p'").all() as { track_id: string }[]
  ).map((r) => r.track_id);

describe('reconcile', () => {
  it('inserta, y al reescanear la misma ruta conserva el id', () => {
    expect(reconcile(db, { scanned: [sf('a.mp3', 'f1')], missingTrackIds: [] }).added).toBe(1);
    const id = trackId('a.mp3');
    expect(
      reconcile(db, { scanned: [sf('a.mp3', 'f2', { title: 'Nuevo' })], missingTrackIds: [] }).updated,
    ).toBe(1);
    expect(trackId('a.mp3')).toBe(id);
    expect({ ...db.prepare('SELECT title, fingerprint FROM tracks').get() }).toEqual({
      title: 'Nuevo',
      fingerprint: 'f2',
    });
  });

  it('detecta un movimiento y conserva las listas', () => {
    reconcile(db, { scanned: [sf('Viejo/a.mp3', 'f1')], missingTrackIds: [] });
    const id = trackId('Viejo/a.mp3')!;
    addToManualPlaylist(id);
    const r = reconcile(db, { scanned: [sf('Nuevo/a.mp3', 'f1')], missingTrackIds: [id] });
    expect(r).toMatchObject({ moved: 1, added: 0, removed: 0 });
    expect(trackId('Nuevo/a.mp3')).toBe(id);
    expect(playlistTrackIds()).toEqual([id]);
  });

  it('dos copias idénticas presentes son dos canciones', () => {
    const r = reconcile(db, { scanned: [sf('A/x.mp3', 'f1'), sf('B/x.mp3', 'f1')], missingTrackIds: [] });
    expect(r.added).toBe(2);
    expect(trackId('A/x.mp3')).not.toBe(trackId('B/x.mp3'));
  });

  it('borra faltantes no reclamados y los saca de las listas', () => {
    reconcile(db, { scanned: [sf('a.mp3', 'f1')], missingTrackIds: [] });
    const id = trackId('a.mp3')!;
    addToManualPlaylist(id);
    expect(reconcile(db, { scanned: [], missingTrackIds: [id] }).removed).toBe(1);
    expect(trackId('a.mp3')).toBeUndefined();
    expect(playlistTrackIds()).toEqual([]);
  });

  it('arma álbumes por artista del álbum', () => {
    reconcile(db, {
      scanned: [
        sf('1.mp3', 'a', { artist: 'Queen', albumArtist: null, album: 'Jazz', trackNo: 2 }),
        sf('2.mp3', 'b', { artist: 'Invitado', albumArtist: 'Queen', album: 'jazz', trackNo: 1 }),
      ],
      missingTrackIds: [],
    });
    const albums = db.prepare('SELECT * FROM albums').all();
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({ title: 'jazz', artist: 'Queen' });
  });

  it('elimina álbumes que quedaron vacíos', () => {
    reconcile(db, { scanned: [sf('a.mp3', 'f1', { album: 'Solo' })], missingTrackIds: [] });
    expect(db.prepare('SELECT * FROM albums').all()).toHaveLength(1);
    reconcile(db, { scanned: [], missingTrackIds: [trackId('a.mp3')!] });
    expect(db.prepare('SELECT * FROM albums').all()).toHaveLength(0);
  });
});
