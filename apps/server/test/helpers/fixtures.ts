import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach } from 'vitest';
import { openDatabase } from '../../src/db/database.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** Carpeta temporal que se borra al terminar cada test. */
export async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsmn-'));
  created.push(dir);
  return dir;
}

export function makeDb(): DatabaseSync {
  return openDatabase(':memory:');
}

/** Escribe un archivo en una carpeta temporal nueva y devuelve su ruta. */
export async function writeTmp(name: string, data: Uint8Array): Promise<string> {
  const file = join(await tmpDir(), name);
  await writeFile(file, data);
  return file;
}
