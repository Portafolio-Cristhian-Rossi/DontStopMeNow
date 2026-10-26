import { describe, expect, it } from 'vitest';
import { computeSyncPlan, type Catalog, type LocalDownload, type Track } from '../src/index.ts';

const track = (id: string, available = true): Track => ({
  id,
  title: id,
  artist: 'A',
  albumId: 'a1',
  trackNo: null,
  discNo: null,
  durationMs: 1000,
  size: 100,
  format: 'mp3',
  fingerprint: `fp-${id}`,
  coverId: null,
  available,
});

const cat: Pick<Catalog, 'tracks' | 'albums' | 'playlists'> = {
  tracks: [track('t1'), track('t2'), track('t3'), track('t4'), track('t5', false)],
  albums: [{ id: 'a1', title: 'A1', artist: 'A', year: null, coverId: null, trackIds: ['t1', 't2'] }],
  playlists: [{ id: 'p1', name: 'P1', type: 'manual', folder: null, trackIds: ['t2', 't3'] }],
};

const dl = (id: string): LocalDownload => ({ trackId: id, fingerprint: `fp-${id}` });

describe('computeSyncPlan', () => {
  it('baja la unión de lo seleccionado una sola vez', () => {
    const plan = computeSyncPlan(
      cat,
      [
        { kind: 'album', id: 'a1' },
        { kind: 'playlist', id: 'p1' },
      ],
      [],
    );
    expect(plan.download.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(plan.delete).toEqual([]);
  });
  it('borra lo bajado que ya no es deseado', () => {
    const plan = computeSyncPlan(cat, [{ kind: 'album', id: 'a1' }], [dl('t1'), dl('t3')]);
    expect(plan.download.map((t) => t.id)).toEqual(['t2']);
    expect(plan.delete).toEqual(['t3']);
  });
  it('rebaja si cambió la huella', () => {
    const plan = computeSyncPlan(
      cat,
      [{ kind: 'album', id: 'a1' }],
      [{ trackId: 't1', fingerprint: 'viejo' }, dl('t2')],
    );
    expect(plan.download.map((t) => t.id)).toEqual(['t1']);
  });
  it('poda selección inexistente y borra sus canciones', () => {
    const plan = computeSyncPlan(cat, [{ kind: 'playlist', id: 'borrada' }], [dl('t3')]);
    expect(plan.prunedSelection).toEqual([]);
    expect(plan.delete).toEqual(['t3']);
  });
  it('no baja ni borra canciones no disponibles que siguen seleccionadas', () => {
    const c = {
      ...cat,
      albums: [
        ...cat.albums,
        { id: 'a2', title: 'X', artist: 'Y', year: null, coverId: null, trackIds: ['t5'] },
      ],
    };
    expect(computeSyncPlan(c, [{ kind: 'album', id: 'a2' }], []).download).toEqual([]);
    expect(computeSyncPlan(c, [{ kind: 'album', id: 'a2' }], [dl('t5')]).delete).toEqual([]);
  });
  it('borra descargas de canciones que ya no existen en el catálogo', () => {
    expect(computeSyncPlan(cat, [], [{ trackId: 'fantasma', fingerprint: 'x' }]).delete).toEqual([
      'fantasma',
    ]);
  });
});

describe('selección de Favoritas', () => {
  it('baja las favoritas (una copia por huella) y se borran al desmarcarlas', () => {
    const c = {
      ...cat,
      tracks: [
        { ...track('t1'), favoritedAt: 5 },
        { ...track('t3'), favoritedAt: 9 },
        { ...track('t4'), fingerprint: 'fp-t3', favoritedAt: 9 },
        track('t2'),
      ],
    };
    const plan = computeSyncPlan(c, [{ kind: 'favorites', id: 'favoritas' }], [dl('t2')]);
    expect(plan.download.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(plan.delete).toEqual(['t2']);
    expect(plan.prunedSelection).toEqual([{ kind: 'favorites', id: 'favoritas' }]);
  });
});
