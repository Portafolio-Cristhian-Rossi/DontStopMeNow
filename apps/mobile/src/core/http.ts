import { CatalogSchema, type Catalog } from '@dsmn/shared';
import { changeRequest, type PendingChange } from './pending.ts';
import type { FetchLike } from './types.ts';

export class UnauthorizedError extends Error {}

export class ServerUnreachableError extends Error {
  constructor(message = 'No se encuentra el servidor. ¿Estás en el mismo WiFi que la compu?') {
    super(message);
  }
}

export class ServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type FetchResponse = Awaited<ReturnType<FetchLike>>;

/** Hace un pedido con timeout; errores de red o timeout → ServerUnreachableError. */
export async function send(
  fetch: FetchLike,
  url: string,
  init: Parameters<FetchLike>[1] = {},
  timeoutMs = 10_000,
): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ServerUnreachableError();
  } finally {
    clearTimeout(timer);
  }
}

/** Error de la API como ServerError (con el mensaje que manda el servidor). */
export async function toServerError(res: FetchResponse): Promise<ServerError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new ServerError(
    res.status,
    body?.error?.code ?? 'internal',
    body?.error?.message ?? `Error ${res.status}`,
  );
}

/** Convierte una respuesta de error de la API en la excepción correspondiente (401 → token inválido). */
export async function throwIfError(res: FetchResponse): Promise<void> {
  if (res.status < 400) return;
  const error = await toServerError(res);
  if (res.status === 401) throw new UnauthorizedError(error.message);
  throw error;
}

export interface ServerClient {
  catalog(
    etag?: string,
  ): Promise<{ notModified: true } | { notModified: false; catalog: Catalog; etag: string }>;
  trackUrl(id: string): string;
  coverUrl(id: string): string;
  authHeaders(): Record<string, string>;
  /** Manda a la compu un cambio hecho en el celular (favorita o lista). */
  applyChange(change: PendingChange): Promise<void>;
}

export function createServerClient(opts: {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
  timeoutMs?: number;
}): ServerClient {
  const authHeaders = () => ({ Authorization: `Bearer ${opts.token}` });
  return {
    authHeaders,
    trackUrl: (id) => `${opts.baseUrl}/api/tracks/${encodeURIComponent(id)}/file`,
    coverUrl: (id) => `${opts.baseUrl}/api/covers/${encodeURIComponent(id)}`,
    async applyChange(change) {
      const { method, path, body } = changeRequest(change);
      const headers: Record<string, string> = authHeaders();
      // Sin cuerpo no va Content-Type: el servidor rechaza un JSON vacío.
      if (body) headers['Content-Type'] = 'application/json';
      const res = await send(
        opts.fetch,
        `${opts.baseUrl}${path}`,
        { method, headers, body: body ? JSON.stringify(body) : undefined },
        opts.timeoutMs,
      );
      await throwIfError(res);
    },
    async catalog(etag) {
      const headers: Record<string, string> = authHeaders();
      if (etag) headers['If-None-Match'] = etag;
      const res = await send(opts.fetch, `${opts.baseUrl}/api/catalog`, { headers }, opts.timeoutMs);
      if (res.status === 304) return { notModified: true };
      await throwIfError(res);
      const catalog = CatalogSchema.parse(await res.json());
      return { notModified: false, catalog, etag: res.headers.get('etag') ?? '' };
    },
  };
}
