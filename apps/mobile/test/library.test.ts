import { describe, expect, it } from 'vitest';
import { entrySize, libraryView, selectionSummary } from '../src/core/library.ts';
import { makeCatalog, makeTrack } from './helpers.ts';

describe('libraryView', () => {
  it('solo muestra lo descargado y oculta álbumes y listas vacíos', () => {
    const catalog = makeCatalog({
      tracks: [makeTrack('t1'), makeTrack('t2'), makeTrack('t3', { albumId: 'al2', artist: 'Björk' })],
      albums: [
        { id: 'al1', title: 'Disco', artist: 'Zeta', year: null, coverId: null, trackIds: ['t1', 't2'] },
        { id: 'al2', title: 'Homogenic', artist: 'Björk', year: null, coverId: null, trackIds: ['t3'] },
      ],
      playlists: [
        { id: 'p1', name: 'Mix', type: 'manual', folder: null, trackIds: ['t2', 't3'] },
        { id: 'p2', name: 'Vacía', type: 'manual', folder: null, trackIds: ['t3'] },
      ],
    });
    const view = libraryView(catalog, new Set(['t1', 't2']));
    expect(view.albums.map((a) => [a.id, a.trackIds])).toEqual([['al1', ['t1', 't2']]]);
    expect(view.playlists.map((p) => [p.id, p.trackIds])).toEqual([['p1', ['t2']]]);
    expect(view.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(view.artists).toEqual([{ name: 'Zeta', albumIds: ['al1'] }]);
  });

  it('ordena artistas con criterio español', () => {
    const catalog = makeCatalog({
      tracks: [makeTrack('a', { albumId: 'x' }), makeTrack('b', { albumId: 'y' })],
      albums: [
        { id: 'x', title: 'X', artist: 'Ñandú', year: null, coverId: null, trackIds: ['a'] },
        { id: 'y', title: 'Y', artist: 'Nada', year: null, coverId: null, trackIds: ['b'] },
      ],
      playlists: [],
    });
    expect(libraryView(catalog, new Set(['a', 'b'])).artists.map((a) => a.name)).toEqual(['Nada', 'Ñandú']);
  });
});

describe('selectionSummary', () => {
  it('cuenta una vez las canciones compartidas', () => {
    expect(
      selectionSummary(makeCatalog(), [
        { kind: 'album', id: 'al1' },
        { kind: 'playlist', id: 'p1' },
      ]),
    ).toEqual({ trackCount: 3, bytes: 300 });
  });

  it('ignora selecciones que ya no existen', () => {
    expect(selectionSummary(makeCatalog(), [{ kind: 'album', id: 'nope' }])).toEqual({
      trackCount: 0,
      bytes: 0,
    });
  });

  it('entrySize suma tamaños', () => {
    expect(entrySize(makeCatalog(), ['t1', 't2'])).toBe(200);
  });
});
