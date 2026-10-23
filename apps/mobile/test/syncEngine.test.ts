import type { Catalog } from '@dsmn/shared';
import { describe, expect, it, vi } from 'vitest';
import { ServerUnreachableError, UnauthorizedError, type ServerClient } from '../src/core/http.ts';
import { LocalStore } from '../src/core/store.ts';
import { InsufficientSpaceError, coverPath, runSync } from '../src/core/syncEngine.ts';
import { fakeDownloader, memoryFiles, sqliteDb, trackFor, type Behavior } from './helpers.ts';

const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);
const URL = (id: string) => `http://srv/api/tracks/${id}/file`;

function setup(
  opts: { free?: number; behave?: (url: string, attempt: number) => Behavior; catalogError?: Error } = {},
) {
  const data = { t1: bytes(300_000, 1), t2: bytes(1000, 2), t3: bytes(2000, 3) };
  const tracks = Object.entries(data).map(([id, d]) => trackFor(id, d));
  const catalog: Catalog = {
    serverId: 'srv',
    revision: 1,
    tracks,
    albums: [{ id: 'al1', title: 'Disco', artist: 'A', year: null, coverId: null, trackIds: ['t1', 't2'] }],
    playlists: [{ id: 'p1', name: 'Lista', type: 'manual', folder: null, trackIds: ['t2', 't3'] }],
  };
  const client: ServerClient = {
    catalog: vi.fn(async () => {
      if (opts.catalogError) throw opts.catalogError;
      return { notModified: false as const, catalog, etag: '"1"' };
    }),
    trackUrl: URL,
    coverUrl: (id: string) => `http://srv/api/covers/${id}`,
    authHeaders: () => ({ Authorization: 'Bearer tok' }),
  };
  const store = new LocalStore(sqliteDb());
  const files = memoryFiles(opts.free);
  const contents = new Map(Object.entries(data).map(([id, d]) => [URL(id), d]));
  const downloader = fakeDownloader(files, contents, opts.behave);
  const sleep = vi.fn(async (_ms: number) => {});
  const run = (extra: Partial<Parameters<typeof runSync>[0]> = {}) =>
    runSync({ client, store, files, downloader, sleep, ...extra });
  return { catalog, client, store, files, downloader, sleep, run, data };
}

describe('runSync', () => {
  it('baja lo seleccionado, verifica la huella y lo registra', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const report = await s.run();
    expect(report).toMatchObject({ downloaded: 2, deleted: 0, failed: [], paused: false });
    expect([...s.files.files.keys()].sort()).toEqual(['/music/t1.mp3', '/music/t2.mp3']);
    expect(s.store.getDownloads().map((d) => d.trackId)).toEqual(['t1', 't2']);
    expect(s.downloader.calls[0]?.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(s.store.getCatalog()?.etag).toBe('"1"');
  });

  it('desmarcar un álbum no borra la canción que sigue en una lista marcada', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    s.store.setSelected({ kind: 'playlist', id: 'p1' }, true);
    await s.run();
    s.store.setSelected({ kind: 'album', id: 'al1' }, false);
    const report = await s.run();
    expect(report).toMatchObject({ deleted: 1, downloaded: 0 });
    expect(s.store.getDownloads().map((d) => d.trackId)).toEqual(['t2', 't3']);
    expect(s.files.exists('/music/t1.mp3')).toBe(false);
  });

  it('borra lo desmarcado salvo la canción que está sonando', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await s.run();
    s.store.setSelected({ kind: 'album', id: 'al1' }, false);
    const report = await s.run({ protectedTrackIds: new Set(['t1']) });
    expect(report.deleted).toBe(1);
    expect(s.store.getDownloads().map((d) => d.trackId)).toEqual(['t1']);
  });

  it('sin espacio no toca nada', async () => {
    const s = setup({ free: 200 * 1024 * 1024 + 1000 });
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const err = await s.run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientSpaceError);
    expect((err as InsufficientSpaceError).missingBytes).toBe(301_000 - 1000);
    expect(s.downloader.calls).toHaveLength(0);
  });

  it('token revocado: avisa y no borra nada', async () => {
    const s = setup();
    s.store.addDownload({ trackId: 't1', fingerprint: 'x', path: '/music/t1.mp3', size: 1 });
    s.files.files.set('/music/t1.mp3', new Uint8Array([1]));
    const s2 = {
      ...s,
      client: { ...s.client, catalog: vi.fn(async () => Promise.reject(new UnauthorizedError('no'))) },
    };
    await expect(runSync({ ...s2 })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(s.store.getDownloads()).toHaveLength(1);
    expect(s.files.exists('/music/t1.mp3')).toBe(true);
  });

  it('huella distinta → rebaja completa una vez; si sigue mal, falla', async () => {
    const corrupt = bytes(1000, 99);
    const once = setup({
      behave: (url, attempt) => (url === URL('t2') && attempt === 1 ? corrupt : undefined),
    });
    once.store.setSelected({ kind: 'album', id: 'al1' }, true);
    expect(await once.run()).toMatchObject({ downloaded: 2, failed: [] });
    expect(once.downloader.calls.filter((c) => c.url === URL('t2'))).toHaveLength(2);

    const always = setup({ behave: (url) => (url === URL('t2') ? corrupt : undefined) });
    always.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const report = await always.run();
    expect(report.failed).toEqual([{ trackId: 't2', error: 'La huella no coincide' }]);
    expect(always.store.getDownloads().map((d) => d.trackId)).toEqual(['t1']);
    expect(always.files.exists('/music/t2.part')).toBe(false);
  });

  it('un .part de una ejecución cortada nunca queda registrado', async () => {
    const s = setup();
    s.files.files.set('/music/t2.part', new Uint8Array([1, 2, 3]));
    s.store.setSelected({ kind: 'playlist', id: 'p1' }, true);
    await s.run();
    expect(s.downloader.calls.find((c) => c.url === URL('t2'))?.resumeState).toBeUndefined();
    expect(s.store.getDownloads().find((d) => d.trackId === 't2')).toMatchObject({ path: '/music/t2.mp3' });
    expect(s.files.exists('/music/t2.part')).toBe(false);
  });

  it('pausa: guarda el estado y lo usa al retomar', async () => {
    let pause = true;
    const s = setup({ behave: (url) => (pause && url === URL('t1') ? 'pause' : undefined) });
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const first = await s.run();
    expect(first.paused).toBe(true);
    expect(s.store.getPartial('t1')).toMatchObject({ state: `estado-${URL('t1')}` });
    pause = false;
    const second = await s.run();
    expect(second.paused).toBe(false);
    const resumed = s.downloader.calls.filter((c) => c.url === URL('t1')).at(-1);
    expect(resumed?.resumeState).toBe(`estado-${URL('t1')}`);
    // Al retomar se manda If-Range: si el archivo cambió en la compu, el servidor responde el archivo completo.
    expect(resumed?.headers).toEqual({
      Authorization: 'Bearer tok',
      'If-Range': `"${s.catalog.tracks[0]!.fingerprint}"`,
    });
    expect(s.store.getPartial('t1')).toBeNull();
  });

  it('un estado de pausa de otra versión del archivo no se usa', async () => {
    const s = setup();
    s.store.setPartial('t2', 'huella-vieja', 'estado-viejo');
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await s.run();
    expect(s.downloader.calls.find((c) => c.url === URL('t2'))?.resumeState).toBeUndefined();
  });

  it('reintenta 3 veces con espera y sigue con las demás', async () => {
    const s = setup({ behave: (url) => (url === URL('t1') ? 'fail' : undefined) });
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const report = await s.run();
    expect(s.sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    expect(report.failed).toEqual([{ trackId: 't1', error: 'Se cortó la descarga' }]);
    expect(report.downloaded).toBe(1);
    expect(s.store.getFailures()).toEqual([{ trackId: 't1', error: 'Se cortó la descarga' }]);
  });

  it('servidor caído a mitad: frena y conserva lo ya bajado', async () => {
    const s = setup({ behave: (url) => (url === URL('t3') ? 'unreachable' : undefined) });
    s.store.setSelected({ kind: 'playlist', id: 'p1' }, true);
    await expect(s.run()).rejects.toBeInstanceOf(ServerUnreachableError);
    expect(s.store.getDownloads().map((d) => d.trackId)).toEqual(['t2']);
    expect(s.sleep).not.toHaveBeenCalled();
  });

  it('catálogo sin cambios (304) usa el guardado', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await s.run();
    s.client.catalog = vi.fn(async () => ({ notModified: true as const }));
    expect(await s.run()).toMatchObject({ downloaded: 0, deleted: 0 });
    expect(s.client.catalog).toHaveBeenCalledWith('"1"');
  });

  it('reporta progreso por bytes', async () => {
    const s = setup();
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const progress: { phase: string; bytesDone: number; bytesTotal: number }[] = [];
    await s.run({ onProgress: (p) => progress.push(p) });
    const last = progress.at(-1)!;
    expect(last.phase).toBe('done');
    expect(last.bytesDone).toBe(last.bytesTotal);
    expect(last.bytesTotal).toBe(301_000);
  });

  it('baja las portadas de lo descargado y borra las que sobran', async () => {
    const cover = new Uint8Array([7, 7, 7]);
    const s = setup();
    s.catalog.tracks[0]!.coverId = 'c1';
    s.catalog.tracks[1]!.coverId = 'c1';
    s.catalog.tracks[2]!.coverId = 'c3';
    s.files.files.set('/covers/c9', new Uint8Array([9]));
    const download = s.downloader.download.bind(s.downloader);
    s.downloader.download = async (req) => {
      if (req.url === 'http://srv/api/covers/c1') {
        s.files.files.set(req.dest, cover);
        return { status: 'done' };
      }
      return download(req);
    };
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const report = await s.run();
    expect(report.failed).toEqual([]);
    expect(s.files.files.get('/covers/c1')).toEqual(cover);
    expect(s.files.exists('/covers/c9')).toBe(false);
    expect(s.files.exists('/covers/c3')).toBe(false);
    expect(coverPath(s.files, 'c1')).toBe('/covers/c1');
  });

  it('una portada que falla no afecta el resultado', async () => {
    const s = setup({ behave: (url) => (url.includes('/api/covers/') ? 'fail' : undefined) });
    s.catalog.tracks[0]!.coverId = 'c1';
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    const report = await s.run();
    expect(report).toMatchObject({ downloaded: 2, failed: [] });
    expect(s.sleep).not.toHaveBeenCalled();
  });

  it('no baja portadas si la sincronización quedó en pausa', async () => {
    const s = setup({ behave: (url) => (url === URL('t1') ? 'pause' : undefined) });
    s.catalog.tracks[1]!.coverId = 'c1';
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await s.run();
    expect(s.downloader.calls.some((c) => c.url.includes('/api/covers/'))).toBe(false);
  });

  it('una portada interrumpida no queda a medias', async () => {
    const s = setup();
    s.catalog.tracks[0]!.coverId = 'c1';
    const download = s.downloader.download.bind(s.downloader);
    s.downloader.download = async (req) => {
      if (req.url.includes('/api/covers/')) {
        s.files.files.set(req.dest, new Uint8Array([1]));
        return { status: 'paused', state: 'x' };
      }
      return download(req);
    };
    s.store.setSelected({ kind: 'album', id: 'al1' }, true);
    await s.run();
    expect([...s.files.files.keys()].filter((k) => k.startsWith('/covers/'))).toEqual([]);
  });
});
