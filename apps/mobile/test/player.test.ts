import type { Catalog } from '@dsmn/shared';
import { describe, expect, it } from 'vitest';
import { PlayerController } from '../src/core/player/controller.ts';
import { LocalStore } from '../src/core/store.ts';
import type { PlayerEngine } from '../src/core/types.ts';
import { makeCatalog, makeTrack, memoryFiles, sqliteDb } from './helpers.ts';

type Call = [string, ...unknown[]];

function fakeEngine() {
  const calls: Call[] = [];
  let trackCb: ((i: number) => void) | null = null;
  const status = { index: 0, positionMs: 0, durationMs: 180_000, playing: false };
  const engine: PlayerEngine & { calls: Call[]; status_: typeof status; emitTrack(i: number): void } = {
    calls,
    status_: status,
    emitTrack(i) {
      status.index = i;
      trackCb?.(i);
    },
    load: (sources, startIndex, positionMs, autoplay) => {
      calls.push(['load', sources.map((s) => s.uri), startIndex, positionMs, autoplay]);
      status.index = startIndex;
      status.positionMs = positionMs;
      status.playing = autoplay;
    },
    play: () => {
      calls.push(['play']);
      status.playing = true;
    },
    pause: () => {
      calls.push(['pause']);
      status.playing = false;
    },
    skipTo: (i) => calls.push(['skipTo', i]),
    seekTo: (ms) => calls.push(['seekTo', ms]),
    setLoop: (mode) => calls.push(['setLoop', mode]),
    insert: (source, i) => calls.push(['insert', source.uri, i]),
    add: (source) => calls.push(['add', source.uri]),
    remove: (i) => calls.push(['remove', i]),
    setNowPlaying: (meta) => calls.push(['setNowPlaying', meta]),
    status: () => ({ ...status }),
    onTrackChanged: (cb) => {
      trackCb = cb;
      return () => (trackCb = null);
    },
    onStatus: () => () => {},
  };
  return engine;
}

function setup(downloaded = ['t1', 't2', 't3', 't4']) {
  const catalog: Catalog = makeCatalog({
    tracks: ['t1', 't2', 't3', 't4'].map((id) =>
      makeTrack(id, { title: `Tema ${id}`, coverId: id === 't1' ? 'c1' : null }),
    ),
    albums: [
      {
        id: 'al1',
        title: 'Disco',
        artist: 'Artista',
        year: null,
        coverId: 'c1',
        trackIds: ['t1', 't2', 't3', 't4'],
      },
    ],
  });
  const files = memoryFiles();
  files.files.set('/covers/c1', new Uint8Array([1]));
  const store = new LocalStore(sqliteDb());
  const engine = fakeEngine();
  const present = new Set(downloaded);
  const controller = new PlayerController({
    engine,
    store,
    files,
    catalog: () => catalog,
    downloadPath: (id) => (present.has(id) ? `/music/${id}.mp3` : null),
  });
  return { controller, engine, store, present, files };
}

const lastCall = (engine: { calls: Call[] }, name: string) =>
  engine.calls.filter((c) => c[0] === name).at(-1);

describe('PlayerController', () => {
  it('playList carga solo lo descargado y empieza a sonar', () => {
    const { controller, engine } = setup(['t1', 't3', 't4']);
    controller.playList(['t1', 't2', 't3', 't4'], 2);
    expect(lastCall(engine, 'load')).toEqual([
      'load',
      ['/music/t1.mp3', '/music/t3.mp3', '/music/t4.mp3'],
      1,
      0,
      true,
    ]);
    expect(controller.getSnapshot().current?.id).toBe('t3');
  });

  it('restaura pausado en la misma canción y segundo', () => {
    const { controller, engine, store } = setup();
    store.setPlayerState({
      queue: {
        order: ['t1', 't2', 't3'],
        original: ['t1', 't2', 't3'],
        index: 1,
        shuffle: false,
        repeat: 'all',
        nextCount: 0,
      },
      positionMs: 42_000,
    });
    controller.restore();
    expect(lastCall(engine, 'load')).toEqual([
      'load',
      ['/music/t1.mp3', '/music/t2.mp3', '/music/t3.mp3'],
      1,
      42_000,
      false,
    ]);
    expect(lastCall(engine, 'setLoop')).toEqual(['setLoop', 'all']);
    expect(controller.getSnapshot().playing).toBe(false);
  });

  it('restaurar descarta canciones que ya no están', () => {
    const { controller, engine, store } = setup(['t1', 't3']);
    store.setPlayerState({
      queue: {
        order: ['t1', 't2', 't3'],
        original: ['t1', 't2', 't3'],
        index: 2,
        shuffle: false,
        repeat: 'off',
        nextCount: 0,
      },
      positionMs: 5000,
    });
    controller.restore();
    expect(lastCall(engine, 'load')).toEqual(['load', ['/music/t1.mp3', '/music/t3.mp3'], 1, 5000, false]);
  });

  it('restaurar sin canciones disponibles deja el reproductor vacío', () => {
    const { controller, engine, store } = setup([]);
    store.setPlayerState({
      queue: { order: ['t1'], original: ['t1'], index: 0, shuffle: false, repeat: 'off', nextCount: 0 },
      positionMs: 0,
    });
    controller.restore();
    expect(lastCall(engine, 'load')).toBeUndefined();
    expect(controller.getSnapshot().current).toBeNull();
    expect(store.getPlayerState()).toBeNull();
  });

  it('"siguiente" con repetir una avanza igual', () => {
    const { controller, engine } = setup();
    controller.playList(['t1', 't2', 't3'], 0);
    controller.cycleRepeat();
    controller.cycleRepeat();
    expect(lastCall(engine, 'setLoop')).toEqual(['setLoop', 'single']);
    controller.next();
    expect(lastCall(engine, 'skipTo')).toEqual(['skipTo', 1]);
  });

  it('"siguiente" en la última solo vuelve al principio con repetir todo', () => {
    const { controller, engine } = setup();
    controller.playList(['t1', 't2'], 1);
    controller.next();
    expect(lastCall(engine, 'skipTo')).toBeUndefined();
    controller.cycleRepeat();
    controller.next();
    expect(lastCall(engine, 'skipTo')).toEqual(['skipTo', 0]);
  });

  it('anterior después de 3 s vuelve al principio', () => {
    const { controller, engine } = setup();
    controller.playList(['t1', 't2'], 1);
    engine.status_.positionMs = 5000;
    controller.previous();
    expect(lastCall(engine, 'seekTo')).toEqual(['seekTo', 0]);
    engine.status_.positionMs = 1000;
    controller.previous();
    expect(lastCall(engine, 'skipTo')).toEqual(['skipTo', 0]);
  });

  it('guarda el estado al cambiar de canción y al pausar', () => {
    const { controller, engine, store } = setup();
    controller.playList(['t1', 't2', 't3'], 0);
    engine.emitTrack(1);
    expect(store.getPlayerState()?.queue.index).toBe(1);
    engine.status_.positionMs = 33_000;
    controller.toggle();
    expect(lastCall(engine, 'pause')).toEqual(['pause']);
    expect(store.getPlayerState()?.positionMs).toBe(33_000);
  });

  it('a continuación y agregar a la cola llegan al motor en la posición correcta', () => {
    const { controller, engine } = setup();
    controller.playList(['t1', 't2'], 0);
    controller.playNext('t3');
    controller.playNext('t4');
    controller.addToQueue('t1');
    expect(engine.calls.filter((c) => c[0] === 'insert' || c[0] === 'add')).toEqual([
      ['insert', '/music/t3.mp3', 1],
      ['insert', '/music/t4.mp3', 2],
      ['add', '/music/t1.mp3'],
    ]);
    expect(controller.getSnapshot().queue?.order).toEqual(['t1', 't3', 't4', 't2', 't1']);
  });

  it('pruneMissing no corta la canción que suena', () => {
    const { controller, engine, present } = setup();
    controller.playList(['t1', 't2', 't3', 't4'], 1);
    const loads = engine.calls.filter((c) => c[0] === 'load').length;
    present.delete('t3');
    present.delete('t1');
    controller.pruneMissing();
    expect(engine.calls.filter((c) => c[0] === 'remove')).toEqual([
      ['remove', 2],
      ['remove', 0],
    ]);
    expect(engine.calls.filter((c) => c[0] === 'load').length).toBe(loads);
    expect(controller.getSnapshot().queue).toMatchObject({ order: ['t2', 't4'], index: 0 });
  });

  it('actualiza la pantalla de bloqueo con la portada local', () => {
    const { controller, engine } = setup();
    controller.playList(['t1', 't2'], 0);
    expect(lastCall(engine, 'setNowPlaying')).toEqual([
      'setNowPlaying',
      { title: 'Tema t1', artist: 'Artista', albumTitle: 'Disco', artworkUrl: '/covers/c1' },
    ]);
  });

  it('aleatorio recarga la cola sin cortar la canción actual', () => {
    const { controller, engine } = setup();
    controller.playList(['t1', 't2', 't3', 't4'], 1);
    engine.status_.positionMs = 7000;
    controller.setShuffle(true);
    const load = lastCall(engine, 'load')!;
    expect((load[1] as string[])[load[2] as number]).toBe('/music/t2.mp3');
    expect(load[3]).toBe(7000);
    expect(controller.getSnapshot().current?.id).toBe('t2');
  });

  it('getSnapshot es estable entre cambios', () => {
    const { controller } = setup();
    controller.playList(['t1'], 0);
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
  });

  it('avisa a los suscriptores', () => {
    const { controller } = setup();
    let n = 0;
    const off = controller.subscribe(() => n++);
    controller.playList(['t1'], 0);
    off();
    controller.next();
    expect(n).toBeGreaterThan(0);
    expect(controller.currentTrackId()).toBe('t1');
  });
});
