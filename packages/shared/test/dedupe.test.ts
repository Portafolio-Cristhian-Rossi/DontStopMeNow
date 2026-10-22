import { describe, expect, it } from 'vitest';
import { analyzeEntries, parseSongTitle, type PreviewEntry } from '../src/index.ts';

const e = (
  videoId: string,
  title: string,
  channel: string | null = 'Canal',
  extra: Partial<PreviewEntry> = {},
): PreviewEntry => ({
  videoId,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  title,
  channel,
  durationSec: 200,
  position: null,
  unavailable: false,
  ...extra,
});

describe('parseSongTitle', () => {
  it('separa artista, limpia ruido y detecta versiones', () => {
    expect(parseSongTitle('Atlus - Mass Destruction (Official Video)', 'X')).toEqual({
      artist: 'atlus',
      artistFromTitle: true,
      base: 'mass destruction',
      tags: [],
    });
    expect(parseSongTitle('Burn My Dread [Lyrics]', 'Atlus - Topic')).toEqual({
      artist: 'atlus',
      artistFromTitle: false,
      base: 'burn my dread',
      tags: [],
    });
    expect(parseSongTitle('Canción feat. Otro (En Vivo)', 'ArtistaVEVO')).toEqual({
      artist: 'artista',
      artistFromTitle: false,
      base: 'cancion',
      tags: ['live'],
    });
    expect(parseSongTitle('Song (Sped Up) [Remix]', null).tags).toEqual(['remix', 'sped up']);
  });

  it('las etiquetas solo cuentan entre paréntesis o corchetes', () => {
    expect(parseSongTitle('Oasis - Live Forever', null)).toMatchObject({ base: 'live forever', tags: [] });
    expect(parseSongTitle('Cover Me (Part 2)', null)).toMatchObject({ base: 'cover me part 2', tags: [] });
  });
});

describe('analyzeEntries', () => {
  it('marca repetidas dentro del link (aunque las suba un fan) y deja la primera', () => {
    const r = analyzeEntries(
      [
        e('a', 'Atlus - Mass Destruction'),
        e('b', 'Mass Destruction (Lyrics)', 'Fan123'),
        e('c', 'Atlus - Mass Destruction [Audio]'),
      ],
      [],
    );
    expect(r.map((x) => [x.duplicateOf, x.selected])).toEqual([
      [null, true],
      ['a', false],
      ['a', false],
    ]);
  });

  it('sin artista no contradice', () => {
    const r = analyzeEntries(
      [e('a', 'Atlus - Mass Destruction'), e('b', 'Mass Destruction (Lyrics)', null)],
      [],
    );
    expect(r[1]!.duplicateOf).toBe('a');
  });

  it('mismo título y distinto artista no son repetidas', () => {
    const r = analyzeEntries([e('a', 'Queen - Home'), e('b', 'Ed Sheeran - Home')], []);
    expect(r[1]!.duplicateOf).toBeNull();
  });

  it('agrupa versiones sin desmarcarlas', () => {
    const r = analyzeEntries([e('a', 'Atlus - Wake Up'), e('b', 'Atlus - Wake Up (Live)')], []);
    expect(r.map((x) => [x.versionGroup, x.selected])).toEqual([
      ['wake up', true],
      ['wake up', true],
    ]);
    expect(r[1]!.versionTags).toEqual(['live']);
  });

  it('detecta lo que ya está en la biblioteca solo con artista', () => {
    const lib = [
      { id: 't1', title: 'Life Will Change', artist: 'Atlus' },
      { id: 't2', title: 'Home', artist: 'Queen' },
    ];
    const r = analyzeEntries(
      [e('a', 'Atlus - Life Will Change (Official Audio)'), e('b', 'Home', null)],
      lib,
    );
    expect(r.map((x) => [x.inLibrary, x.selected])).toEqual([
      ['t1', false],
      [null, true],
    ]);
  });

  it('no disponibles y ya bajados vienen desmarcados', () => {
    const r = analyzeEntries(
      [e('a', '[Private video]', null, { unavailable: true }), e('b', 'X - Y')],
      [],
      new Set(['b']),
    );
    expect(r.map((x) => [x.alreadyDownloaded, x.selected])).toEqual([
      [false, false],
      [true, false],
    ]);
  });
});
