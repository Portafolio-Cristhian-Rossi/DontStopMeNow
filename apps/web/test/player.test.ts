import type { Catalog, Track } from '@dsmn/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, STORAGE_KEY, type AudioLike, type StorageLike } from '../src/player/player.ts';

class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  duration = NaN;
  volume = 1;
  playbackRate = 1;
  playing = false;
  private listeners = new Map<string, (() => void)[]>();
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  play() {
    this.playing = true;
    this.fire('play');
    return Promise.resolve();
  }
  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.fire('pause');
  }
  fire(type: string) {
    for (const l of this.listeners.get(type) ?? []) l();
  }
  /** El navegador terminó la canción: queda en pausa y avisa `ended`. */
  end() {
    this.playing = false;
    this.fire('pause');
    this.fire('ended');
  }
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

function track(id: string, extra: Partial<Track> = {}): Track {
  return {
    id,
    title: `Canción ${id}`,
    artist: 'Artista',
    albumId: 'al',
    trackNo: null,
    discNo: null,
    durationMs: 200_000,
    size: 1,
    format: 'mp3',
    fingerprint: id,
    coverId: null,
    available: true,
    ...extra,
  } as Track;
}

function catalog(tracks: Track[]): Catalog {
  return {
    serverId: 's',
    revision: 1,
    tracks,
    albums: [
      {
        id: 'al',
        title: 'Disco',
        artist: 'Artista',
        year: 2020,
        coverId: null,
        trackIds: tracks.map((t) => t.id),
      },
    ],
    playlists: [],
  } as unknown as Catalog;
}

const src = (id: string) => `/api/tracks/${id}/file`;

let audio: FakeAudio;
let storage: MemoryStorage;

function makePlayer(ids = ['a', 'b', 'c']) {
  const player = new Player({ audio, storage, random: () => 0 });
  player.syncCatalog(catalog(ids.map((id) => track(id))));
  return player;
}

beforeEach(() => {
  audio = new FakeAudio();
  storage = new MemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Player', () => {
  it('reproduce una lista desde la canción elegida', () => {
    const player = makePlayer();
    player.playList(['a', 'b', 'c'], 1);
    expect(audio.src).toBe(src('b'));
    expect(player.getSnapshot()).toMatchObject({
      playing: true,
      track: { id: 'b' },
      album: { title: 'Disco' },
    });
  });

  it('no mete en la cola canciones no disponibles', () => {
    const player = new Player({ audio, storage });
    player.syncCatalog(catalog([track('a'), track('b', { available: false }), track('c')]));
    player.playList(['a', 'b', 'c'], 2);
    expect(player.getSnapshot().queue?.order).toEqual(['a', 'c']);
    expect(audio.src).toBe(src('c'));
  });

  it('al terminar pasa a la siguiente y al final de la cola queda en pausa en la última', () => {
    const player = makePlayer(['a', 'b']);
    player.playList(['a', 'b'], 0);
    audio.end();
    expect(audio.src).toBe(src('b'));
    expect(player.getSnapshot().playing).toBe(true);
    audio.currentTime = 199;
    audio.end();
    expect(audio.src).toBe(src('b'));
    expect(audio.currentTime).toBe(0);
    expect(player.getSnapshot()).toMatchObject({ playing: false, positionMs: 0 });
  });

  it('repetir todo vuelve a la primera y repetir una repite la misma', () => {
    const player = makePlayer(['a', 'b']);
    player.playList(['a', 'b'], 1);
    player.setRepeat('all');
    audio.end();
    expect(audio.src).toBe(src('a'));
    player.setRepeat('one');
    audio.currentTime = 120;
    audio.end();
    expect(audio.src).toBe(src('a'));
    expect(audio.currentTime).toBe(0);
    expect(audio.playing).toBe(true);
  });

  it('anterior vuelve al principio pasados 3 segundos y si no va a la anterior', () => {
    const player = makePlayer();
    player.playList(['a', 'b', 'c'], 1);
    audio.currentTime = 10;
    player.previous();
    expect(audio.src).toBe(src('b'));
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 1;
    player.previous();
    expect(audio.src).toBe(src('a'));
  });

  it('quitar la que suena carga la siguiente sin cortar', () => {
    const player = makePlayer();
    player.playList(['a', 'b', 'c'], 0);
    player.removeAt(0);
    expect(audio.src).toBe(src('b'));
    expect(player.getSnapshot()).toMatchObject({ playing: true, queue: { order: ['b', 'c'], index: 0 } });
  });

  it('el temporizador "al terminar la canción" pausa en lugar de avanzar', () => {
    const player = makePlayer();
    player.playList(['a', 'b', 'c'], 0);
    player.setSleep({ kind: 'end' });
    audio.end();
    expect(audio.src).toBe(src('a'));
    expect(player.getSnapshot()).toMatchObject({ playing: false, sleep: { kind: 'off' } });
  });

  it('el temporizador por minutos pausa al vencer', () => {
    vi.useFakeTimers();
    const player = makePlayer();
    player.playList(['a', 'b', 'c'], 0);
    player.setSleep({ kind: 'timer', minutes: 15 });
    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(audio.playing).toBe(true);
    vi.advanceTimersByTime(1);
    expect(audio.playing).toBe(false);
    expect(player.getSnapshot().sleep).toEqual({ kind: 'off' });
  });

  it('recuerda la cola, la canción, el segundo y los ajustes, y vuelve en pausa', () => {
    const first = makePlayer();
    first.playList(['a', 'b', 'c'], 2);
    first.setVolume(0.4);
    first.setRate(1.25);
    audio.currentTime = 42;
    audio.fire('timeupdate');
    audio.pause();

    audio = new FakeAudio();
    const second = new Player({ audio, storage });
    expect(audio.src).toBe(src('c'));
    expect(audio.playing).toBe(false);
    expect(audio.volume).toBe(0.4);
    expect(audio.playbackRate).toBe(1.25);
    audio.duration = 200;
    audio.fire('loadedmetadata');
    expect(audio.currentTime).toBe(42);
    expect(second.getSnapshot()).toMatchObject({ playing: false, positionMs: 42_000, durationMs: 200_000 });
  });

  it('ignora un estado guardado roto', () => {
    storage.setItem(STORAGE_KEY, '{no es json');
    const player = new Player({ audio, storage });
    expect(player.getSnapshot().queue).toBeNull();
  });

  it('si la biblioteca borra la que suena pasa a la siguiente, y sin canciones se detiene', () => {
    const player = makePlayer();
    player.playList(['a', 'b', 'c'], 1);
    player.syncCatalog(catalog([track('a'), track('c')]));
    expect(audio.src).toBe(src('c'));
    expect(player.getSnapshot().queue?.order).toEqual(['a', 'c']);
    player.syncCatalog(catalog([]));
    expect(player.getSnapshot()).toMatchObject({ queue: null, track: null });
    expect(audio.src).toBe('');
  });
});
