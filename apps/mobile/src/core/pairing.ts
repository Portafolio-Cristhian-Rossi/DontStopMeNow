import { DEFAULT_PORT, PairResponseSchema, QrPayloadSchema, type QrPayload } from '@dsmn/shared';
import { ServerError, ServerUnreachableError, send, toServerError } from './http.ts';
import type { FetchLike, PairedServer } from './types.ts';

export function parseQr(text: string): QrPayload | null {
  try {
    const result = QrPayloadSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Prueba todas las URLs a la vez (GET /api/catalog: un 401 ya prueba que el servidor está ahí) y
 * devuelve la primera que responde. Así una IP de un adaptador virtual muerto no hace esperar.
 */
export function pickReachableUrl(urls: string[], fetch: FetchLike, timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    if (urls.length === 0) return resolve(null);
    const controllers = urls.map(() => new AbortController());
    let pending = urls.length;
    let done = false;
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(url: string | null) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      controllers.forEach((c) => c.abort());
      resolve(url);
    }
    urls.forEach((url, i) => {
      fetch(`${url}/api/catalog`, { signal: controllers[i]!.signal })
        .then(() => finish(url))
        .catch(() => {
          pending--;
          if (pending === 0) finish(null);
        });
    });
  });
}

async function pair(url: string, code: string, deviceName: string, fetch: FetchLike): Promise<PairedServer> {
  const res = await send(fetch, `${url}/api/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim().toUpperCase(), deviceName }),
  });
  // Acá un 401 significa código inválido o vencido, no un token revocado.
  if (res.status >= 400) throw await toServerError(res);
  const body = PairResponseSchema.parse(await res.json());
  return { serverId: body.serverId, name: body.serverName, url, token: body.token };
}

export async function pairWithQr(
  payload: QrPayload,
  deviceName: string,
  fetch: FetchLike,
): Promise<PairedServer> {
  const url = await pickReachableUrl(payload.urls, fetch);
  if (!url) throw new ServerUnreachableError();
  return pair(url, payload.code, deviceName, fetch);
}

/** Acepta `192.168.1.10`, `192.168.1.10:4747` o `http://192.168.1.10:4747/`. */
export function normalizeAddress(address: string): string {
  let text = address.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  const url = new URL(text);
  if (!url.port) url.port = String(DEFAULT_PORT);
  return url.origin;
}

export function pairManually(
  address: string,
  code: string,
  deviceName: string,
  fetch: FetchLike,
): Promise<PairedServer> {
  return pair(normalizeAddress(address), code, deviceName, fetch);
}

/** Un problema al vincular, contado para la persona (título, explicación y si conviene reintentar). */
export interface PairingProblem {
  title: string;
  body: string;
  /** Vale la pena "Reintentar" con el mismo código (la compu no respondió). */
  retry: boolean;
}

export const FOREIGN_QR: PairingProblem = {
  title: 'Ese QR no es de DontStopMeNow',
  body: 'Escaneá el que aparece en la web, en Dispositivos › Vincular un celular.',
  retry: false,
};

const hostOf = (url: string) => url.replace(/^https?:\/\//, '');

/** Traduce una falla de `pairWithQr` o `pairManually` a lo que muestra la pantalla Vincular. */
export function describePairingError(err: unknown, triedUrls: string[] = []): PairingProblem {
  if (err instanceof ServerUnreachableError) {
    const hosts = triedUrls.map(hostOf);
    const where =
      hosts.length === 0
        ? 'Tu compu no responde.'
        : hosts.length === 1
          ? `${hosts[0]} no responde.`
          : `Ni ${hosts.join(' ni ')} responden.`;
    return {
      title: 'No llegamos a tu compu',
      body: `${where} ¿El celular está en el mismo WiFi que la compu y DontStopMeNow está abierto ahí?`,
      retry: true,
    };
  }
  if (err instanceof ServerError && err.status === 401) {
    return {
      title: 'El código ya venció',
      body: 'Los códigos duran unos minutos y sirven una sola vez. En la web tocá «Generar otro código» y volvé a probar.',
      retry: false,
    };
  }
  return {
    title: 'No se pudo vincular',
    body: err instanceof Error ? err.message : String(err),
    retry: true,
  };
}
