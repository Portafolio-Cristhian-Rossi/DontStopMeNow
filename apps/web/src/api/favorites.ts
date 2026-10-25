import type { Catalog, Track } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { notify } from '../components/Toast.tsx';
import { api } from './client.ts';
import { queryKeys } from './queries.ts';

/** Cambia `favoritedAt` de todas las copias (misma huella) en el catálogo en caché. */
function withFavorite(catalog: Catalog, fingerprint: string, favoritedAt: number | null): Catalog {
  return {
    ...catalog,
    tracks: catalog.tracks.map((t) => (t.fingerprint === fingerprint ? { ...t, favoritedAt } : t)),
  };
}

/**
 * Marca o desmarca una favorita. El corazón cambia al instante; si el servidor falla, vuelve a como
 * estaba y avisa. El catálogo definitivo llega solo, con el aviso de revisión del servidor.
 */
export function useToggleFavorite(): (track: Track) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (track: Track) => {
      const on = !track.favoritedAt;
      const before = queryClient.getQueryData<Catalog>(queryKeys.catalog);
      if (before) {
        queryClient.setQueryData(
          queryKeys.catalog,
          withFavorite(before, track.fingerprint, on ? Date.now() : null),
        );
      }
      try {
        await api.setFavorite(track.id, on);
      } catch (err) {
        const now = queryClient.getQueryData<Catalog>(queryKeys.catalog);
        if (now)
          queryClient.setQueryData(
            queryKeys.catalog,
            withFavorite(now, track.fingerprint, track.favoritedAt ?? null),
          );
        notify(
          `No se pudo ${on ? 'agregar a' : 'quitar de'} favoritas: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [queryClient],
  );
}
