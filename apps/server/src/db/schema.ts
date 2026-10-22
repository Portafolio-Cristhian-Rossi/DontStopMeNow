/** Migraciones en orden; el índice + 1 queda en PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE roots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
    created_at INTEGER NOT NULL
  );

  CREATE TABLE covers (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL
  );

  CREATE TABLE tracks (
    id TEXT PRIMARY KEY,
    root_id INTEGER NOT NULL REFERENCES roots (id) ON DELETE CASCADE,
    rel_path TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    fingerprint TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album_artist TEXT,
    album TEXT NOT NULL,
    track_no INTEGER,
    disc_no INTEGER,
    year INTEGER,
    duration_ms INTEGER NOT NULL,
    format TEXT NOT NULL,
    album_id TEXT NOT NULL,
    cover_id TEXT,
    updated_at INTEGER NOT NULL,
    UNIQUE (root_id, rel_path)
  );
  CREATE INDEX tracks_fingerprint ON tracks (fingerprint);
  CREATE INDEX tracks_album ON tracks (album_id);

  CREATE TABLE albums (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    cover_id TEXT,
    year INTEGER
  );

  CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('manual', 'folder')),
    root_id INTEGER REFERENCES roots (id) ON DELETE CASCADE,
    folder_rel_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE playlist_tracks (
    playlist_id TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, position)
  );

  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER
  );

  CREATE TABLE scan_issues (
    path TEXT PRIMARY KEY,
    error TEXT NOT NULL,
    detected_at INTEGER NOT NULL
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: descargas desde YouTube (solo tablas nuevas).
  `
  CREATE TABLE yt_sources (
    id INTEGER PRIMARY KEY,
    url TEXT NOT NULL,
    yt_playlist_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    root_id INTEGER NOT NULL REFERENCES roots (id) ON DELETE CASCADE,
    folder_rel_path TEXT NOT NULL,
    playlist_id TEXT REFERENCES playlists (id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    last_checked_at INTEGER
  );

  CREATE TABLE yt_jobs (
    id INTEGER PRIMARY KEY,
    source_id INTEGER REFERENCES yt_sources (id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    root_id INTEGER NOT NULL REFERENCES roots (id) ON DELETE CASCADE,
    folder_rel_path TEXT NOT NULL,
    number_width INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'done', 'cancelled')),
    pause_reason TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  );
  CREATE INDEX yt_jobs_status ON yt_jobs (status);

  CREATE TABLE yt_items (
    job_id INTEGER NOT NULL REFERENCES yt_jobs (id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    position INTEGER,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'downloading', 'done', 'failed', 'cancelled')),
    error TEXT,
    file_path TEXT,
    PRIMARY KEY (job_id, video_id)
  );
  CREATE INDEX yt_items_job ON yt_items (job_id);
  `,
];
