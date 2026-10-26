import { describe, expect, it } from 'vitest';
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
} from '../src/queue.ts';

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

  it('removeAt antes, en y después de la actual', () => {
    const q = createQueue(['a', 'b', 'c', 'd'], 2, plain);
    expect(removeAt(q, 0)).toMatchObject({ order: ['b', 'c', 'd'], original: ['b', 'c', 'd'], index: 1 });
    expect(removeAt(q, 3)).toMatchObject({ order: ['a', 'b', 'c'], index: 2 });
    expect(removeAt(q, 2)).toMatchObject({ order: ['a', 'b', 'd'], index: 2 });
    expect(removeAt(createQueue(['a', 'b'], 1, plain), 1)).toMatchObject({ order: ['a'], index: 0 });
    expect(removeAt(createQueue(['a'], 0, plain), 0)).toMatchObject({ order: [], index: -1 });
    expect(removeAt(q, 9)).toBe(q);
  });

  it('removeAt descuenta un "a continuación" quitado', () => {
    let q = playNext(playNext(createQueue(['a', 'b'], 0, plain), 'x'), 'y');
    q = removeAt(q, 1);
    expect(q.nextCount).toBe(1);
    expect(playNext(q, 'z').order).toEqual(['a', 'y', 'z', 'b']);
  });

  it('con aleatorio, quitar y después apagarlo no pierde ni duplica canciones', () => {
    let q = createQueue(['a', 'b', 'c', 'd', 'a'], 0, { shuffle: true, repeat: 'off' }, seq(0.3, 0.7, 0.1));
    const quitada = q.order[3]!;
    q = removeAt(q, 3);
    q = setShuffle(q, false);
    const esperado = ['a', 'b', 'c', 'd', 'a'];
    esperado.splice(esperado.indexOf(quitada, quitada === 'a' ? 1 : 0), 1);
    expect([...q.order].sort()).toEqual([...esperado].sort());
    expect(q.order).toHaveLength(4);
  });

  it('moveItem mantiene la canción que suena', () => {
    const q = createQueue(['a', 'b', 'c', 'd', 'e'], 2, plain);
    expect(moveItem(q, 4, 3)).toMatchObject({ order: ['a', 'b', 'c', 'e', 'd'], index: 2 });
    expect(moveItem(q, 0, 4)).toMatchObject({ order: ['b', 'c', 'd', 'e', 'a'], index: 1 });
    expect(moveItem(q, 4, 0)).toMatchObject({ order: ['e', 'a', 'b', 'c', 'd'], index: 3 });
    expect(moveItem(q, 2, 4)).toMatchObject({ order: ['a', 'b', 'd', 'e', 'c'], index: 4 });
    expect(moveItem(q, 1, 1)).toBe(q);
  });

  it('moveItem con aleatorio no toca el orden original', () => {
    const q = createQueue(['a', 'b', 'c'], 0, { shuffle: true, repeat: 'off' }, seq(0.5));
    const moved = moveItem(q, 1, 2);
    expect(moved.original).toEqual(['a', 'b', 'c']);
    expect(currentId(setShuffle(moved, false))).toBe('a');
  });

  it('clearUpcoming deja solo hasta la actual', () => {
    const q = playNext(createQueue(['a', 'b', 'c', 'd'], 1, plain), 'x');
    expect(clearUpcoming(q)).toMatchObject({
      order: ['a', 'b'],
      original: ['a', 'b'],
      index: 1,
      nextCount: 0,
    });
    const s = createQueue(['a', 'b', 'c', 'd'], 0, { shuffle: true, repeat: 'off' }, seq(0.4));
    const cleared = setShuffle(clearUpcoming(s), false);
    expect(cleared.order).toEqual(['a']);
  });
});
