import type { Catalog, LocalDownload, QueueState, Selection } from '@dsmn/shared';
import { supersededBy, type PendingChange, type StoredChange } from './pending.ts';
import type { PairedServer, SqlDb } from './types.ts';

export type StoredDownload = LocalDownload & { path: string; size: number };

/** Estado del reproductor para retomar donde se dejó. */
export interface SavedPlayerState {
  queue: QueueState;
  positionMs: number;
  /** Velocidad elegida; los estados guardados por versiones anteriores no la tienen. */
  rate?: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS server (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    server_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, token TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalog (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL, etag TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS selection (
    kind TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY (kind, id)
  );
  CREATE TABLE IF NOT EXISTS downloads (
    track_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS partials (
    track_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, state TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS player_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS failures (
    track_id TEXT PRIMARY KEY, error TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending_changes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL
  );
`;

/** Todo lo que el celular guarda: servidor vinculado, catálogo, selección y descargas. */
export class LocalStore {
  /** Catálogo ya parseado (undefined = todavía no se leyó de la base). */
  private cachedCatalog: { catalog: Catalog; etag: string } | null | undefined;

  constructor(private readonly db: SqlDb) {
    db.exec(SCHEMA);
  }

  getServer(): PairedServer | null {
    const row = this.db.first<{ server_id: string; name: string; url: string; token: string }>(
      'SELECT server_id, name, url, token FROM server WHERE id = 1',
    );
    return row ? { serverId: row.server_id, name: row.name, url: row.url, token: row.token } : null;
  }

  setServer(s: PairedServer): void {
    this.db.run(
      'INSERT OR REPLACE INTO server (id, server_id, name, url, token) VALUES (1, ?, ?, ?, ?)',
      s.serverId,
      s.name,
      s.url,
      s.token,
    );
  }

  updateServerUrl(url: string): void {
    this.db.run('UPDATE server SET url = ? WHERE id = 1', url);
  }

  /**
   * Desvincula: borra servidor, catálogo, parciales y fallas. Conserva lo descargado y la selección,
   * así volver a vincular el mismo servidor no borra la biblioteca.
   */
  clearServer(): void {
    this.db.exec('DELETE FROM server; DELETE FROM catalog; DELETE FROM partials; DELETE FROM failures;');
    this.cachedCatalog = null;
  }

  getCatalog(): { catalog: Catalog; etag: string } | null {
    if (this.cachedCatalog === undefined) {
      const row = this.db.first<{ json: string; etag: string }>(
        'SELECT json, etag FROM catalog WHERE id = 1',
      );
      this.cachedCatalog = row ? { catalog: JSON.parse(row.json) as Catalog, etag: row.etag } : null;
    }
    return this.cachedCatalog;
  }

  setCatalog(catalog: Catalog, etag: string): void {
    this.db.run(
      'INSERT OR REPLACE INTO catalog (id, json, etag) VALUES (1, ?, ?)',
      JSON.stringify(catalog),
      etag,
    );
    this.cachedCatalog = { catalog, etag };
  }

  getSelection(): Selection[] {
    return this.db.all<Selection>('SELECT kind, id FROM selection ORDER BY position');
  }

  setSelected(sel: Selection, on: boolean): void {
    if (on) {
      this.db.run(
        `INSERT OR IGNORE INTO selection (kind, id, position)
         VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM selection))`,
        sel.kind,
        sel.id,
      );
    } else {
      this.db.run('DELETE FROM selection WHERE kind = ? AND id = ?', sel.kind, sel.id);
    }
  }

  replaceSelection(selection: Selection[]): void {
    this.db.run('DELETE FROM selection');
    selection.forEach((s, i) =>
      this.db.run('INSERT INTO selection (kind, id, position) VALUES (?, ?, ?)', s.kind, s.id, i),
    );
  }

  getDownloads(): StoredDownload[] {
    return this.db
      .all<{ track_id: string; fingerprint: string; path: string; size: number }>(
        'SELECT track_id, fingerprint, path, size FROM downloads ORDER BY track_id',
      )
      .map((r) => ({ trackId: r.track_id, fingerprint: r.fingerprint, path: r.path, size: r.size }));
  }

  addDownload(d: StoredDownload): void {
    this.db.run(
      'INSERT OR REPLACE INTO downloads (track_id, fingerprint, path, size) VALUES (?, ?, ?, ?)',
      d.trackId,
      d.fingerprint,
      d.path,
      d.size,
    );
  }

  updateDownloadPath(trackId: string, path: string): void {
    this.db.run('UPDATE downloads SET path = ? WHERE track_id = ?', path, trackId);
  }

  /** Cambios hechos en el celular que todavía no llegaron a la compu, en el orden en que se hicieron. */
  getPending(): StoredChange[] {
    return this.db
      .all<{ seq: number; json: string }>('SELECT seq, json FROM pending_changes ORDER BY seq')
      .map((r) => ({ seq: r.seq, change: JSON.parse(r.json) as PendingChange }));
  }

  /** Guarda un cambio nuevo y descarta los que deja sin efecto. */
  addPending(change: PendingChange): void {
    for (const seq of supersededBy(change, this.getPending())) this.removePending(seq);
    this.db.run('INSERT INTO pending_changes (json) VALUES (?)', JSON.stringify(change));
  }

  removePending(seq: number): void {
    this.db.run('DELETE FROM pending_changes WHERE seq = ?', seq);
  }

  clearPending(): void {
    this.db.run('DELETE FROM pending_changes');
  }

  getSetting(key: string): string | null {
    return this.db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
  }

  setSetting(key: string, value: string | null): void {
    if (value === null) this.db.run('DELETE FROM settings WHERE key = ?', key);
    else this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
  }

  removeDownload(trackId: string): void {
    this.db.run('DELETE FROM downloads WHERE track_id = ?', trackId);
  }

  getPartial(trackId: string): { fingerprint: string; state: string } | null {
    return this.db.first<{ fingerprint: string; state: string }>(
      'SELECT fingerprint, state FROM partials WHERE track_id = ?',
      trackId,
    );
  }

  setPartial(trackId: string, fingerprint: string, state: string): void {
    this.db.run(
      'INSERT OR REPLACE INTO partials (track_id, fingerprint, state) VALUES (?, ?, ?)',
      trackId,
      fingerprint,
      state,
    );
  }

  removePartial(trackId: string): void {
    this.db.run('DELETE FROM partials WHERE track_id = ?', trackId);
  }

  getFailures(): { trackId: string; error: string }[] {
    return this.db
      .all<{ track_id: string; error: string }>('SELECT track_id, error FROM failures ORDER BY track_id')
      .map((r) => ({ trackId: r.track_id, error: r.error }));
  }

  setFailures(failures: { trackId: string; error: string }[]): void {
    this.db.run('DELETE FROM failures');
    for (const f of failures)
      this.db.run('INSERT OR REPLACE INTO failures (track_id, error) VALUES (?, ?)', f.trackId, f.error);
  }

  getPlayerState(): SavedPlayerState | null {
    const row = this.db.first<{ json: string }>('SELECT json FROM player_state WHERE id = 1');
    return row ? (JSON.parse(row.json) as SavedPlayerState) : null;
  }

  setPlayerState(state: SavedPlayerState | null): void {
    if (state === null) this.db.run('DELETE FROM player_state');
    else this.db.run('INSERT OR REPLACE INTO player_state (id, json) VALUES (1, ?)', JSON.stringify(state));
  }
}
