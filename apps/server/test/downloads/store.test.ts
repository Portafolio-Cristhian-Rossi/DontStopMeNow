import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSource,
  deleteJob,
  downloadedVideoIds,
  findSourceByPlaylistId,
  getJob,
  insertJob,
  listJobs,
  listSources,
  nextRunnableJob,
  resetInterrupted,
  setItem,
  setJobStatus,
  setSourcePlaylist,
  touchSourceChecked,
} from '../../src/downloads/store.ts';
import { addRootRow, makeDb } from '../helpers/fixtures.ts';

let db: DatabaseSync;
let rootId: number;

beforeEach(() => {
  db = makeDb();
  rootId = addRootRow(db, 'D:\\Music');
});

const items = (...ids: string[]) =>
  ids.map((videoId, i) => ({ videoId, position: i + 1, title: `T ${videoId}` }));
const job = (sourceId: number | null, ...ids: string[]) =>
  insertJob(db, {
    sourceId,
    url: 'https://www.youtube.com/playlist?list=PL1',
    title: 'P',
    rootId,
    folder: 'P',
    numberWidth: 2,
    items: items(...ids),
  });
const source = () =>
  createSource(db, {
    url: 'https://www.youtube.com/playlist?list=PL1',
    ytPlaylistId: 'PL1',
    title: 'P',
    rootId,
    folder: 'P',
  });

describe('almacenamiento de descargas', () => {
  it('insertJob deja todo en espera y getJob lo devuelve con sus canciones en orden', () => {
    const j = job(null, 'b', 'a');
    expect(j).toMatchObject({ status: 'pending', folder: 'P', pauseReason: null, finishedAt: null });
    expect(getJob(db, j.id)!.items.map((i) => [i.videoId, i.position, i.status])).toEqual([
      ['b', 1, 'pending'],
      ['a', 2, 'pending'],
    ]);
  });

  it('nextRunnableJob toma el primero en espera y resetInterrupted retoma lo cortado', () => {
    const a = job(null, 'x');
    const b = job(null, 'y');
    expect(nextRunnableJob(db)!.id).toBe(a.id);
    setJobStatus(db, a.id, 'running');
    setItem(db, a.id, 'x', { status: 'downloading' });
    expect(nextRunnableJob(db)!.id).toBe(b.id);
    resetInterrupted(db);
    expect(getJob(db, a.id)).toMatchObject({ status: 'pending', items: [{ status: 'pending' }] });
    expect(nextRunnableJob(db)!.id).toBe(a.id);
  });

  it('setJobStatus guarda el motivo de pausa y la hora de fin', () => {
    const j = job(null, 'x');
    setJobStatus(db, j.id, 'paused', 'YouTube está limitando');
    expect(getJob(db, j.id)).toMatchObject({ status: 'paused', pauseReason: 'YouTube está limitando' });
    setJobStatus(db, j.id, 'done');
    expect(getJob(db, j.id)).toMatchObject({
      status: 'done',
      pauseReason: null,
      finishedAt: expect.any(Number),
    });
  });

  it('downloadedVideoIds y listSources cuentan solo canciones done de esa fuente', () => {
    const s = source();
    const j = job(s.id, 'a', 'b', 'c');
    job(null, 'z');
    setItem(db, j.id, 'a', { status: 'done', filePath: 'D:\\Music\\P\\01 - a.mp3' });
    setItem(db, j.id, 'b', { status: 'failed', error: 'Video unavailable' });
    expect([...downloadedVideoIds(db, s.id)]).toEqual(['a']);
    expect(listSources(db)).toEqual([expect.objectContaining({ id: s.id, downloaded: 1, playlistId: null })]);
    expect(findSourceByPlaylistId(db, 'PL1')!.id).toBe(s.id);
    expect(findSourceByPlaylistId(db, 'otra')).toBeUndefined();
  });

  it('setSourcePlaylist y touchSourceChecked', () => {
    const s = source();
    db.prepare(
      "INSERT INTO playlists (id, name, type, root_id, folder_rel_path, created_at, updated_at) VALUES ('pl', 'P', 'folder', ?, 'P', 0, 0)",
    ).run(rootId);
    setSourcePlaylist(db, s.id, 'pl');
    touchSourceChecked(db, s.id, 1234);
    expect(listSources(db)[0]).toMatchObject({ playlistId: 'pl', lastCheckedAt: 1234 });
  });

  it('quitar un trabajo con canciones bajadas lo oculta pero conserva el registro de bajados', () => {
    const s = source();
    const done = job(s.id, 'a');
    setItem(db, done.id, 'a', { status: 'done' });
    setJobStatus(db, done.id, 'done');
    const never = job(null, 'b');
    deleteJob(db, done.id);
    deleteJob(db, never.id);
    expect(listJobs(db)).toEqual([]);
    expect([...downloadedVideoIds(db, s.id)]).toEqual(['a']);
    expect(getJob(db, never.id)).toBeUndefined();
  });

  it('listJobs muestra los activos y solo los últimos 20 terminados', () => {
    const active = job(null, 'x');
    const finished = Array.from({ length: 22 }, (_, i) => job(null, `f${i}`));
    for (const f of finished) setJobStatus(db, f.id, 'done');
    const ids = listJobs(db).map((j) => j.id);
    expect(ids).toContain(active.id);
    expect(ids).toHaveLength(21);
    expect(ids).not.toContain(finished[0]!.id);
  });

  it('quitar la raíz borra fuentes y trabajos en cascada', () => {
    const s = source();
    job(s.id, 'a');
    db.prepare('DELETE FROM roots WHERE id = ?').run(rootId);
    expect(listJobs(db)).toEqual([]);
    expect(listSources(db)).toEqual([]);
    expect(nextRunnableJob(db)).toBeUndefined();
  });
});
