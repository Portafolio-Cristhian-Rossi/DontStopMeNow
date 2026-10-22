import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.ts';
import { queryKeys, useCatalog } from '../api/queries.ts';
import { FolderPicker } from '../components/FolderPicker.tsx';

export function PlaylistsPage() {
  const { data, isPending, error } = useCatalog();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [showFolder, setShowFolder] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function create(req: Parameters<typeof api.createPlaylist>[0]) {
    setActionError(null);
    try {
      const playlist = await api.createPlaylist(req);
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      navigate(`/listas/${playlist.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  function createManual(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) void create({ type: 'manual', name: name.trim() });
  }

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return (
    <>
      <h1>Listas</h1>
      <form className="toolbar" onSubmit={createManual}>
        <input
          type="text"
          aria-label="Nombre de la lista nueva"
          placeholder="Nombre de la lista nueva"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!name.trim()}>
          Crear lista
        </button>
        <button type="button" onClick={() => setShowFolder((v) => !v)}>
          Nueva lista de carpeta
        </button>
      </form>
      {showFolder && (
        <section>
          <h2>Nueva lista de carpeta</h2>
          <p className="muted">Incluye todo lo que haya en la carpeta elegida y se actualiza sola.</p>
          <div className="toolbar">
            <input
              type="text"
              aria-label="Nombre de la lista de carpeta"
              placeholder="Nombre de la lista"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </div>
          <FolderPicker
            disabled={!folderName.trim()}
            onPick={(rootId, relPath) =>
              void create({ type: 'folder', name: folderName.trim(), rootId, folderRelPath: relPath })
            }
          />
        </section>
      )}
      {actionError && <p className="error">{actionError}</p>}
      {data.playlists.length === 0 ? (
        <p className="empty">Todavía no hay listas.</p>
      ) : (
        <ul className="list-plain">
          {data.playlists.map((p) => (
            <li key={p.id}>
              <Link to={`/listas/${p.id}`}>
                <strong>{p.name}</strong>{' '}
                <span className="muted">
                  · {p.type === 'manual' ? 'Manual' : 'Carpeta'} · {p.trackIds.length} canciones
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
