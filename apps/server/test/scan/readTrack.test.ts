import { describe, expect, it } from 'vitest';
import { formatFromPath, readTrackFile } from '../../src/scan/readTrack.ts';
import { writeTmp } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

describe('readTrackFile', () => {
  it('lee tags completos', async () => {
    const f = await writeTmp(
      'a.mp3',
      makeMp3(
        {
          title: 'Canción ñandú',
          artist: 'Björk',
          albumArtist: 'Varios',
          album: 'Homogenic',
          track: '3/10',
          disc: '1/2',
          year: '1997',
        },
        { seconds: 2 },
      ),
    );
    const { meta, picture } = await readTrackFile(f);
    expect(meta).toMatchObject({
      title: 'Canción ñandú',
      artist: 'Björk',
      albumArtist: 'Varios',
      album: 'Homogenic',
      trackNo: 3,
      discNo: 1,
      year: 1997,
      format: 'mp3',
    });
    expect(meta.durationMs).toBeGreaterThan(1500);
    expect(meta.durationMs).toBeLessThan(2500);
    expect(picture).toBeNull();
  });

  it('aplica valores por defecto sin tags', async () => {
    const { meta } = await readTrackFile(await writeTmp('Mi tema.mp3', makeMp3({})));
    expect(meta).toMatchObject({
      title: 'Mi tema',
      artist: 'Artista desconocido',
      albumArtist: null,
      album: 'Sin álbum',
      trackNo: null,
    });
  });

  it('devuelve la portada incrustada', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const { picture } = await readTrackFile(
      await writeTmp('c.mp3', makeMp3({}, { picture: { mime: 'image/png', data: png } })),
    );
    expect(picture?.mime).toBe('image/png');
    expect([...picture!.data]).toEqual([...png]);
  });

  it('lanza con un archivo que no es audio', async () => {
    await expect(readTrackFile(await writeTmp('x.mp3', new TextEncoder().encode('hola')))).rejects.toThrow();
  });

  it('formatFromPath', () => {
    expect(['a.MP3', 'b.oga', 'c.opus', 'd.txt'].map(formatFromPath)).toEqual(['mp3', 'ogg', 'opus', null]);
  });
});
