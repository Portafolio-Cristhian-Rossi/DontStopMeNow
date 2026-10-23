import { describe, expect, it } from 'vitest';
import {
  addToQueue,
  createQueue,
  currentId,
  moveTo,
  playNext,
  removeMissing,
  setShuffle,
} from '../src/core/player/queue.ts';

/** Generador "aleatorio" determinista. */
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const plain = { shuffle: false, repeat: 'off' as const };

describe('cola', () => {
  it('createQueue sin aleatorio respeta el orden y el inicio', () => {
    expect(createQueue(['a', 'b', 'c'], 1, plain)).toMatchObject({
      order: ['a', 'b', 'c'],
      original: ['a', 'b', 'c'],
      index: 1,
    });
  });

  it('createQueue con aleatorio pone primero la elegida', () => {
    const q = createQueue(['a', 'b', 'c', 'd'], 2, { shuffle: true, repeat: 'off' }, seq(0.1, 0.9, 0.5, 0.3));
    expect(q.order[0]).toBe('c');
    expect(q.index).toBe(0);
    expect([...q.order].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(q.original).toEqual(['a', 'b', 'c', 'd']);
  });

  it('activar y desactivar aleatorio no mueve la actual', () => {
    let q = createQueue(['a', 'b', 'c', 'd', 'e'], 2, plain);
    q = setShuffle(q, true, seq(0.1, 0.9, 0.5, 0.3));
    expect(currentId(q)).toBe('c');
    expect(q.index).toBe(2);
    expect(q.order.slice(0, 2)).toEqual(['a', 'b']);
    expect([...q.order.slice(3)].sort()).toEqual(['d', 'e']);
    q = setShuffle(q, false);
    expect(q).toMatchObject({ order: ['a', 'b', 'c', 'd', 'e'], index: 2, shuffle: false });
  });

  it('desactivar aleatorio después de avanzar ubica la actual en el orden original', () => {
    let q = createQueue(['a', 'b', 'c', 'd'], 0, { shuffle: true, repeat: 'off' }, seq(0.99, 0.99, 0.99));
    q = moveTo(q, 2);
    const playing = currentId(q);
    q = setShuffle(q, false);
    expect(currentId(q)).toBe(playing);
    expect(q.order).toEqual(['a', 'b', 'c', 'd']);
  });

  it('varios "a continuación" quedan en el orden en que se agregaron', () => {
    let q = createQueue(['a', 'b', 'c'], 0, plain);
    q = playNext(playNext(q, 'x'), 'y');
    expect(q.order).toEqual(['a', 'x', 'y', 'b', 'c']);
    expect(q.original).toEqual(['a', 'x', 'y', 'b', 'c']);
  });

  it('"a continuación" se reinicia al cambiar de canción', () => {
    let q = createQueue(['a', 'b', 'c'], 0, plain);
    q = playNext(q, 'x');
    q = moveTo(q, 1);
    q = playNext(q, 'y');
    expect(q.order).toEqual(['a', 'x', 'y', 'b', 'c']);
  });

  it('agregar a la cola va al final', () => {
    const q = addToQueue(createQueue(['a', 'b'], 0, plain), 'z');
    expect(q.order).toEqual(['a', 'b', 'z']);
    expect(q.original).toEqual(['a', 'b', 'z']);
  });

  it('removeMissing ajusta el índice', () => {
    const q = createQueue(['a', 'b', 'c', 'd'], 2, plain);
    expect(removeMissing(q, (id) => id !== 'a')).toMatchObject({ order: ['b', 'c', 'd'], index: 1 });
    expect(removeMissing(q, (id) => id !== 'c')).toMatchObject({ order: ['a', 'b', 'd'], index: 2 });
    expect(removeMissing(q, () => false)).toMatchObject({ order: [], index: -1 });
    expect(currentId(removeMissing(q, () => false))).toBeNull();
  });

  it('removeMissing con la actual al final pasa a la anterior existente si no hay siguiente', () => {
    const q = createQueue(['a', 'b', 'c'], 2, plain);
    expect(removeMissing(q, (id) => id !== 'c')).toMatchObject({ order: ['a', 'b'], index: 1 });
  });
});
