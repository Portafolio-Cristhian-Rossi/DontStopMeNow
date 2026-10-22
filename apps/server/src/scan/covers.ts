import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Picture } from './readTrack.ts';

const FOLDER_COVERS: [string, string][] = [
  ['cover.jpg', 'image/jpeg'],
  ['cover.png', 'image/png'],
  ['folder.jpg', 'image/jpeg'],
  ['folder.png', 'image/png'],
];

/** Busca cover.jpg / folder.jpg (sin distinguir mayúsculas) en la carpeta. */
export async function findFolderCover(dirAbs: string): Promise<Picture | null> {
  let entries: string[];
  try {
    entries = await readdir(dirAbs);
  } catch {
    return null;
  }
  const byLower = new Map(entries.map((e) => [e.toLowerCase(), e]));
  for (const [name, mime] of FOLDER_COVERS) {
    const actual = byLower.get(name);
    if (actual) return { mime, data: await readFile(join(dirAbs, actual)) };
  }
  return null;
}

/** Guarda la portada en la caché (deduplicada por contenido) y devuelve su id. */
export function saveCover(db: DatabaseSync, coversDir: string, pic: Picture): string {
  const id = createHash('sha1').update(pic.data).digest('hex').slice(0, 20);
  const file = join(coversDir, id);
  if (!existsSync(file)) writeFileSync(file, pic.data);
  db.prepare('INSERT OR IGNORE INTO covers (id, mime) VALUES (?, ?)').run(id, pic.mime);
  return id;
}
