import {
  addToQueue,
  clearUpcoming,
  createQueue,
  currentId,
  moveItem,
  moveTo,
  playNext,
  removeAt,
  removeMissing,
  setShuffle,
  type Album,
  type Catalog,
  type QueueState,
  type RepeatMode,
  type Track,
} from '@dsmn/shared';
import { coverUrl } from '../api/client.ts';

/** Lo que el reproductor usa del `<audio>`; en los tests es un doble. */
export interface AudioLike {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: () => void): void;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Temporizador para dormir: apagado, al terminar la canción o a una hora (`until`, en ms). */
export type Sleep = { kind: 'off' } | { kind: 'end' } | { kind: 'timer'; minutes: number; until: number };

export interface PlayerSnapshot {
  queue: QueueState | null;
  track: Track | null;
  album: Album | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  rate: number;
  sleep: Sleep;
}

export interface PlayerDeps {
  audio: AudioLike;
  storage?: StorageLike | null;
  mediaSession?: MediaSession | null;
  now?: () => number;
  random?: () => number;
}

export const STORAGE_KEY = 'dsmn.player';
/** Pasado este tiempo, "Anterior" vuelve al principio de la canción en lugar de ir a la anterior. */
export const RESTART_THRESHOLD_MS = 3000;
/** Cada cuánto se guarda la posición mientras suena. */
const SAVE_EVERY_MS = 5000;

const trackUrl = (id: string) => `/api/tracks/${encodeURIComponent(id)}/file`;

interface Saved {
  queue: QueueState;
  positionMs: number;
  volume: number;
  rate: number;
}

function isQueue(value: unknown): value is QueueState {
  const q = value as QueueState;
  return (
    typeof q === 'object' &&
    q !== null &&
    Array.isArray(q.order) &&
    Array.isArray(q.original) &&
    Number.isInteger(q.index) &&
    typeof q.shuffle === 'boolean' &&
    ['off', 'all', 'one'].includes(q.repeat)
  );
}

/**
 * Reproductor de la web: la cola (la misma lógica que la app), el `<audio>`, los ajustes, el temporizador,
 * la Media Session y el estado guardado. No depende de React: la interfaz lo lee con `subscribe` y
 * `getSnapshot` (pensados para `useSyncExternalStore`).
 */
export class Player {
  private queue: QueueState | null = null;
  private playing = false;
  private positionMs = 0;
  private durationMs = 0;
  private volume = 1;
  private rate = 1;
  private sleep: Sleep = { kind: 'off' };
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSeekMs: number | null = null;
  private lastSave = 0;
  private tracks = new Map<string, Track>();
  private albums = new Map<string, Album>();
  private snapshot: PlayerSnapshot;
  private listeners = new Set<() => void>();
  private readonly audio: AudioLike;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly deps: PlayerDeps) {
    this.audio = deps.audio;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.snapshot = this.build();
    this.audio.addEventListener('play', () => this.update({ playing: true }));
    this.audio.addEventListener('pause', () => {
      this.update({ playing: false });
      this.save();
    });
    this.audio.addEventListener('timeupdate', () => this.onTime());
    this.audio.addEventListener('durationchange', () => this.onDuration());
    this.audio.addEventListener('loadedmetadata', () => this.onDuration());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.restore();
    this.setupMediaSession();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PlayerSnapshot => this.snapshot;

  /** Datos de las canciones; saca de la cola las que ya no están (o no están disponibles). */
  syncCatalog(catalog: Catalog): void {
    this.tracks = new Map(catalog.tracks.map((t) => [t.id, t]));
    this.albums = new Map(catalog.albums.map((a) => [a.id, a]));
    const q = this.queue;
    if (q) {
      const before = currentId(q);
      const next = removeMissing(q, (id) => this.tracks.get(id)?.available === true);
      if (next.index < 0) return this.stop();
      this.queue = next;
      if (currentId(next) !== before) return this.load(this.playing, 0);
    }
    this.emit();
    this.updateMetadata();
  }

  /** Arranca una cola nueva con `trackIds`, desde la canción en `startIndex`. */
  playList(trackIds: string[], startIndex: number, opts: { shuffle?: boolean } = {}): void {
    const usable = (id: string) => this.tracks.size === 0 || this.tracks.get(id)?.available === true;
    const kept = trackIds.filter(usable);
    if (kept.length === 0) return;
    const before = trackIds.slice(0, startIndex).filter(usable).length;
    const start = opts.shuffle && startIndex === 0 ? Math.floor(this.random() * kept.length) : before;
    this.queue = createQueue(
      kept,
      Math.min(start, kept.length - 1),
      { shuffle: opts.shuffle ?? this.queue?.shuffle ?? false, repeat: this.queue?.repeat ?? 'off' },
      this.random,
    );
    this.load(true, 0);
  }

  toggle(): void {
    if (!this.current()) return;
    if (this.playing) this.audio.pause();
    else void this.audio.play().catch(() => this.update({ playing: false }));
  }

  next(): void {
    const q = this.queue;
    if (!q) return;
    if (q.index < q.order.length - 1) this.jump(q.index + 1, this.playing);
    else if (q.repeat === 'all') this.jump(0, this.playing);
  }

  previous(): void {
    const q = this.queue;
    if (!q) return;
    if (this.audio.currentTime * 1000 > RESTART_THRESHOLD_MS || q.index === 0) this.seek(0);
    else this.jump(q.index - 1, this.playing);
  }

  seek(ms: number): void {
    if (!this.current()) return;
    this.audio.currentTime = ms / 1000;
    this.update({ positionMs: ms });
  }

  jumpTo(index: number): void {
    if (this.queue && index >= 0 && index < this.queue.order.length) this.jump(index, true);
  }

  setShuffle(on: boolean): void {
    if (!this.queue) return;
    this.queue = setShuffle(this.queue, on, this.random);
    this.changed();
  }

  setRepeat(repeat: RepeatMode): void {
    if (!this.queue) return;
    this.queue = { ...this.queue, repeat };
    this.changed();
  }

  playNext(trackId: string): void {
    if (!this.queue) return this.playList([trackId], 0);
    this.queue = playNext(this.queue, trackId);
    this.changed();
  }

  addToQueue(trackId: string): void {
    if (!this.queue) return this.playList([trackId], 0);
    this.queue = addToQueue(this.queue, trackId);
    this.changed();
  }

  removeAt(index: number): void {
    const q = this.queue;
    if (!q) return;
    const next = removeAt(q, index);
    if (next.index < 0) return this.stop();
    this.queue = next;
    if (index === q.index) this.load(this.playing, 0);
    else this.changed();
  }

  move(from: number, to: number): void {
    if (!this.queue) return;
    this.queue = moveItem(this.queue, from, to);
    this.changed();
  }

  clearUpcoming(): void {
    if (!this.queue) return;
    this.queue = clearUpcoming(this.queue);
    this.changed();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.audio.volume = this.volume;
    this.changed();
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.audio.playbackRate = rate;
    this.changed();
  }

  setSleep(setting: { kind: 'off' } | { kind: 'end' } | { kind: 'timer'; minutes: number }): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (setting.kind === 'timer') {
      const ms = setting.minutes * 60_000;
      this.sleep = { kind: 'timer', minutes: setting.minutes, until: this.now() + ms };
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        this.sleep = { kind: 'off' };
        this.audio.pause();
        this.emit();
      }, ms);
    } else {
      this.sleep = setting;
    }
    this.emit();
  }

  private current(): string | null {
    return this.queue ? currentId(this.queue) : null;
  }

  private jump(index: number, autoplay: boolean): void {
    if (!this.queue) return;
    this.queue = moveTo(this.queue, index);
    this.load(autoplay, 0);
  }

  /** Carga en el `<audio>` la canción actual de la cola, desde `positionMs`. */
  private load(autoplay: boolean, positionMs: number): void {
    const id = this.current();
    if (!id) return this.stop();
    this.audio.src = trackUrl(id);
    this.pendingSeekMs = positionMs > 0 ? positionMs : null;
    this.positionMs = positionMs;
    this.durationMs = (this.tracks.get(id)?.durationMs ?? 0) || 0;
    if (autoplay) void this.audio.play().catch(() => this.update({ playing: false }));
    this.changed();
    this.updateMetadata();
  }

  private stop(): void {
    this.queue = null;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.positionMs = 0;
    this.durationMs = 0;
    this.changed();
    this.updateMetadata();
  }

  private onTime(): void {
    if (this.pendingSeekMs !== null) return;
    this.update({ positionMs: Math.round(this.audio.currentTime * 1000) });
    if (this.playing && this.now() - this.lastSave >= SAVE_EVERY_MS) this.save();
  }

  private onDuration(): void {
    if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      this.durationMs = Math.round(this.audio.duration * 1000);
    }
    if (this.pendingSeekMs !== null) {
      this.audio.currentTime = this.pendingSeekMs / 1000;
      this.pendingSeekMs = null;
    }
    this.emit();
  }

  private onEnded(): void {
    const q = this.queue;
    if (!q) return;
    if (this.sleep.kind === 'end') {
      this.sleep = { kind: 'off' };
      this.update({ playing: false });
      return;
    }
    if (q.repeat === 'one') {
      this.audio.currentTime = 0;
      void this.audio.play().catch(() => this.update({ playing: false }));
    } else if (q.index < q.order.length - 1) {
      this.jump(q.index + 1, true);
    } else if (q.repeat === 'all') {
      this.jump(0, true);
    } else {
      // Fin de la cola: queda en pausa al principio de la última, lista para volver a darle play.
      this.audio.currentTime = 0;
      this.update({ playing: false, positionMs: 0 });
      this.save();
    }
  }

  private update(patch: { playing?: boolean; positionMs?: number }): void {
    if (patch.playing !== undefined) this.playing = patch.playing;
    if (patch.positionMs !== undefined) this.positionMs = patch.positionMs;
    this.emit();
    if (patch.playing !== undefined && this.deps.mediaSession) {
      this.deps.mediaSession.playbackState = this.playing ? 'playing' : 'paused';
    }
  }

  /** Cambió la cola o un ajuste: se avisa y se guarda. */
  private changed(): void {
    this.emit();
    this.save();
  }

  private build(): PlayerSnapshot {
    const track = this.tracks.get(this.current() ?? '') ?? null;
    return {
      queue: this.queue,
      track,
      album: (track && this.albums.get(track.albumId)) ?? null,
      playing: this.playing,
      positionMs: this.positionMs,
      durationMs: this.durationMs,
      volume: this.volume,
      rate: this.rate,
      sleep: this.sleep,
    };
  }

  private emit(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }

  private save(): void {
    const storage = this.deps.storage;
    if (!storage) return;
    this.lastSave = this.now();
    try {
      if (!this.queue) return storage.setItem(STORAGE_KEY, 'null');
      const saved: Saved = {
        queue: this.queue,
        positionMs: this.positionMs,
        volume: this.volume,
        rate: this.rate,
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Sin espacio o almacenamiento bloqueado: el reproductor sigue andando, solo no recuerda.
    }
  }

  /** Vuelve a la cola, la canción y el segundo de la última vez, en pausa. */
  private restore(): void {
    let saved: Partial<Saved> | null;
    try {
      saved = JSON.parse(this.deps.storage?.getItem(STORAGE_KEY) ?? 'null') as Partial<Saved> | null;
    } catch {
      return;
    }
    if (!saved) return;
    if (typeof saved.volume === 'number') this.volume = Math.min(1, Math.max(0, saved.volume));
    if (typeof saved.rate === 'number' && saved.rate > 0) this.rate = saved.rate;
    this.audio.volume = this.volume;
    this.audio.playbackRate = this.rate;
    if (isQueue(saved.queue) && currentId(saved.queue) !== null) {
      this.queue = saved.queue;
      this.load(false, typeof saved.positionMs === 'number' ? saved.positionMs : 0);
    } else {
      this.emit();
    }
  }

  private setupMediaSession(): void {
    const session = this.deps.mediaSession;
    if (!session) return;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => !this.playing && this.toggle()],
      ['pause', () => this.playing && this.toggle()],
      ['previoustrack', () => this.previous()],
      ['nexttrack', () => this.next()],
      ['seekto', (d) => d.seekTime !== undefined && this.seek(d.seekTime * 1000)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // El navegador no soporta esa acción.
      }
    }
  }

  private updateMetadata(): void {
    const session = this.deps.mediaSession;
    if (!session || typeof MediaMetadata === 'undefined') return;
    const { track, album } = this.snapshot;
    session.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: album?.title ?? '',
          artwork: track.coverId ? [{ src: coverUrl(track.coverId) }] : [],
        })
      : null;
  }
}
