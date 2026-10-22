import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export function getMeta(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

export function ensureServerId(db: DatabaseSync): string {
  let id = getMeta(db, 'server_id');
  if (!id) {
    id = randomUUID();
    setMeta(db, 'server_id', id);
  }
  return id;
}

export function getRevision(db: DatabaseSync): number {
  return Number(getMeta(db, 'library_revision') ?? 0);
}
