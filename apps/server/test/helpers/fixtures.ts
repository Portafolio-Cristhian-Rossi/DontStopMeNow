import { mkdtemp, rm } from 'node:fs/promises';
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
