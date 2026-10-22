import { createAudioPlaylist } from 'expo-audio';
import type { PlayerEngine } from '../core/types.ts';

/**
 * Motor de audio sobre AudioPlaylist de expo-audio: la cola vive del lado nativo y sigue avanzando
 * en segundo plano. expo-audio trabaja en segundos; el controlador, en milisegundos.
 */
export function createPlayerEngine(): PlayerEngine {
  const playlist = createAudioPlaylist({ loop: 'none', updateInterval: 500 });
  let lockScreenActive = false;

  return {
    load(sources, startIndex, positionMs, autoplay) {
      playlist.pause();
      playlist.clear();
      for (const source of sources) playlist.add(source);
      if (sources.length === 0) return;
      playlist.skipTo(startIndex);
      if (positionMs > 0) void playlist.seekTo(positionMs / 1000);
      if (autoplay) playlist.play();
    },
    play: () => playlist.play(),
    pause: () => playlist.pause(),
    skipTo: (index) => playlist.skipTo(index),
    seekTo: (ms) => void playlist.seekTo(ms / 1000),
    setLoop: (mode) => {
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
    status: () => ({
      index: playlist.currentIndex,
      positionMs: Math.round(playlist.currentTime * 1000),
      durationMs: Math.round(playlist.duration * 1000),
      playing: playlist.playing,
    }),
    onTrackChanged(cb) {
      const sub = playlist.addListener('trackChanged', ({ currentIndex }) => cb(currentIndex));
      return () => sub.remove();
    },
    onStatus(cb) {
      const sub = playlist.addListener('playlistStatusUpdate', () => cb());
      return () => sub.remove();
    },
  };
}
