import type { PlaceableTrack } from './types.ts';

/** Largo máximo del nombre (sin la extensión): las carpetas de Android cortan los nombres muy largos. */
const MAX_NAME = 120;

/**
 * Nombre legible para guardar una canción en una carpeta que otros ven (la SD): "Título - Artista.mp3", sin
 * caracteres que Android no acepta. Los repetidos los resuelve Android agregando " (1)".
 */
export function readableName(track: PlaceableTrack): string {
  const clean = (s: string) =>
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const parts = [clean(track.title), clean(track.artist)].filter(Boolean);
  const base = (parts.join(' - ') || track.id).slice(0, MAX_NAME).trim().replace(/\.+$/, '');
  return `${base || track.id}.${track.format}`;
}

/**
 * Nombre para mostrar de una carpeta elegida con el selector de Android, a partir de su dirección
 * (`content://…/tree/1234-ABCD%3AMusica%2FRock` → "Tarjeta SD › Musica › Rock").
 */
export function folderLabel(uri: string): string {
  const tree = uri.split('/tree/')[1]?.split('/')[0];
  if (!tree) return 'Carpeta elegida';
  let id: string;
  try {
    id = decodeURIComponent(tree);
  } catch {
    return 'Carpeta elegida';
  }
  const [volume = '', path = ''] = id.includes(':')
    ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
    : [id];
  const root = volume === 'primary' ? 'Memoria interna' : 'Tarjeta SD';
  return [root, ...path.split('/').filter(Boolean)].join(' › ');
}
