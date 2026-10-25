import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCatalog } from '../api/queries.ts';
import { Player, type PlayerSnapshot } from './player.ts';

const PlayerContext = createContext<Player | null>(null);

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createPlayer(): Player {
  return new Player({
    audio: new Audio(),
    storage: safeStorage(),
    mediaSession: 'mediaSession' in navigator ? navigator.mediaSession : null,
  });
}

/** Un solo reproductor para toda la web: sigue sonando al cambiar de página. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player] = useState(createPlayer);
  const { data } = useCatalog();

  useEffect(() => {
    if (data) player.syncCatalog(data);
  }, [player, data]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

/** Solo el reproductor, sin suscribirse: para páginas que llaman acciones y no muestran el estado. */
export function usePlayerActions(): Player {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('usePlayer fuera de PlayerProvider');
  return player;
}

/** El reproductor (para sus acciones) y su estado actual; re-renderiza con cada avance del tiempo. */
export function usePlayer(): [PlayerSnapshot, Player] {
  const player = usePlayerActions();
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  return [snapshot, player];
}

/** La canción que suena; solo re-renderiza cuando cambia (no con cada segundo). */
export function useCurrentTrackId(): string | null {
  const player = usePlayerActions();
  return useSyncExternalStore(player.subscribe, () => player.getSnapshot().track?.id ?? null);
}
