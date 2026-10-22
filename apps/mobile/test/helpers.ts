import type { Album, Catalog, Playlist, Track } from '@dsmn/shared';
import { DatabaseSync } from 'node:sqlite';
import type { FetchLike, SqlDb, SqlValue } from '../src/core/types.ts';

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
