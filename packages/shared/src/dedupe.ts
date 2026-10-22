import { normalizeKey } from './normalize.ts';
import type { AnalyzedEntry, PreviewEntry } from './schemas.ts';

/** Título de un video separado en artista, título limpio y etiquetas de versión. */
export interface ParsedSong {
  artist: string | null;
  /** El artista salió de "Artista - Canción" (si no, del canal). */
  artistFromTitle: boolean;
  base: string;
  tags: string[];
}

/** Etiquetas canónicas y sus variantes (ya sin tildes y en minúsculas). */
const VERSION_TAGS: [string, RegExp][] = [
  ['live', /\b(en vivo|live)\b/],
  ['remix', /\bremix\b/],
  ['acoustic', /\b(acustico|acoustic)\b/],
  ['extended', /\bextended\b/],
  ['sped up', /\bsped up\b/],
  ['slowed', /\bslowed\b/],
  ['nightcore', /\bnightcore\b/],
  ['instrumental', /\binstrumental\b/],
  ['cover', /\bcover\b/],
  ['karaoke', /\bkaraoke\b/],
  ['demo', /\bdemo\b/],
  ['radio edit', /\bradio edit\b/],
  ['unplugged', /\bunplugged\b/],
];

/** Ruido de YouTube que no cambia la canción, de más largo a más corto. */
const NOISE =
  /\b(official music video|official video|official audio|music video|lyric video|video oficial|visualizer|remastered|remaster|lyrics|letra|audio|hd|4k)\b/g;

const FEAT = /(^|\s)(ft|feat|featuring)\.?(\s.*)?$/;

/** Sin tildes, minúsculas, sin signos y con espacios colapsados. */
function fold(s: string): string {
  return normalizeKey(
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' '),
  );
}

function artistFromChannel(channel: string | null): string | null {
  if (!channel) return null;
  const name = channel
    .replace(/\s*-\s*topic$/i, '')
    .replace(/vevo$/i, '')
    .replace(/\s*official$/i, '')
    .trim();
  return name ? fold(name) : null;
}

export function parseSongTitle(title: string, channel: string | null): ParsedSong {
  const split = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
  const artist = split ? fold(split[1]!) || null : artistFromChannel(channel);
  let song = split ? split[2]! : title;

  const tags = new Set<string>();
  // Solo se miran etiquetas entre paréntesis o corchetes: "Live Forever" no es una versión en vivo.
  song = song.replace(/[([]([^)\]]*)[)\]]/g, (_group, inner: string) => {
    const text = fold(inner);
    let isVersion = false;
    for (const [tag, re] of VERSION_TAGS) {
      if (re.test(text)) {
        tags.add(tag);
        isVersion = true;
      }
    }
    if (isVersion) return ' ';
    const rest = text.replace(NOISE, ' ').replace(FEAT, ' ').trim();
    return rest ? ` ${inner} ` : ' ';
  });

  const base = fold(song).replace(FEAT, ' ').trim().replace(/\s+/g, ' ');
  return { artist, artistFromTitle: Boolean(split), base, tags: [...tags].sort() };
}

const songKey = (p: ParsedSong) => `${p.base}\u0000${p.tags.join('|')}`;

/** Dos entradas son de artistas distintos solo si los dos salen del título y no coinciden. */
const contradicts = (a: ParsedSong, b: ParsedSong) =>
  a.artistFromTitle && b.artistFromTitle && a.artist !== b.artist;

/**
 * Marca repetidas dentro del link, canciones que ya están en la biblioteca, versiones distintas de la misma canción
 * y videos ya bajados; `selected` es la casilla por defecto.
 */
export function analyzeEntries(
  entries: PreviewEntry[],
  library: { id: string; title: string; artist: string }[],
  downloaded: ReadonlySet<string> = new Set(),
): AnalyzedEntry[] {
  const parsed = entries.map((e) => parseSongTitle(e.title, e.channel));

  const libraryByKey = new Map<string, { id: string; artist: string }[]>();
  for (const track of library) {
    const key = songKey(parseSongTitle(track.title, null));
    libraryByKey.set(key, [...(libraryByKey.get(key) ?? []), { id: track.id, artist: fold(track.artist) }]);
  }

  const tagSetsByBase = new Map<string, Set<string>>();
  entries.forEach((e, i) => {
    if (e.unavailable) return;
    const p = parsed[i]!;
    tagSetsByBase.set(p.base, (tagSetsByBase.get(p.base) ?? new Set()).add(p.tags.join('|')));
  });

  return entries.map((entry, i) => {
    const p = parsed[i]!;
    let duplicateOf: string | null = null;
    let inLibrary: string | null = null;
    let versionGroup: string | null = null;
    if (!entry.unavailable) {
      const key = songKey(p);
      for (let j = 0; j < i; j++) {
        if (!entries[j]!.unavailable && songKey(parsed[j]!) === key && !contradicts(parsed[j]!, p)) {
          duplicateOf = entries[j]!.videoId;
          break;
        }
      }
      if (p.artist) inLibrary = libraryByKey.get(key)?.find((t) => t.artist === p.artist)?.id ?? null;
      if ((tagSetsByBase.get(p.base)?.size ?? 0) > 1) versionGroup = p.base;
    }
    const alreadyDownloaded = downloaded.has(entry.videoId);
    return {
      ...entry,
      duplicateOf,
      inLibrary,
      versionGroup,
      versionTags: p.tags,
      alreadyDownloaded,
      selected: !entry.unavailable && !duplicateOf && !inLibrary && !alreadyDownloaded,
    };
  });
}
