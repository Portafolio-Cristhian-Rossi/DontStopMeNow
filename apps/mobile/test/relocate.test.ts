import { describe, expect, it } from 'vitest';
import { relocateDownloads } from '../src/core/relocate.ts';
import { LocalStore } from '../src/core/store.ts';
import { makeCatalog, makeTrack, memoryFiles, sqliteDb } from './helpers.ts';

function setup() {
  const store = new LocalStore(sqliteDb());
  const files = memoryFiles();
  const catalog = makeCatalog({
    tracks: [makeTrack('t1', { title: 'Uno' }), makeTrack('t2', { title: 'Dos' }), makeTrack('t3')],
  });
  for (const id of ['t1', 't2']) {
    const path = `/music/${id}.mp3`;
    files.files.set(path, new Uint8Array([1, 2, 3]));
    store.addDownload({ trackId: id, fingerprint: `fp-${id}`, path, size: 3 });
  }
  return { store, files, catalog };
}

describe('relocateDownloads', () => {
  it('mueve lo bajado a la carpeta elegida y actualiza las rutas', async () => {
    const s = setup();
    s.files.folder = true;
    const progress: [number, number][] = [];
    const report = await relocateDownloads({ ...s, onProgress: (d, t) => progress.push([d, t]) });
    expect(report).toEqual({ moved: 2, failed: 0, skipped: 0 });
    expect(s.store.getDownloads().map((d) => d.path)).toEqual([
      '/sd/Uno - Artista.mp3',
      '/sd/Dos - Artista.mp3',
    ]);
    expect(s.files.list('/music')).toEqual([]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('no toca lo que ya está en el destino ni la canción que suena', async () => {
    const s = setup();
    s.files.folder = true;
    await relocateDownloads({ ...s, protectedTrackIds: new Set(['t2']) });
    const again = await relocateDownloads({ ...s, protectedTrackIds: new Set(['t2']) });
    expect(again).toEqual({ moved: 0, failed: 0, skipped: 1 });
    expect(s.store.getDownloads().find((d) => d.trackId === 't2')?.path).toBe('/music/t2.mp3');
  });

  it('una copia incompleta se borra y la canción queda donde estaba', async () => {
    const s = setup();
    s.files.folder = true;
    s.files.copyToTarget = async (_path, track) => {
      const dest = `/sd/${track.id}.mp3`;
      s.files.files.set(dest, new Uint8Array([1]));
      return dest;
    };
    const report = await relocateDownloads(s);
    expect(report).toEqual({ moved: 0, failed: 2, skipped: 0 });
    expect(s.store.getDownloads().map((d) => d.path)).toEqual(['/music/t1.mp3', '/music/t2.mp3']);
    expect(s.files.list('/sd')).toEqual([]);
    expect(s.files.exists('/music/t1.mp3')).toBe(true);
  });

  it('de vuelta a la memoria del celular usa los nombres internos', async () => {
    const s = setup();
    s.files.folder = true;
    await relocateDownloads(s);
    s.files.folder = false;
    expect(await relocateDownloads(s)).toMatchObject({ moved: 2 });
    expect(s.store.getDownloads().map((d) => d.path)).toEqual(['/music/t1.mp3', '/music/t2.mp3']);
  });

  it('se puede cortar', async () => {
    const s = setup();
    s.files.folder = true;
    const abort = new AbortController();
    abort.abort();
    expect(await relocateDownloads({ ...s, signal: abort.signal })).toEqual({
      moved: 0,
      failed: 0,
      skipped: 0,
    });
  });
});
