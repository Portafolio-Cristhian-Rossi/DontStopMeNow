import path from 'node:path';
import { parseFile } from 'music-metadata';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, type AudioFormat } from '@dsmn/shared';

export interface TrackMeta {
  title: string;
  artist: string;
  albumArtist: string | null;
  album: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  durationMs: number;
  format: AudioFormat;
}

export interface Picture {
  mime: string;
  data: Uint8Array;
}

const FORMATS: Record<string, AudioFormat> = {
  '.mp3': 'mp3',
  '.flac': 'flac',
  '.m4a': 'm4a',
  '.aac': 'aac',
  '.ogg': 'ogg',
  '.oga': 'ogg',
  '.opus': 'opus',
  '.wav': 'wav',
};

export function formatFromPath(p: string): AudioFormat | null {
  return FORMATS[path.extname(p).toLowerCase()] ?? null;
}

const text = (s: string | undefined): string | null => (s && s.trim() ? s.trim() : null);

export async function readTrackFile(absPath: string): Promise<{ meta: TrackMeta; picture: Picture | null }> {
  const format = formatFromPath(absPath);
  if (!format) throw new Error(`Formato no soportado: ${absPath}`);

  const { common, format: info } = await parseFile(absPath, { duration: true });
  if (info.duration === undefined && !info.container) {
    throw new Error('No se detectó audio en el archivo');
  }

  const pic = common.picture?.[0];
  return {
    meta: {
      title: text(common.title) ?? path.basename(absPath, path.extname(absPath)),
      artist: text(common.artist) ?? UNKNOWN_ARTIST,
      albumArtist: text(common.albumartist),
      album: text(common.album) ?? UNKNOWN_ALBUM,
      trackNo: common.track.no ?? null,
      discNo: common.disk.no ?? null,
      year: common.year ?? null,
      durationMs: info.duration ? Math.round(info.duration * 1000) : 0,
      format,
    },
    picture: pic ? { mime: pic.format, data: pic.data } : null,
  };
}
