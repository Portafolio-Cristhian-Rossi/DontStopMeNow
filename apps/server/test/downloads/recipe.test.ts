import { describe, expect, it } from 'vitest';
import {
  PREVIEW_ARGS,
  buildDownloadArgs,
  numberWidthFor,
  outputTemplate,
} from '../../src/downloads/recipe.ts';

describe('receta de yt-dlp', () => {
  it('arma la receta para una canción de playlist', () => {
    const args = buildDownloadArgs({
      videoUrl: 'https://www.youtube.com/watch?v=abc',
      destDir: 'D:\\Music\\P',
      tempDir: 'T',
      position: 7,
      numberWidth: 2,
    });
    expect(args.slice(0, 11)).toEqual([
      '-x',
      '--audio-format',
      'mp3',
      '--add-metadata',
      '--embed-thumbnail',
      '--convert-thumbnails',
      'jpg',
      '--sleep-requests',
      '2',
      '--postprocessor-args',
      'ffmpeg:-id3v2_version 3',
    ]);
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--progress');
    expect(args).toContain('home:D:\\Music\\P');
    expect(args).toContain('temp:T');
    expect(args.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=abc']);
    expect(args[args.indexOf('-o') + 1]).toBe('07 - %(title)s.%(ext)s');
    expect(args).not.toContain('--embed-subs');
  });

  it('numeración de 3 dígitos y video suelto', () => {
    expect([numberWidthFor(99), numberWidthFor(120)]).toEqual([2, 3]);
    expect(outputTemplate(7, 3)).toBe('007 - %(title)s.%(ext)s');
    expect(outputTemplate(null, 2)).toBe('%(title)s.%(ext)s');
  });

  it('la previsualización no baja nada', () => {
    expect(PREVIEW_ARGS).toEqual(['--flat-playlist', '-J', '--no-warnings']);
  });
});
