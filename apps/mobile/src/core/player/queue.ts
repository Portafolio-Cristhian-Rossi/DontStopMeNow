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
