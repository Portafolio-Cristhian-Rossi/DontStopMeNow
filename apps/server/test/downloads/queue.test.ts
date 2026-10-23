import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { DownloadEvent, EnqueueRequest } from '@dsmn/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDownloadQueue, type DownloadQueue } from '../../src/downloads/queue.ts';
import { getJob, listJobs, listSources, setItem, setJobStatus } from '../../src/downloads/store.ts';
import { createYtDlp, type YtDlp } from '../../src/downloads/ytdlp.ts';
import { EventBus } from '../../src/events.ts';
import { addRootRow, makeDb, tmpDir } from '../helpers/fixtures.ts';
import { downloadedIds, installFakeYtDlp } from '../helpers/ytdlp.ts';

let db: DatabaseSync;
let bus: EventBus;
let fake: string;
let ytdlp: YtDlp | null;
let root: string;
let rootId: number;
let tempRoot: string;
let q: DownloadQueue;
const wait = vi.fn<(ms: number) => Promise<void>>(async () => {});
const scanScopes = vi.fn(async () => ({ added: 0, updated: 0, removed: 0, moved: 0, issues: 0 }));

const item = (videoId: string, position: number | null) => ({
  videoId,
  position,
  title: `Canción ${videoId}`,
});
const req = (over: Partial<EnqueueRequest> = {}): EnqueueRequest => ({
  url: 'https://www.youtube.com/playlist?list=PL1',
  title: 'Fake Playlist',
  kind: 'playlist',
  ytPlaylistId: 'PL1',
  playlistSize: 3,
  rootId,
  folder: 'Fake Playlist',
  items: [item('ok1', 1)],
  ...over,
});

function makeQueue(over: Partial<Parameters<typeof createDownloadQueue>[0]> = {}) {
  return createDownloadQueue({
    db,
    bus,
    scanner: { scanScopes },
    ytdlp: () => ytdlp,
    ffmpeg: () => true,
    tempRoot,
    wait,
    ...over,
  });
}

beforeEach(async () => {
  db = makeDb();
  bus = new EventBus();
  fake = await installFakeYtDlp();
  ytdlp = createYtDlp({ command: process.execPath, prefixArgs: [fake] });
  root = await tmpDir();
  rootId = addRootRow(db, root);
  tempRoot = join(await tmpDir(), 'yt-tmp');
  wait.mockClear();
  scanScopes.mockClear();
  q = makeQueue();
  q.start();
});

afterEach(async () => {
  await q.stop();
});

const status = (status: number) => expect.objectContaining({ status });

describe('cola de descargas', () => {
  it('baja de a una, en orden, con 5 s entre canciones y crea la lista de carpeta', async () => {
    const job = q.enqueue(req({ items: [item('ok2', 2), item('ok1', 1)] }));
    await q.idle();
    expect(downloadedIds(fake)).toEqual(['ok1', 'ok2']);
    expect(wait.mock.calls).toEqual([[5000], [5000]]);
    expect(getJob(db, job.id)).toMatchObject({
      status: 'done',
      finishedAt: expect.any(Number),
      items: [{ status: 'done' }, { status: 'done' }],
    });
    expect(readdirSync(join(root, 'Fake Playlist'))).toEqual([
      '01 - Canción ok1.mp3',
      '02 - Canción ok2.mp3',
    ]);
    expect(getJob(db, job.id)!.items[0]!.filePath).toBe(join(root, 'Fake Playlist', '01 - Canción ok1.mp3'));
    const source = listSources(db)[0]!;
    expect(source).toMatchObject({ ytPlaylistId: 'PL1', folder: 'Fake Playlist', downloaded: 2 });
    expect(source.playlistId).not.toBeNull();
    const playlist = db.prepare('SELECT name, type, folder_rel_path FROM playlists').get();
    expect({ ...playlist }).toEqual({
      name: 'Fake Playlist',
      type: 'folder',
      folder_rel_path: 'Fake Playlist',
    });
    expect(scanScopes).toHaveBeenCalledWith([{ rootId, relDir: 'Fake Playlist' }]);
    expect(existsSync(join(tempRoot, String(job.id)))).toBe(false);
  });

  it('una canción que falla no frena las demás', async () => {
    const job = q.enqueue(req({ items: [item('fail1', 1), item('ok1', 2)] }));
    await q.idle();
    expect(getJob(db, job.id)).toMatchObject({
      status: 'done',
      items: [
        { videoId: 'fail1', status: 'failed', error: '[youtube] fail: Video unavailable' },
        { videoId: 'ok1', status: 'done' },
      ],
    });
    expect(wait.mock.calls).toEqual([[5000]]);
  });

  it('si todas fallan no escanea ni crea la lista', async () => {
    q.enqueue(req({ items: [item('fail1', 1)] }));
    await q.idle();
    expect(scanScopes).not.toHaveBeenCalled();
    expect(listSources(db)[0]!.playlistId).toBeNull();
  });

  it('sanea la subcarpeta como un solo nombre', async () => {
    const job = q.enqueue(req({ folder: 'AC/DC: Hits?' }));
    expect(job.folder).toBe('AC_DC_ Hits_');
    await q.idle();
    expect(existsSync(join(root, 'AC_DC_ Hits_', '01 - Canción ok1.mp3'))).toBe(true);
  });

  it('un video suelto va directo a la carpeta de música, sin número ni lista', async () => {
    q.enqueue(
      req({
        kind: 'video',
        ytPlaylistId: null,
        url: 'https://www.youtube.com/watch?v=ok9',
        folder: '',
        playlistSize: 1,
        items: [item('ok9', null)],
      }),
    );
    await q.idle();
    expect(existsSync(join(root, 'Canción ok9.mp3'))).toBe(true);
    expect(listSources(db)).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM playlists').get()).toEqual({ n: 0 });
  });

  it('sin yt-dlp o sin ffmpeg no encola', () => {
    ytdlp = null;
    expect(() => q.enqueue(req())).toThrow(status(409));
    ytdlp = createYtDlp({ command: process.execPath, prefixArgs: [fake] });
    const noFfmpeg = makeQueue({ ffmpeg: () => false });
    expect(() => noFfmpeg.enqueue(req())).toThrow(status(409));
  });

  it('raíz inexistente → 404', () => {
    expect(() => q.enqueue(req({ rootId: 999 }))).toThrow(status(404));
  });

  it('la misma playlist en otro destino → 409; en el mismo, reutiliza la fuente', async () => {
    q.enqueue(req());
    expect(() => q.enqueue(req({ folder: 'Otra' }))).toThrow(status(409));
    q.enqueue(req({ items: [item('ok2', 2)] }));
    await q.idle();
    expect(listSources(db)).toHaveLength(1);
    expect(listSources(db)[0]!.downloaded).toBe(2);
  });

  it('emite eventos download con el avance', async () => {
    const events: DownloadEvent[] = [];
    bus.on('download', (e) => events.push(e));
    const job = q.enqueue(req({ items: [item('ok1', 1), item('ok2', 2)] }));
    await q.idle();
    expect(events.every((e) => e.jobId === job.id && e.total === 2)).toBe(true);
    expect(events.some((e) => e.status === 'running' && e.current?.title === 'Canción ok1')).toBe(true);
    expect(events.at(-1)).toMatchObject({ status: 'done', done: 2, failed: 0, current: null });
  });

  it('cancelar mata la canción en curso y deja el resto cancelado', async () => {
    const job = q.enqueue(req({ items: [item('hang1', 1), item('ok1', 2)] }));
    await vi.waitFor(() => expect(downloadedIds(fake)).toEqual(['hang1']));
    expect(q.busy()).toBe(true);
    q.cancel(job.id);
    await q.idle();
    expect(getJob(db, job.id)).toMatchObject({
      status: 'cancelled',
      finishedAt: expect.any(Number),
      items: [{ status: 'cancelled' }, { status: 'cancelled' }],
    });
    expect(downloadedIds(fake)).toEqual(['hang1']);
    expect(existsSync(join(tempRoot, String(job.id)))).toBe(false);
    expect(q.busy()).toBe(false);
  });

  it('cancelar un trabajo en espera no lo baja; uno terminado → 409; inexistente → 404', async () => {
    await q.stop();
    const job = q.enqueue(req());
    q.cancel(job.id);
    expect(getJob(db, job.id)).toMatchObject({ status: 'cancelled', items: [{ status: 'cancelled' }] });
    q.start();
    await q.idle();
    expect(downloadedIds(fake)).toEqual([]);
    expect(() => q.cancel(job.id)).toThrow(status(409));
    expect(() => q.cancel(999)).toThrow(status(404));
  });

  it('3 fallas seguidas por límite pausan el trabajo y siguen con el próximo', async () => {
    const a = q.enqueue(
      req({ items: [item('limit1', 1), item('limit2', 2), item('limit3', 3), item('ok4', 4)] }),
    );
    const b = q.enqueue(
      req({ kind: 'video', ytPlaylistId: null, folder: '', playlistSize: 1, items: [item('ok9', null)] }),
    );
    await q.idle();
    expect(getJob(db, a.id)).toMatchObject({
      status: 'paused',
      pauseReason: 'YouTube está limitando las descargas: esperá un rato o actualizá yt-dlp',
    });
    expect(getJob(db, a.id)!.items.map((i) => i.status)).toEqual(['failed', 'failed', 'pending', 'pending']);
    expect(getJob(db, b.id)!.status).toBe('done');
  });

  it('una falla que no es por límite corta la racha', async () => {
    const job = q.enqueue(
      req({
        items: [item('limit1', 1), item('limit2', 2), item('fail3', 3), item('limit4', 4), item('ok5', 5)],
      }),
    );
    await q.idle();
    expect(getJob(db, job.id)!.status).toBe('done');
  });

  it('raíz desconectada pausa y resume retoma', async () => {
    db.prepare("UPDATE roots SET status = 'offline' WHERE id = ?").run(rootId);
    const job = q.enqueue(req());
    await q.idle();
    expect(getJob(db, job.id)).toMatchObject({
      status: 'paused',
      pauseReason: 'La carpeta de destino no está conectada',
      items: [{ status: 'pending' }],
    });
    expect(() => q.resume(job.id + 100)).toThrow(status(404));
    db.prepare("UPDATE roots SET status = 'online' WHERE id = ?").run(rootId);
    q.resume(job.id);
    await q.idle();
    expect(getJob(db, job.id)).toMatchObject({
      status: 'done',
      pauseReason: null,
      items: [{ status: 'done' }],
    });
    expect(() => q.resume(job.id)).toThrow(status(409));
  });

  it('retry vuelve a intentar solo las fallidas', async () => {
    const job = q.enqueue(req({ items: [item('fail1', 1), item('ok1', 2)] }));
    await q.idle();
    q.retry(job.id);
    await q.idle();
    expect(downloadedIds(fake)).toEqual(['fail1', 'ok1', 'fail1']);
    expect(getJob(db, job.id)).toMatchObject({
      status: 'done',
      items: [{ status: 'failed' }, { status: 'done' }],
    });
  });

  it('stop deja la canción interrumpida para retomarla, sin marcarla fallida', async () => {
    const job = q.enqueue(req({ items: [item('hang1', 1), item('ok1', 2)] }));
    await vi.waitFor(() => expect(downloadedIds(fake)).toEqual(['hang1']));
    await q.stop();
    expect(getJob(db, job.id)).toMatchObject({
      status: 'running',
      items: [{ status: 'downloading', error: null }, { status: 'pending' }],
    });
    expect(downloadedIds(fake)).toEqual(['hang1']);
  });

  it('al arrancar retoma lo interrumpido y limpia los temporales', async () => {
    await q.stop();
    const job = q.enqueue(req({ items: [item('ok1', 1)] }));
    setJobStatus(db, job.id, 'running');
    setItem(db, job.id, 'ok1', { status: 'downloading' });
    mkdirSync(join(tempRoot, 'viejo'), { recursive: true });
    q = makeQueue();
    q.start();
    expect(existsSync(join(tempRoot, 'viejo'))).toBe(false);
    await q.idle();
    expect(getJob(db, job.id)).toMatchObject({ status: 'done', items: [{ status: 'done' }] });
  });

  it('remove no deja quitar un trabajo en curso', async () => {
    const job = q.enqueue(req({ items: [item('hang1', 1)] }));
    await vi.waitFor(() => expect(getJob(db, job.id)!.items[0]!.status).toBe('downloading'));
    expect(() => q.remove(job.id)).toThrow(status(409));
    q.cancel(job.id);
    await q.idle();
    q.remove(job.id);
    expect(getJob(db, job.id)).toBeUndefined();
    expect(listJobs(db)).toEqual([]);
  });

  it('quitar la raíz con un trabajo en espera no rompe la cola', async () => {
    await q.stop();
    const otherRoot = await tmpDir();
    const otherId = addRootRow(db, otherRoot);
    q.enqueue(req());
    const b = q.enqueue(req({ rootId: otherId, ytPlaylistId: 'PL2', items: [item('ok2', 1)] }));
    db.prepare('DELETE FROM roots WHERE id = ?').run(rootId);
    q.start();
    await q.idle();
    expect(listJobs(db).map((j) => [j.id, j.status])).toEqual([[b.id, 'done']]);
    expect(existsSync(join(otherRoot, 'Fake Playlist', '01 - Canción ok2.mp3'))).toBe(true);
  });

  it('numera con tres dígitos las playlists de más de 99 videos', async () => {
    q.enqueue(req({ playlistSize: 120, items: [item('ok1', 7)] }));
    await q.idle();
    expect(readdirSync(join(root, 'Fake Playlist'))).toEqual(['007 - Canción ok1.mp3']);
  });
});
