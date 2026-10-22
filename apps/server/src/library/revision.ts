import type { DatabaseSync } from 'node:sqlite';
import { getRevision, setMeta } from '../db/meta.ts';
import type { EventBus } from '../events.ts';

/** Incrementa la revisión de la biblioteca y avisa por el bus. */
export function bumpRevision(db: DatabaseSync, bus: EventBus): number {
  const revision = getRevision(db) + 1;
  setMeta(db, 'library_revision', String(revision));
  bus.emit('revision', { revision });
  return revision;
}
