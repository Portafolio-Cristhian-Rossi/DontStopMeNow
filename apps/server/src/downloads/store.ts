import type { DatabaseSync } from 'node:sqlite';
import type { DownloadItem, DownloadJob, DownloadJobStatus, YtSource } from '@dsmn/shared';

/** Cuántos trabajos terminados se muestran en la cola. */
const FINISHED_SHOWN = 20;

interface SourceRow {
  id: number;
  url: string;
  yt_playlist_id: string;
  title: string;
  root_id: number;
  folder_rel_path: string;
  playlist_id: string | null;
  created_at: number;
  last_checked_at: number | null;
  downloaded: number;
}

interface JobRow {
  id: number;
  source_id: number | null;
  url: string;
  title: string;
  root_id: number;
  folder_rel_path: string;
  number_width: number;
  status: DownloadJobStatus;
  pause_reason: string | null;
  created_at: number;
  finished_at: number | null;
}

interface ItemRow {
  video_id: string;
  position: number | null;
  title: string;
  status: DownloadItem['status'];
  error: string | null;
  file_path: string | null;
}

/** Trabajo con el ancho de numeración, que la cola necesita y la API no muestra. */
export type StoredJob = DownloadJob & { numberWidth: number };

const SOURCE_SELECT = `
  SELECT s.*, (
    SELECT COUNT(*) FROM yt_items i JOIN yt_jobs j ON j.id = i.job_id
    WHERE j.source_id = s.id AND i.status = 'done'
  ) AS downloaded
  FROM yt_sources s`;

function toSource(r: SourceRow): YtSource {
  return {
    id: r.id,
    url: r.url,
    ytPlaylistId: r.yt_playlist_id,
    title: r.title,
    rootId: r.root_id,
    folder: r.folder_rel_path,
    playlistId: r.playlist_id,
    downloaded: r.downloaded,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at,
  };
}

export function getSource(db: DatabaseSync, id: number): YtSource | undefined {
  const row = db.prepare(`${SOURCE_SELECT} WHERE s.id = ?`).get(id) as SourceRow | undefined;
  return row && toSource(row);
}

export function findSourceByPlaylistId(db: DatabaseSync, ytPlaylistId: string): YtSource | undefined {
  const row = db.prepare(`${SOURCE_SELECT} WHERE s.yt_playlist_id = ?`).get(ytPlaylistId) as
    SourceRow | undefined;
  return row && toSource(row);
}

export function listSources(db: DatabaseSync): YtSource[] {
  return (db.prepare(`${SOURCE_SELECT} ORDER BY s.title, s.id`).all() as unknown as SourceRow[]).map(
    toSource,
  );
}

export function createSource(
  db: DatabaseSync,
  s: { url: string; ytPlaylistId: string; title: string; rootId: number; folder: string },
): YtSource {
  const r = db
    .prepare(
      `INSERT INTO yt_sources (url, yt_playlist_id, title, root_id, folder_rel_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(s.url, s.ytPlaylistId, s.title, s.rootId, s.folder, Date.now());
  return getSource(db, Number(r.lastInsertRowid))!;
}

export function setSourcePlaylist(db: DatabaseSync, sourceId: number, playlistId: string): void {
  db.prepare('UPDATE yt_sources SET playlist_id = ? WHERE id = ?').run(playlistId, sourceId);
}

export function touchSourceChecked(db: DatabaseSync, sourceId: number, now: number): void {
  db.prepare('UPDATE yt_sources SET last_checked_at = ? WHERE id = ?').run(now, sourceId);
}

export function deleteSource(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM yt_sources WHERE id = ?').run(id);
}

/** Videos ya bajados de una playlist guardada (lo que "Buscar nuevas" no vuelve a ofrecer). */
export function downloadedVideoIds(db: DatabaseSync, sourceId: number): Set<string> {
  const rows = db
    .prepare(
      `SELECT i.video_id FROM yt_items i JOIN yt_jobs j ON j.id = i.job_id
       WHERE j.source_id = ? AND i.status = 'done'`,
    )
    .all(sourceId) as { video_id: string }[];
  return new Set(rows.map((r) => r.video_id));
}

function toJob(db: DatabaseSync, r: JobRow): StoredJob {
  const items = db
    .prepare(
      `SELECT video_id, position, title, status, error, file_path FROM yt_items
       WHERE job_id = ? ORDER BY position, rowid`,
    )
    .all(r.id) as unknown as ItemRow[];
  return {
    id: r.id,
    sourceId: r.source_id,
    url: r.url,
    title: r.title,
    rootId: r.root_id,
    folder: r.folder_rel_path,
    numberWidth: r.number_width,
    status: r.status,
    pauseReason: r.pause_reason,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    items: items.map((i) => ({
      videoId: i.video_id,
      position: i.position,
      title: i.title,
      status: i.status,
      error: i.error,
      filePath: i.file_path,
    })),
  };
}

export function insertJob(
  db: DatabaseSync,
  j: {
    sourceId: number | null;
    url: string;
    title: string;
    rootId: number;
    folder: string;
    numberWidth: number;
    items: { videoId: string; position: number | null; title: string }[];
  },
): StoredJob {
  const r = db
    .prepare(
      `INSERT INTO yt_jobs (source_id, url, title, root_id, folder_rel_path, number_width, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(j.sourceId, j.url, j.title, j.rootId, j.folder, j.numberWidth, Date.now());
  const id = Number(r.lastInsertRowid);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO yt_items (job_id, video_id, position, title, status) VALUES (?, ?, ?, ?, 'pending')",
  );
  for (const item of j.items) insert.run(id, item.videoId, item.position, item.title);
  return getJob(db, id)!;
}

export function getJob(db: DatabaseSync, id: number): StoredJob | undefined {
  const row = db.prepare('SELECT * FROM yt_jobs WHERE id = ?').get(id) as JobRow | undefined;
  return row && toJob(db, row);
}

/** Los trabajos activos y los últimos terminados, por orden de llegada. */
export function listJobs(db: DatabaseSync): StoredJob[] {
  const rows = db
    .prepare(
      `SELECT * FROM yt_jobs WHERE hidden = 0 AND status NOT IN ('done', 'cancelled')
       UNION ALL
       SELECT * FROM (
         SELECT * FROM yt_jobs WHERE hidden = 0 AND status IN ('done', 'cancelled') ORDER BY id DESC LIMIT ?
       )
       ORDER BY id`,
    )
    .all(FINISHED_SHOWN) as unknown as JobRow[];
  return rows.map((r) => toJob(db, r));
}

export function nextRunnableJob(db: DatabaseSync): StoredJob | undefined {
  const row = db
    .prepare("SELECT * FROM yt_jobs WHERE status = 'pending' AND hidden = 0 ORDER BY id LIMIT 1")
    .get() as JobRow | undefined;
  return row && toJob(db, row);
}

export function setJobStatus(
  db: DatabaseSync,
  id: number,
  status: DownloadJobStatus,
  pauseReason: string | null = null,
): void {
  const finished = status === 'done' || status === 'cancelled' ? Date.now() : null;
  db.prepare('UPDATE yt_jobs SET status = ?, pause_reason = ?, finished_at = ? WHERE id = ?').run(
    status,
    pauseReason,
    finished,
    id,
  );
}

export function setItem(
  db: DatabaseSync,
  jobId: number,
  videoId: string,
  patch: Partial<Pick<DownloadItem, 'status' | 'error' | 'filePath'>>,
): void {
  const current = db
    .prepare('SELECT status, error, file_path FROM yt_items WHERE job_id = ? AND video_id = ?')
    .get(jobId, videoId) as { status: string; error: string | null; file_path: string | null } | undefined;
  if (!current) return;
  db.prepare(
    'UPDATE yt_items SET status = ?, error = ?, file_path = ? WHERE job_id = ? AND video_id = ?',
  ).run(
    patch.status ?? current.status,
    patch.error !== undefined ? patch.error : current.error,
    patch.filePath !== undefined ? patch.filePath : current.file_path,
    jobId,
    videoId,
  );
}

/**
 * Quita un trabajo de la cola. Si bajó canciones de una playlist guardada solo se oculta: esas filas son el registro
 * de lo ya bajado que usa "Buscar nuevas".
 */
export function deleteJob(db: DatabaseSync, id: number): void {
  const keep = db
    .prepare(
      `SELECT 1 FROM yt_jobs j JOIN yt_items i ON i.job_id = j.id
       WHERE j.id = ? AND j.source_id IS NOT NULL AND i.status = 'done' LIMIT 1`,
    )
    .get(id);
  if (keep) db.prepare('UPDATE yt_jobs SET hidden = 1 WHERE id = ?').run(id);
  else db.prepare('DELETE FROM yt_jobs WHERE id = ?').run(id);
}

/** Al arrancar: lo que quedó bajando cuando se cortó el servidor vuelve a la espera. */
export function resetInterrupted(db: DatabaseSync): void {
  db.exec("UPDATE yt_jobs SET status = 'pending' WHERE status = 'running'");
  db.exec("UPDATE yt_items SET status = 'pending' WHERE status = 'downloading'");
}
