import { sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Tamaño de cada ventana (principio y final del archivo) que entra en la huella. */
export const FINGERPRINT_WINDOW = 64 * 1024;

/**
 * Huella rápida de un archivo: tamaño + SHA-1 de los primeros y últimos 64 KiB. Para archivos de
 * hasta 128 KiB, `head` es el archivo completo y `tail` va vacío. El servidor y el celular la
 * calculan igual, así el celular puede verificar cada descarga.
 */
export function fingerprintFromWindows(size: number, head: Uint8Array, tail: Uint8Array): string {
  const hash = sha1.create();
  hash.update(head);
  hash.update(tail);
  return `${size}:${bytesToHex(hash.digest())}`;
}
