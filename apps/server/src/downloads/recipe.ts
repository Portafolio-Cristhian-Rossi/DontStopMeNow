/**
 * La receta de descarga del usuario (D:\Music\Descargar Playlist.txt), adaptada a bajar de a una canción: sin
 * --embed-subs (no hace nada en MP3) y sin --sleep-interval (la pausa entre canciones la maneja la cola).
 */
const RECIPE = [
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
];

/** Lista los videos de un link sin bajar nada. */
export const PREVIEW_ARGS = ['--flat-playlist', '-J', '--no-warnings'];

/** Líneas que el adaptador interpreta: progreso y archivo final. */
const PROGRESS_TEMPLATE =
  'download:dsmn-progress %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s';
const FILE_TEMPLATE = 'after_move:dsmn-file %(filepath)s';

/** Ancho de la numeración "NN - Título": tres dígitos para playlists de más de 99 videos. */
export function numberWidthFor(playlistSize: number): 2 | 3 {
  return playlistSize > 99 ? 3 : 2;
}

export function outputTemplate(position: number | null, numberWidth: number): string {
  if (position === null) return '%(title)s.%(ext)s';
  return `${String(position).padStart(numberWidth, '0')} - %(title)s.%(ext)s`;
}

export function buildDownloadArgs(o: {
  videoUrl: string;
  destDir: string;
  tempDir: string;
  position: number | null;
  numberWidth: number;
}): string[] {
  return [
    ...RECIPE,
    '--no-playlist',
    '--newline',
    // --print implica --quiet, que oculta el progreso.
    '--progress',
    '--no-warnings',
    '-P',
    `home:${o.destDir}`,
    '-P',
    `temp:${o.tempDir}`,
    '-o',
    outputTemplate(o.position, o.numberWidth),
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--print',
    FILE_TEMPLATE,
    '--',
    o.videoUrl,
  ];
}
