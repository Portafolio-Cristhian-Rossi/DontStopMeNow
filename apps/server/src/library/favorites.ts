import type { DatabaseSync } from 'node:sqlite';
import type { EventBus } from '../events.ts';
import { HttpError } from '../http/errors.ts';
import { bumpRevision } from './revision.ts';

/**
 * Marca o desmarca una canción como favorita. Se guarda su huella, así todas las copias del mismo archivo
 * quedan marcadas y la marca sobrevive a moverlo. Sube la revisión solo si algo cambió.
 */
export function setFavorite(db: DatabaseSync, bus: EventBus, trackId: string, on: boolean): void {
  const row = db.prepare('SELECT fingerprint FROM tracks WHERE id = ?').get(trackId) as
    { fingerprint: string } | undefined;
  if (!row) throw new HttpError(404, 'not_found', 'Canción inexistente');
  const result = on
    ? db
        .prepare('INSERT OR IGNORE INTO favorites (fingerprint, created_at) VALUES (?, ?)')
        .run(row.fingerprint, Date.now())
    : db.prepare('DELETE FROM favorites WHERE fingerprint = ?').run(row.fingerprint);
  if (Number(result.changes) > 0) bumpRevision(db, bus);
}
