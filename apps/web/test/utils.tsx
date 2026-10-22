import type { Album, Catalog, Playlist, Track } from '@dsmn/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';

type Handler = (body: unknown, url: URL) => unknown;

export interface FakeServer {
  calls: { method: string; path: string; body: unknown }[];
}

/** Instala un fetch falso. Claves "METHOD /path"; lo que no coincide responde 404 JSON. */
export function fakeServer(routes: Record<string, Handler>): FakeServer {
  const server: FakeServer = { calls: [] };
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    server.calls.push({ method, path: url.pathname, body });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'No encontrado' } }), {
        status: 404,
      });
    }
    const result = await handler(body, url);
    if (result instanceof Response) return result;
    if (result === undefined) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return server;
}

export const callsTo = (server: FakeServer, method: string, path: string) =>
  server.calls.filter((c) => c.method === method && c.path === path);

/** EventSource falso: los tests emiten eventos con FakeEventSource.last.emit(...). */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static get last(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1);
    if (!last) throw new Error('No hay EventSource abierto');
    return last;
  }
  private listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? [])
      fn(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const currentLocation = { value: '' };
function LocationSpy() {
  const loc = useLocation();
  useEffect(() => {
    currentLocation.value = loc.pathname + loc.search;
  }, [loc]);
  return null;
}
/** Ruta actual del MemoryRouter del último render. */
export const location = () => currentLocation.value;

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          {ui}
          <LocationSpy />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
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
    size: 1000,
    format: 'mp3',
    fingerprint: `fp-${id}`,
    coverId: null,
    available: true,
    ...partial,
  };
}

export function makeCatalog(partial: Partial<Catalog> = {}): Catalog {
  const tracks = [
    makeTrack('t1', { title: 'uno', trackNo: 1 }),
    makeTrack('t2', { title: 'dos', trackNo: 2 }),
  ];
  const albums: Album[] = [
    { id: 'al1', title: 'Disco', artist: 'Artista', year: 2001, coverId: null, trackIds: ['t1', 't2'] },
  ];
  const playlists: Playlist[] = [];
  return { serverId: 's', revision: 1, tracks, albums, playlists, ...partial };
}
