import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { DownloadEvent, EnqueueRequest } from '@dsmn/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDownloadQueue, type DownloadQueue } from '../../src/downloads/queue.ts';
import { getJob, listSources } from '../../src/downloads/store.ts';
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

  it('numera con tres dígitos las playlists de más de 99 videos', async () => {
    q.enqueue(req({ playlistSize: 120, items: [item('ok1', 7)] }));
    await q.idle();
    expect(readdirSync(join(root, 'Fake Playlist'))).toEqual(['007 - Canción ok1.mp3']);
  });
});
