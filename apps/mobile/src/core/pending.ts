import type { Catalog, Playlist } from '@dsmn/shared';
import { ServerError } from './http.ts';

/**
 * Un cambio hecho en el celular que todavía no llegó a la compu. Son operaciones (no "la lista entera") y el
 * servidor las acepta repetidas sin duplicar nada, así que reenviarlas tras un corte es seguro.
 */
export type PendingChange =
  | { kind: 'favorite'; trackId: string; on: boolean; at: number }
  | { kind: 'createPlaylist'; id: string; name: string; trackIds: string[] }
  | { kind: 'renamePlaylist'; id: string; name: string }
  | { kind: 'deletePlaylist'; id: string }
  | { kind: 'addTracks'; id: string; trackIds: string[] }
  | { kind: 'removeTrack'; id: string; trackId: string };

export interface StoredChange {
  seq: number;
  change: PendingChange;
}

/** Lo que necesita el envío de la base local. */
export interface PendingStore {
  getPending(): StoredChange[];
  removePending(seq: number): void;
}

/** El catálogo como lo ve el celular: el guardado con los cambios pendientes aplicados encima. */
export function applyPending(catalog: Catalog, changes: PendingChange[]): Catalog {
  if (changes.length === 0) return catalog;
  const known = new Set(catalog.tracks.map((t) => t.id));
  const fingerprints = new Map(catalog.tracks.map((t) => [t.id, t.fingerprint]));
  // Las favoritas se marcan por huella: todas las copias del mismo archivo cambian juntas.
  const favorites = new Map<string, number | null>();
  let playlists: Playlist[] = catalog.playlists;
  const edit = (id: string, fn: (p: Playlist) => Playlist) => {
    playlists = playlists.map((p) => (p.id === id && p.type === 'manual' ? fn(p) : p));
  };

  for (const c of changes) {
    switch (c.kind) {
      case 'favorite': {
        const fp = fingerprints.get(c.trackId);
        if (fp) favorites.set(fp, c.on ? c.at : null);
        break;
      }
      case 'createPlaylist':
        if (!playlists.some((p) => p.id === c.id)) {
          playlists = [
            ...playlists,
            {
              id: c.id,
              name: c.name,
              type: 'manual',
              folder: null,
              trackIds: c.trackIds.filter((t) => known.has(t)),
            },
          ];
        }
        break;
      case 'renamePlaylist':
        edit(c.id, (p) => ({ ...p, name: c.name }));
        break;
      case 'deletePlaylist':
        playlists = playlists.filter((p) => p.id !== c.id || p.type !== 'manual');
        break;
      case 'addTracks':
        edit(c.id, (p) => {
          const present = new Set(p.trackIds);
          const added = [...new Set(c.trackIds)].filter((t) => !present.has(t) && known.has(t));
          return { ...p, trackIds: [...p.trackIds, ...added] };
        });
        break;
      case 'removeTrack':
        edit(c.id, (p) => ({ ...p, trackIds: p.trackIds.filter((t) => t !== c.trackId) }));
        break;
    }
  }

  const tracks =
    favorites.size === 0
      ? catalog.tracks
      : catalog.tracks.map((t) =>
          favorites.has(t.fingerprint) ? { ...t, favoritedAt: favorites.get(t.fingerprint) ?? null } : t,
        );
  return { ...catalog, tracks, playlists };
}

/**
 * Cambios previos que el nuevo vuelve innecesarios: marcar y desmarcar la misma favorita deja solo lo último.
 * Lo demás se manda tal cual y en orden (una lista nueva y lo que se le agrega van por separado).
 */
export function supersededBy(change: PendingChange, pending: StoredChange[]): number[] {
  if (change.kind !== 'favorite') return [];
  return pending
    .filter((p) => p.change.kind === 'favorite' && p.change.trackId === change.trackId)
    .map((p) => p.seq);
}

/** Pedido HTTP de un cambio. */
export function changeRequest(change: PendingChange): { method: string; path: string; body?: object } {
  const id = encodeURIComponent('id' in change ? change.id : '');
  switch (change.kind) {
    case 'favorite':
      return {
        method: change.on ? 'PUT' : 'DELETE',
        path: `/api/favorites/${encodeURIComponent(change.trackId)}`,
      };
    case 'createPlaylist':
      return {
        method: 'POST',
        path: '/api/playlists',
        body: { id: change.id, name: change.name, trackIds: change.trackIds },
      };
    case 'renamePlaylist':
      return { method: 'PATCH', path: `/api/playlists/${id}`, body: { name: change.name } };
    case 'deletePlaylist':
      return { method: 'DELETE', path: `/api/playlists/${id}` };
    case 'addTracks':
      return { method: 'POST', path: `/api/playlists/${id}/tracks`, body: { trackIds: change.trackIds } };
    case 'removeTrack':
      return { method: 'DELETE', path: `/api/playlists/${id}/tracks/${encodeURIComponent(change.trackId)}` };
  }
}

/**
 * Manda los cambios pendientes en orden. Si la compu rechaza uno porque ya no tiene sentido (la canción o la
 * lista ya no existe, 4xx) se descarta para no trabar los demás; sin conexión, token revocado o error de la
 * compu (5xx) se frena y lo que falta queda para la próxima. Devuelve cuántos llegaron.
 */
export async function flushPending(deps: {
  store: PendingStore;
  client: { applyChange(change: PendingChange): Promise<void> };
}): Promise<number> {
  let sent = 0;
  for (;;) {
    const head = deps.store.getPending()[0];
    if (!head) return sent;
    try {
      await deps.client.applyChange(head.change);
      sent++;
    } catch (err) {
      const rejected = err instanceof ServerError && err.status >= 400 && err.status < 500;
      if (!rejected) throw err;
    }
    // Se saca por número: si mientras tanto otro cambio lo reemplazó, ya no está y no pasa nada.
    deps.store.removePending(head.seq);
  }
}

/**
 * Id (UUID v4) para una lista creada en el celular. No necesita ser criptográfico: solo no repetirse. Usa
 * `crypto.randomUUID` si el motor lo trae y si no lo arma a mano.
 */
export function newPlaylistId(random: () => number = Math.random): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (native && random === Math.random) return native.call(globalThis.crypto);
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  const variant = ((Math.floor(random() * 4) + 8) as number).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
