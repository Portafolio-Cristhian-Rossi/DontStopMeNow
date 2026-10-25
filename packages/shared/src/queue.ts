export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Cola de reproducción. `order` es lo que suena; `original`, el mismo contenido sin mezclar (si el
 * aleatorio está apagado, son iguales). `nextCount` cuenta los "a continuación" agregados durante la
 * canción actual, para que queden en el orden en que se agregaron.
 */
export interface QueueState {
  order: string[];
  original: string[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  nextCount: number;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function currentId(q: QueueState): string | null {
  return q.order[q.index] ?? null;
}

export function createQueue(
  trackIds: string[],
  startIndex: number,
  opts: { shuffle: boolean; repeat: RepeatMode },
  random: () => number = Math.random,
): QueueState {
  const base = { original: [...trackIds], shuffle: opts.shuffle, repeat: opts.repeat, nextCount: 0 };
  if (!opts.shuffle || trackIds.length === 0) return { ...base, order: [...trackIds], index: startIndex };
  const chosen = trackIds[startIndex]!;
  const rest = trackIds.filter((_, i) => i !== startIndex);
  return { ...base, order: [chosen, ...shuffled(rest, random)], index: 0 };
}

/** Prende o apaga el aleatorio sin mover la canción actual. */
export function setShuffle(q: QueueState, on: boolean, random: () => number = Math.random): QueueState {
  if (on === q.shuffle) return q;
  if (on) {
    const order = [...q.order.slice(0, q.index + 1), ...shuffled(q.order.slice(q.index + 1), random)];
    return { ...q, order, shuffle: true };
  }
  const current = currentId(q);
  const index = current === null ? q.index : Math.max(0, q.original.indexOf(current));
  return { ...q, order: [...q.original], index, shuffle: false };
}

export function moveTo(q: QueueState, index: number): QueueState {
  return { ...q, index, nextCount: 0 };
}

/** "Reproducir a continuación": después de la actual y de los que ya se agregaron así. */
export function playNext(q: QueueState, trackId: string): QueueState {
  const at = q.index + 1 + q.nextCount;
  const order = [...q.order.slice(0, at), trackId, ...q.order.slice(at)];
  const current = currentId(q);
  const originalPos = current === null ? q.original.length : q.original.indexOf(current) + 1 + q.nextCount;
  const original = [...q.original.slice(0, originalPos), trackId, ...q.original.slice(originalPos)];
  return { ...q, order, original, nextCount: q.nextCount + 1 };
}

export function addToQueue(q: QueueState, trackId: string): QueueState {
  return { ...q, order: [...q.order, trackId], original: [...q.original, trackId] };
}

/** `original` sin mezclar con el mismo contenido que `order` (respeta repetidas). */
function originalFor(q: QueueState, order: string[]): string[] {
  if (!q.shuffle) return [...order];
  const left = new Map<string, number>();
  for (const id of order) left.set(id, (left.get(id) ?? 0) + 1);
  return q.original.filter((id) => {
    const n = left.get(id) ?? 0;
    if (n === 0) return false;
    left.set(id, n - 1);
    return true;
  });
}

/**
 * Quita la canción en `index`. Si era la actual, queda la siguiente (o la anterior si era la última);
 * sin canciones, `index = -1`.
 */
export function removeAt(q: QueueState, index: number): QueueState {
  if (index < 0 || index >= q.order.length) return q;
  const order = q.order.filter((_, i) => i !== index);
  const original = originalFor(q, order);
  if (order.length === 0) return { ...q, order, original, index: -1, nextCount: 0 };
  if (index === q.index)
    return { ...q, order, original, index: Math.min(index, order.length - 1), nextCount: 0 };
  const inNext = index > q.index && index <= q.index + q.nextCount;
  return {
    ...q,
    order,
    original,
    index: index < q.index ? q.index - 1 : q.index,
    nextCount: inNext ? q.nextCount - 1 : q.nextCount,
  };
}

/** Mueve una canción de `from` a `to` sin cambiar cuál está sonando. */
export function moveItem(q: QueueState, from: number, to: number): QueueState {
  const last = q.order.length - 1;
  if (from === to || from < 0 || to < 0 || from > last || to > last) return q;
  const order = [...q.order];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved!);
  let index = q.index;
  if (from === q.index) index = to;
  else if (from < q.index && to >= q.index) index--;
  else if (from > q.index && to <= q.index) index++;
  return { ...q, order, original: q.shuffle ? q.original : [...order], index, nextCount: 0 };
}

/** Saca todo lo que viene después de la canción actual. */
export function clearUpcoming(q: QueueState): QueueState {
  const order = q.order.slice(0, q.index + 1);
  return { ...q, order, original: originalFor(q, order), nextCount: 0 };
}

/**
 * Saca de la cola las canciones que ya no existen. Si la actual desaparece, queda la siguiente
 * existente (o la anterior si no hay siguiente); sin canciones, `index = -1`.
 */
export function removeMissing(q: QueueState, exists: (id: string) => boolean): QueueState {
  const order = q.order.filter(exists);
  const original = q.original.filter(exists);
  if (order.length === 0) return { ...q, order, original, index: -1, nextCount: 0 };
  const keptBefore = q.order.slice(0, q.index).filter(exists).length;
  const index = Math.min(keptBefore, order.length - 1);
  return { ...q, order, original, index };
}
