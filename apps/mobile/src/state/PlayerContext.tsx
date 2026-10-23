import { requestNotificationPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import type { Catalog } from '@dsmn/shared';
import { PlayerController, type PlayerSnapshot } from '../core/player/controller.ts';
import type { StoredDownload } from '../core/store.ts';
import { createPlayerEngine } from '../native/index.ts';
import { useApp } from './AppContext.tsx';

const PERSIST_EVERY_MS = 10_000;

/** Datos que el controlador consulta en cada llamada; la capa de React los actualiza en efectos. */
class Lookup {
  private paths = new Map<string, string>();
  private current: Catalog | null = null;

  update(downloads: StoredDownload[], catalog: Catalog | null): void {
    this.paths = new Map(downloads.map((d) => [d.trackId, d.path]));
    this.current = catalog;
  }

  downloadPath = (id: string) => this.paths.get(id) ?? null;
  catalog = () => this.current;
}
const PlayerContext = createContext<PlayerController | null>(null);

export function usePlayer(): PlayerController {
  const player = useContext(PlayerContext);
  if (!player) throw new Error('usePlayer fuera de PlayerProvider');
  return player;
}

/** Solo el id de la canción actual: las filas de la biblioteca no se re-renderizan con el progreso. */
export function useCurrentTrackId(): string | null {
  const player = usePlayer();
  return useSyncExternalStore(player.subscribe, () => player.currentTrackId());
}

export function usePlayerSnapshot(): PlayerSnapshot {
  const player = usePlayer();
  return useSyncExternalStore(player.subscribe, player.getSnapshot);
}

/** Un único reproductor para toda la app. Debe ir dentro de AppProvider. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const [lookup] = useState(() => {
    const l = new Lookup();
    l.update(app.downloads, app.catalog);
    return l;
  });
  const [player] = useState(
    () =>
      new PlayerController({
        engine: createPlayerEngine(),
        store: app.store,
        files: app.files,
        catalog: lookup.catalog,
        downloadPath: lookup.downloadPath,
      }),
  );
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);

  // Modo de audio: sigue sonando con la pantalla apagada y pausa en llamadas. Luego se retoma la cola guardada.
  useEffect(() => {
    void setAudioModeAsync({
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMixPersistent',
      playsInSilentMode: true,
    });
    player.restore();
    app.setPlayingTrackProvider(() => player.currentTrackId());
    // Solo al montar: el controlador y el store no cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // Si una sincronización (o "borrar todo") quitó canciones, salen de la cola.
  useEffect(() => {
    lookup.update(app.downloads, app.catalog);
    player.pruneMissing();
  }, [lookup, player, app.downloads, app.catalog]);

  // Sin este permiso (Android 13+) no aparecen los controles en la notificación.
  const askedNotifications = useRef(false);
  useEffect(() => {
    if (!snapshot.playing || askedNotifications.current || Platform.OS !== 'android') return;
    askedNotifications.current = true;
    void requestNotificationPermissionsAsync();
  }, [snapshot.playing]);

  useEffect(() => {
    if (!snapshot.playing) return;
    const timer = setInterval(() => player.tick(), PERSIST_EVERY_MS);
    return () => clearInterval(timer);
  }, [player, snapshot.playing]);

  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}
