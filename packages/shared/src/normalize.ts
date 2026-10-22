import { sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Clave de comparación: NFC, minúsculas y espacios colapsados. */
export function normalizeKey(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase('und').replace(/\s+/g, ' ').trim();
}

/** ID estable de un álbum a partir de su artista y título. */
export function albumId(albumArtist: string, album: string): string {
  const key = normalizeKey(albumArtist) + '\u0000' + normalizeKey(album);
  return bytesToHex(sha1(utf8ToBytes(key))).slice(0, 16);
}
