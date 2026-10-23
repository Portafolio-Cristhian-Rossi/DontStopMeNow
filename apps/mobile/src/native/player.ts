import { createAudioPlaylist, type AudioPlaylist } from 'expo-audio';
import type { EngineStatus, PlayerEngine } from '../core/types.ts';

const UPDATE_INTERVAL_MS = 500;

type PlaylistLike = Pick<
  AudioPlaylist,
  'currentIndex' | 'trackCount' | 'currentTime' | 'duration' | 'playing'
>;

/** Estado en milisegundos (expo-audio trabaja en segundos). */
function toStatus(p: PlaylistLike, didJustFinish = false): EngineStatus {
  const atLastEnd =
    p.trackCount > 0 &&
    p.currentIndex === p.trackCount - 1 &&
    p.duration > 0 &&
    p.currentTime >= p.duration - 0.5;
  return {
    index: p.currentIndex,
    positionMs: Math.round(p.currentTime * 1000),
    durationMs: Math.round(p.duration * 1000),
    playing: p.playing,
    ended: !p.playing && (didJustFinish || atLastEnd),
  };
}

/**
 * Motor de audio sobre AudioPlaylist de expo-audio: la cola vive del lado nativo y sigue avanzando
 * en segundo plano. Cargar una cola nueva crea otra playlist con todas las fuentes de una vez (agregar
 * canción por canción cuesta O(n²) y emite un evento por cada una).
 */
export function createPlayerEngine(): PlayerEngine {
  const trackListeners = new Set<(index: number) => void>();
  const statusListeners = new Set<(status: EngineStatus) => void>();
  let lockScreenActive = false;
  let loop: AudioPlaylist['loop'] = 'none';
  let subscriptions: { remove(): void }[] = [];

  function create(sources: { uri: string }[]): AudioPlaylist {
    const created = createAudioPlaylist({ sources, loop, updateInterval: UPDATE_INTERVAL_MS });
    subscriptions = [
      created.addListener('trackChanged', ({ currentIndex }) =>
        trackListeners.forEach((cb) => cb(currentIndex)),
      ),
      created.addListener('playlistStatusUpdate', (status) => {
        const s = toStatus(status, status.didJustFinish);
        statusListeners.forEach((cb) => cb(s));
      }),
    ];
    return created;
  }

  let playlist = create([]);

  return {
    load(sources, startIndex, positionMs, autoplay) {
      subscriptions.forEach((s) => s.remove());
      playlist.pause();
      playlist.destroy();
      lockScreenActive = false;
      playlist = create(sources);
      if (sources.length === 0) return;
      if (startIndex > 0) playlist.skipTo(startIndex);
      if (positionMs > 0) void playlist.seekTo(positionMs / 1000);
      if (autoplay) playlist.play();
    },
    play: () => playlist.play(),
    pause: () => playlist.pause(),
    skipTo: (index) => playlist.skipTo(index),
    seekTo: (ms) => void playlist.seekTo(ms / 1000),
    setLoop: (mode) => {
      loop = mode;
      playlist.loop = mode;
    },
    insert: (source, index) => playlist.insert(source, index),
    add: (source) => playlist.add(source),
    remove: (index) => playlist.remove(index),
    setNowPlaying(meta) {
      if (lockScreenActive) {
        playlist.updateLockScreenMetadata(meta);
      } else {
        playlist.setActiveForLockScreen(true, meta, { showNextTrack: true, showPreviousTrack: true });
        lockScreenActive = true;
      }
    },
    clearNowPlaying() {
      if (!lockScreenActive) return;
      playlist.clearLockScreenControls();
      lockScreenActive = false;
    },
    status: () => toStatus(playlist),
    onTrackChanged(cb) {
      trackListeners.add(cb);
      return () => trackListeners.delete(cb);
    },
    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
}
