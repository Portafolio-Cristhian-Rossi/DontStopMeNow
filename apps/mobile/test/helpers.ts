import {
  FINGERPRINT_WINDOW,
  fingerprintFromWindows,
  type Album,
  type Catalog,
  type Playlist,
  type Track,
} from '@dsmn/shared';
import { DatabaseSync } from 'node:sqlite';
import { ServerUnreachableError, UnauthorizedError } from '../src/core/http.ts';
import type { Downloader, FetchLike, FileStore, SqlDb, SqlValue } from '../src/core/types.ts';

type FakeResponse = { status: number; body?: unknown; headers?: Record<string, string> };
type Route =
  | FakeResponse
  | 'hang'
  | 'fail'
  | ((init: Parameters<FetchLike>[1]) => FakeResponse | 'hang' | 'fail' | Promise<FakeResponse>);

export interface FakeFetch extends FetchLike {
  calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[];
}

/** fetch falso: claves "METHOD url". 'hang' no responde nunca (salvo abort); 'fail' es error de red. */
export function fakeFetch(routes: Record<string, Route>): FakeFetch {
  const calls: FakeFetch['calls'] = [];
  const fn = (async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({
      method,
      url,
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    let route = routes[`${method} ${url}`];
    if (typeof route === 'function') route = await route(init);
    if (route === undefined) route = 'fail';
    if (route === 'fail') throw new TypeError('Network request failed');
    if (route === 'hang') {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    const { status, body, headers = {} } = route;
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status,
      headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
      json: async () => body,
    };
  }) as FakeFetch;
  fn.calls = calls;
  return fn;
}

export function makeTrack(id: string, partial: Partial<Track> = {}): Track {
  return {
    id,
    title: id,
    artist: 'Artista',
    albumId: 'al1',
    trackNo: null,
    discNo: null,
    durationMs: 180_000,
    size: 100,
    format: 'mp3',
    fingerprint: `fp-${id}`,
    coverId: null,
    available: true,
    ...partial,
  };
}

export function makeCatalog(partial: Partial<Catalog> = {}): Catalog {
  const tracks = [makeTrack('t1'), makeTrack('t2'), makeTrack('t3')];
  const albums: Album[] = [
    { id: 'al1', title: 'Disco', artist: 'Artista', year: null, coverId: null, trackIds: ['t1', 't2'] },
  ];
  const playlists: Playlist[] = [
    { id: 'p1', name: 'Lista', type: 'manual', folder: null, trackIds: ['t2', 't3'] },
  ];
  return { serverId: 'srv', revision: 1, tracks, albums, playlists, ...partial };
}

/** SqlDb sobre node:sqlite en memoria, con la misma interfaz que el adaptador de expo-sqlite. */
export function sqliteDb(db: DatabaseSync = new DatabaseSync(':memory:')): SqlDb {
  const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : null);
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, ...params) => void db.prepare(sql).run(...params),
    all: <T>(sql: string, ...params: SqlValue[]) =>
      db
        .prepare(sql)
        .all(...params)
        .map((r) => plain<T>(r)!),
    first: <T>(sql: string, ...params: SqlValue[]) => plain<T>(db.prepare(sql).get(...params)),
  };
}

/** FileStore en memoria. */
export function memoryFiles(
  freeBytes = 10 * 1024 ** 3,
): FileStore & { files: Map<string, Uint8Array>; free: number } {
  const files = new Map<string, Uint8Array>();
  const store = {
    files,
    free: freeBytes,
    musicDir: '/music',
    exists: (p: string) => files.has(p),
    size: (p: string) => files.get(p)?.length ?? 0,
    read: async (p: string, offset: number, length: number) =>
      (files.get(p) ?? new Uint8Array()).slice(offset, offset + length),
    move: (from: string, to: string) => {
      const data = files.get(from);
      if (!data) throw new Error(`No existe ${from}`);
      files.set(to, data);
      files.delete(from);
    },
    remove: (p: string) => void files.delete(p),
    freeBytes: () => store.free,
  };
  return store;
}

export type Behavior = 'pause' | 'fail' | 'unauthorized' | 'unreachable' | Uint8Array | undefined;

/**
 * Descargador falso: escribe en `dest` el contenido de cada URL. `behave(url, intento)` puede
 * simular pausas, fallas o contenido corrupto.
 */
export function fakeDownloader(
  files: ReturnType<typeof memoryFiles>,
  contents: Map<string, Uint8Array>,
  behave: (url: string, attempt: number) => Behavior = () => undefined,
): Downloader & { calls: { url: string; resumeState?: string; headers: Record<string, string> }[] } {
  const attempts = new Map<string, number>();
  const calls: { url: string; resumeState?: string; headers: Record<string, string> }[] = [];
  return {
    calls,
    async download(req) {
      calls.push({ url: req.url, resumeState: req.resumeState, headers: req.headers });
      const attempt = (attempts.get(req.url) ?? 0) + 1;
      attempts.set(req.url, attempt);
      const b = behave(req.url, attempt);
      if (b === 'pause') return { status: 'paused', state: `estado-${req.url}` };
      if (b === 'fail') throw new Error('Falla de red');
      if (b === 'unauthorized') throw new UnauthorizedError('revocado');
      if (b === 'unreachable') throw new ServerUnreachableError();
      const data = b instanceof Uint8Array ? b : contents.get(req.url);
      if (!data) throw new Error(`Sin contenido para ${req.url}`);
      files.files.set(req.dest, data);
      req.onProgress(data.length);
      return { status: 'done' };
    },
  };
}

/** Canción cuyo tamaño y huella corresponden a `data`. */
export function trackFor(id: string, data: Uint8Array, partial: Partial<Track> = {}): Track {
  const head = data.length <= 2 * FINGERPRINT_WINDOW ? data : data.subarray(0, FINGERPRINT_WINDOW);
  const tail =
    data.length <= 2 * FINGERPRINT_WINDOW
      ? new Uint8Array()
      : data.subarray(data.length - FINGERPRINT_WINDOW);
  return makeTrack(id, {
    size: data.length,
    fingerprint: fingerprintFromWindows(data.length, head, tail),
    ...partial,
  });
}
