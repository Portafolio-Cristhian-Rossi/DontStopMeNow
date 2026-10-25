import type { Album, Catalog, Track } from '@dsmn/shared';
import type { LocalStore } from '../store.ts';
import { coverPath } from '../syncEngine.ts';
import type { EngineLoop, EngineStatus, FileStore, PlayerEngine } from '../types.ts';
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
  type QueueState,
  type RepeatMode,
} from '@dsmn/shared';

/** Temporizador para dormir: apagado, al terminar la canción o a una hora (`until`, en ms). */
export type SleepSetting = { kind: 'off' } | { kind: 'end' } | { kind: 'timer'; minutes: number };
export type Sleep = { kind: 'off' } | { kind: 'end' } | { kind: 'timer'; minutes: number; until: number };

export interface PlayerSnapshot {
  queue: QueueState | null;
  current: Track | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  /** Velocidad de reproducción (1 = normal). */
  rate: number;
  sleep: Sleep;
}

export interface PlayerDeps {
  engine: PlayerEngine;
  store: LocalStore;
  files: FileStore;
  catalog: () => Catalog | null;
  /** Ruta del archivo descargado, o null si la canción no está en el celular. */
  downloadPath: (trackId: string) => string | null;
  random?: () => number;
}

const LOOP: Record<RepeatMode, EngineLoop> = { off: 'none', all: 'all', one: 'single' };
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
/** Con "anterior" después de esto, se vuelve al principio de la canción. */
const RESTART_THRESHOLD_MS = 3000;

/**
 * Lógica del reproductor sobre un motor con cola nativa: arma la cola, la mantiene igual a la del
 * motor (mismo orden e índices), guarda el estado para retomar y actualiza la pantalla de bloqueo.
 */
export class PlayerController {
  private queue: QueueState | null = null;
  private snapshot: PlayerSnapshot = {
    queue: null,
    current: null,
    playing: false,
    positionMs: 0,
    durationMs: 0,
    rate: 1,
    sleep: { kind: 'off' },
  };
  private rate = 1;
  private sleep: Sleep = { kind: 'off' };
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  /** El próximo cambio de canción lo pidió la persona (no es el fin natural de la anterior). */
  private manualSkip = false;
  private readonly listeners = new Set<() => void>();
  /** Los controles de la notificación se activan recién cuando se reproduce algo. */
  private nowPlayingActive = false;
  private refreshQueued = false;
  private latestStatus: EngineStatus | null = null;
  private lookup: { catalog: Catalog | null; tracks: Map<string, Track>; albums: Map<string, Album> } = {
    catalog: null,
    tracks: new Map(),
    albums: new Map(),
  };

  constructor(private readonly deps: PlayerDeps) {
    deps.engine.onTrackChanged((index) => {
      if (!this.queue) return;
      const manual = this.manualSkip;
      this.manualSkip = false;
      // "Al terminar la canción": terminó sola y el motor pasó a la siguiente → se pausa ahí.
      if (this.sleep.kind === 'end' && !manual) {
        this.sleep = { kind: 'off' };
        deps.engine.pause();
      }
      this.queue = moveTo(this.queue, index);
      this.updateNowPlaying();
      this.persist();
      this.refresh();
    });
    deps.engine.onStatus((status) => this.onEngineStatus(status));
  }

  /**
   * El motor manda su estado varias veces por segundo. El índice del motor manda: si cambió sin
   * aviso de cambio de canción (pasa al quitar canciones antes de la actual), la cola se corrige.
   * Una pausa desde afuera (notificación, auriculares) también se guarda.
   */
  private onEngineStatus(status: EngineStatus): void {
    const q = this.queue;
    if (q && status.index >= 0 && status.index < q.order.length && status.index !== q.index) {
      this.queue = moveTo(q, status.index);
      this.updateNowPlaying();
      this.persist(status.positionMs);
    } else if (this.snapshot.playing && !status.playing) {
      this.persist(status.positionMs);
    }
    this.latestStatus = status;
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh(this.latestStatus ?? undefined);
    });
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): PlayerSnapshot => this.snapshot;

  currentTrackId(): string | null {
    return this.queue ? currentId(this.queue) : null;
  }

  playList(trackIds: string[], startIndex: number, opts: { shuffle?: boolean } = {}): void {
    const kept = trackIds.filter((id) => this.deps.downloadPath(id) !== null);
    if (kept.length === 0) return;
    const before = trackIds.slice(0, startIndex).filter((id) => this.deps.downloadPath(id) !== null).length;
    const start = Math.min(before, kept.length - 1);
    const shuffle = opts.shuffle ?? this.queue?.shuffle ?? false;
    const repeat = this.queue?.repeat ?? 'off';
    this.queue = createQueue(kept, start, { shuffle, repeat }, this.deps.random);
    this.nowPlayingActive = true;
    this.loadEngine(0, true);
  }

  toggle(): void {
    if (!this.queue) return;
    const status = this.deps.engine.status();
    if (status.playing) {
      this.deps.engine.pause();
      this.persist();
    } else {
      // Al terminar la última canción el motor queda "terminado": play no haría nada.
      if (status.ended) this.skip(0);
      this.deps.engine.play();
      if (!this.nowPlayingActive) {
        this.nowPlayingActive = true;
        this.updateNowPlaying();
      }
    }
    this.refresh();
  }

  next(): void {
    const q = this.queue;
    if (!q) return;
    if (q.index < q.order.length - 1) this.skip(q.index + 1);
    else if (q.repeat === 'all') this.skip(0);
  }

  previous(): void {
    const q = this.queue;
    if (!q) return;
    if (this.deps.engine.status().positionMs > RESTART_THRESHOLD_MS || q.index === 0)
      this.deps.engine.seekTo(0);
    else this.skip(q.index - 1);
  }

  seek(ms: number): void {
    this.deps.engine.seekTo(ms);
  }

  jumpTo(index: number): void {
    if (this.queue && index >= 0 && index < this.queue.order.length) this.skip(index);
  }

  /** Cambio de canción pedido por la persona (para el temporizador "al terminar la canción"). */
  private skip(index: number): void {
    this.manualSkip = true;
    this.deps.engine.skipTo(index);
  }

  setRate(rate: number): void {
    this.rate = rate;
    this.deps.engine.setRate(rate);
    this.persist();
    this.refresh();
  }

  setSleep(setting: SleepSetting): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    if (setting.kind === 'timer') {
      const ms = setting.minutes * 60_000;
      this.sleep = { kind: 'timer', minutes: setting.minutes, until: Date.now() + ms };
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        this.sleep = { kind: 'off' };
        this.deps.engine.pause();
        this.persist();
        this.refresh();
      }, ms);
    } else {
      this.sleep = setting;
    }
    this.refresh();
  }

  /** Quita una canción de las que vienen (la que suena se cambia con "siguiente"). */
  removeAt(index: number): void {
    const q = this.queue;
    if (!q || index <= q.index || index >= q.order.length) return;
    this.queue = removeAt(q, index);
    this.deps.engine.remove(index);
    this.persist();
    this.refresh();
  }

  /** Reordena lo que viene después de la canción actual. */
  move(from: number, to: number): void {
    const q = this.queue;
    if (!q || from === to || Math.min(from, to) <= q.index || Math.max(from, to) >= q.order.length) return;
    const path = this.deps.downloadPath(q.order[from]!);
    if (!path) return;
    this.queue = moveItem(q, from, to);
    this.deps.engine.remove(from);
    this.deps.engine.insert({ uri: path }, to);
    this.persist();
    this.refresh();
  }

  clearUpcoming(): void {
    const q = this.queue;
    if (!q) return;
    for (let i = q.order.length - 1; i > q.index; i--) this.deps.engine.remove(i);
    this.queue = clearUpcoming(q);
    this.persist();
    this.refresh();
  }

  setShuffle(on: boolean): void {
    if (!this.queue || this.queue.shuffle === on) return;
    const { positionMs, playing } = this.deps.engine.status();
    this.queue = setShuffle(this.queue, on, this.deps.random);
    this.loadEngine(positionMs, playing);
  }

  setRepeat(repeat: RepeatMode): void {
    if (!this.queue || this.queue.repeat === repeat) return;
    this.queue = { ...this.queue, repeat };
    this.deps.engine.setLoop(LOOP[repeat]);
    this.persist();
    this.refresh();
  }

  cycleRepeat(): void {
    if (!this.queue) return;
    this.queue = { ...this.queue, repeat: NEXT_REPEAT[this.queue.repeat] };
    this.deps.engine.setLoop(LOOP[this.queue.repeat]);
    this.persist();
    this.refresh();
  }

  playNext(trackId: string): void {
    const path = this.deps.downloadPath(trackId);
    if (!path) return;
    if (!this.queue) return this.playList([trackId], 0);
    const at = this.queue.index + 1 + this.queue.nextCount;
    this.queue = playNext(this.queue, trackId);
    this.deps.engine.insert({ uri: path }, at);
    this.persist();
    this.refresh();
  }

  addToQueue(trackId: string): void {
    const path = this.deps.downloadPath(trackId);
    if (!path) return;
    if (!this.queue) return this.playList([trackId], 0);
    this.queue = addToQueue(this.queue, trackId);
    this.deps.engine.add({ uri: path });
    this.persist();
    this.refresh();
  }

  /** Retoma la cola guardada, en pausa, sin las canciones que ya no están descargadas. */
  restore(): void {
    const saved = this.deps.store.getPlayerState();
    if (!saved) return;
    const before = currentId(saved.queue);
    const queue = removeMissing(saved.queue, (id) => this.deps.downloadPath(id) !== null);
    if (queue.index < 0) {
      this.deps.store.setPlayerState(null);
      return;
    }
    this.queue = queue;
    if (typeof saved.rate === 'number' && saved.rate > 0) this.rate = saved.rate;
    this.loadEngine(currentId(queue) === before ? saved.positionMs : 0, false);
  }

  /** Tras una sincronización: saca de la cola lo que se borró, sin cortar la canción que suena. */
  pruneMissing(): void {
    const q = this.queue;
    if (!q) return;
    const exists = (id: string) => this.deps.downloadPath(id) !== null;
    const next = removeMissing(q, exists);
    if (next.order.length === q.order.length) return;
    const playingId = currentId(q);
    if (next.index < 0) {
      this.queue = null;
      this.deps.engine.load([], 0, 0, false);
      this.deps.engine.clearNowPlaying();
      this.nowPlayingActive = false;
      this.deps.store.setPlayerState(null);
    } else if (playingId !== null && exists(playingId)) {
      for (let i = q.order.length - 1; i >= 0; i--) if (!exists(q.order[i]!)) this.deps.engine.remove(i);
      this.queue = next;
      this.persist();
    } else {
      this.queue = next;
      this.loadEngine(0, this.deps.engine.status().playing);
    }
    this.refresh();
  }

  /** Lo llama la capa de React cada 10 s mientras suena. */
  tick(): void {
    if (this.deps.engine.status().playing) this.persist();
  }

  private loadEngine(positionMs: number, autoplay: boolean): void {
    const q = this.queue!;
    const sources = q.order.map((id) => ({ uri: this.deps.downloadPath(id)! }));
    this.deps.engine.load(sources, q.index, positionMs, autoplay);
    this.deps.engine.setLoop(LOOP[q.repeat]);
    this.deps.engine.setRate(this.rate);
    this.updateNowPlaying();
    this.persist();
    this.refresh();
  }

  private maps() {
    const catalog = this.deps.catalog();
    if (catalog !== this.lookup.catalog) {
      this.lookup = {
        catalog,
        tracks: new Map((catalog?.tracks ?? []).map((t) => [t.id, t])),
        albums: new Map((catalog?.albums ?? []).map((a) => [a.id, a])),
      };
    }
    return this.lookup;
  }

  private updateNowPlaying(): void {
    if (!this.nowPlayingActive) return;
    const id = this.currentTrackId();
    const { tracks, albums } = this.maps();
    const track = id ? tracks.get(id) : undefined;
    if (!track) return;
    const cover = track.coverId ? coverPath(this.deps.files, track.coverId) : null;
    this.deps.engine.setNowPlaying({
      title: track.title,
      artist: track.artist,
      albumTitle: albums.get(track.albumId)?.title ?? '',
      ...(cover && this.deps.files.exists(cover) ? { artworkUrl: cover } : {}),
    });
  }

  private persist(positionMs = this.deps.engine.status().positionMs): void {
    if (!this.queue) return;
    this.deps.store.setPlayerState({ queue: this.queue, positionMs, rate: this.rate });
  }

  private refresh(status: EngineStatus = this.deps.engine.status()): void {
    const id = this.currentTrackId();
    this.snapshot = {
      queue: this.queue,
      current: id ? (this.maps().tracks.get(id) ?? null) : null,
      playing: status.playing,
      positionMs: status.positionMs,
      durationMs: status.durationMs,
      rate: this.rate,
      sleep: this.sleep,
    };
    for (const cb of this.listeners) cb();
  }
}
