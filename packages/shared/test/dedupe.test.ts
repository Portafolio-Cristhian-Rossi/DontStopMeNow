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

  it('el nombre de la canción no se toma como etiqueta: "Live Forever" no es una versión en vivo', () => {
    expect(parseSongTitle('Oasis - Live Forever', null)).toMatchObject({ base: 'live forever', tags: [] });
  });

  it('lo que no es ruido entre paréntesis, entre -guiones- o en un segmento extra es una variante', () => {
    expect(parseSongTitle('Cover Me (Part 2)', null)).toMatchObject({ base: 'cover me', tags: ['part 2'] });
    expect(parseSongTitle('Joy (P3R ver.)', null)).toMatchObject({ base: 'joy', tags: ['p3r ver'] });
    expect(parseSongTitle("When The Moon's Reaching Out Stars -Reload-", null)).toMatchObject({
      base: 'when the moon s reaching out stars',
      tags: ['reload'],
    });
    expect(
      parseSongTitle('Persona 5 OST - Life Will Change - Instrumental ver  Extended', null),
    ).toMatchObject({
      base: 'life will change',
      tags: ['extended', 'instrumental'],
    });
  });

  it('ignora el ruido habitual de YouTube', () => {
    expect(
      parseSongTitle('Persona 5 - Wake up, Get up, Get out there - sub español & sub english', null),
    ).toMatchObject({
      base: 'wake up get up get out there',
      tags: [],
    });
    expect(parseSongTitle('Persona 5 - Life Will Change (中英歌詞)', null)).toMatchObject({
      base: 'life will change',
      tags: [],
    });
    expect(parseSongTitle('Pursuing My True Self (FULL w/ lyrics)', null)).toMatchObject({
      base: 'pursuing my true self',
      tags: [],
    });
    expect(parseSongTitle('Persona 4 Golden - Time to Make History REAL Lyrics', null)).toMatchObject({
      base: 'time to make history real',
    });
  });
});

describe('versiones en una playlist real', () => {
  it('agrupa las versiones de la misma canción sin desmarcar ninguna', () => {
    const titles = [
      "Persona 3 OST - When The Moon's Reaching Out Stars",
      'Persona 3 OST - Joy',
      'Persona 3 The Movie: #1 - Burn My Dread -Spring of Birth ver.-',
      'Persona 5 - Life Will Change (中英歌詞)',
      'Persona 5 OST - Life Will Change - Instrumental ver  Extended',
      "When The Moon's Reaching Out Stars -Reload-",
      'Joy (P3R ver.)',
      'Burn My Dread -Reload-',
      'Persona 3 OST - Mass Destruction',
    ];
    const r = analyzeEntries(
      titles.map((t, i) => e(`v${i}`, t, null)),
      [],
    );
    const group = (i: number) => r[i]!.versionGroup;
    expect(group(0)).not.toBeNull();
    expect(group(5)).toBe(group(0));
    expect(group(6)).toBe(group(1));
    expect(group(7)).toBe(group(2));
    expect(group(4)).toBe(group(3));
    expect(group(8)).toBeNull();
    expect(r.every((x) => x.selected && x.duplicateOf === null)).toBe(true);
  });

  it('dos canciones distintas del mismo juego no se agrupan ni se marcan repetidas', () => {
    const r = analyzeEntries(
      [
        e('a', 'Take Over (Battle Theme) - Persona 5 Royal', null),
        e('b', 'Colors Flying High Full (Cleanest-outdated) - Persona 5 Royal OST', null),
      ],
      [],
    );
    expect(r.map((x) => [x.duplicateOf, x.versionGroup, x.selected])).toEqual([
      [null, null, true],
      [null, null, true],
    ]);
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
