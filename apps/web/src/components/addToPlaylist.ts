type Listener = (trackIds: string[]) => void;
const listeners = new Set<Listener>();

/** Abre el diálogo "Agregar a lista" desde cualquier parte (una fila, la barra, Reproduciendo). */
export function requestAddToPlaylist(trackIds: string[]): void {
  for (const listener of listeners) listener(trackIds);
}

export function onAddToPlaylistRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
