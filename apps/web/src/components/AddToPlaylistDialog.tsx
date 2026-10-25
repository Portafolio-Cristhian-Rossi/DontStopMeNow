import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import { queryKeys, useCatalog } from '../api/queries.ts';

interface Props {
  trackIds: string[];
  /** Se llama al cerrar; `message` describe lo que se hizo, si se hizo algo. */
  onClose(message?: string): void;
}

export function AddToPlaylistDialog({ trackIds, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data } = useCatalog();
  const [name, setName] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const manual = (data?.playlists ?? []).filter((p) => p.type === 'manual');

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const message = await action();
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      onClose(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function addTo(id: string) {
    const playlist = manual.find((p) => p.id === id);
    if (!playlist) return;
    const present = new Set(playlist.trackIds);
    const added = trackIds.filter((t) => !present.has(t));
    if (added.length === 0) {
      setInfo('Ya estaban todas en la lista');
      return;
    }
    void run(async () => {
      await api.updatePlaylist(id, { trackIds: [...playlist.trackIds, ...added] });
      return `Agregadas ${added.length} canciones a ${playlist.name}`;
    });
  }

  function create(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => {
      await api.createPlaylist({ type: 'manual', name: trimmed, trackIds });
      return `Creada la lista ${trimmed} con ${trackIds.length} canciones`;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="modal-backdrop" aria-hidden="true" onClick={() => onClose()} />
      <dialog open className="modal" aria-labelledby="add-to-playlist-title">
        <h2 id="add-to-playlist-title">
          {trackIds.length === 1 ? 'Agregar 1 canción a…' : `Agregar ${trackIds.length} canciones a…`}
        </h2>
        {manual.length > 0 && (
          <ul className="list-plain">
            {manual.map((p) => (
              <li key={p.id}>
                <button type="button" disabled={busy} onClick={() => addTo(p.id)}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="toolbar" onSubmit={create}>
          <input
            type="text"
            aria-label="Nueva lista"
            placeholder="Nueva lista"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            Crear
          </button>
        </form>
        {info && <p className="muted">{info}</p>}
        {error && <p className="error">{error}</p>}
        <div className="toolbar">
          <button type="button" onClick={() => onClose()}>
            Cancelar
          </button>
        </div>
      </dialog>
    </>
  );
}
