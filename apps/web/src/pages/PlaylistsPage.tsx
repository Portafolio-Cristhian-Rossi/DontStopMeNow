import type { Album, Catalog, Playlist } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.ts';
import { queryKeys, useCatalog } from '../api/queries.ts';
import { Cover } from '../components/Cover.tsx';
import { FolderPicker } from '../components/FolderPicker.tsx';
import { Icon } from '../components/Icon.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { favoriteTracks } from './FavoritesPage.tsx';

/** Hasta cuatro álbumes distintos de la lista, para armar el mosaico de la tarjeta. */
function mosaic(playlist: Playlist, catalog: Catalog): Album[] {
  const albums = new Map(catalog.albums.map((a) => [a.id, a]));
  const tracks = new Map(catalog.tracks.map((t) => [t.id, t]));
  const seen = new Map<string, Album>();
  for (const id of playlist.trackIds) {
    const album = albums.get(tracks.get(id)?.albumId ?? '');
    if (album) seen.set(album.id, album);
    if (seen.size === 4) break;
  }
  return [...seen.values()];
}

export function PlaylistsPage() {
  const { data, isPending, error } = useCatalog();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean | null>(null);
  const [kind, setKind] = useState<'manual' | 'folder'>('manual');
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
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

  // Sin listas, el formulario arranca abierto: es lo único que se puede hacer acá.
  const showForm = open ?? data.playlists.length === 0;
  const favorites = favoriteTracks(data).length;

  return (
    <>
      <PageHeader title="Listas" subtitle="Tus listas. Las podés marcar para bajarlas al celular.">
        <button type="button" className="primary" onClick={() => setOpen(!showForm)}>
          <Icon name="mas" size={18} />
          Nueva lista
        </button>
      </PageHeader>

      {showForm && (
        <section className="panel" aria-labelledby="nueva-lista">
          <h2 id="nueva-lista">Nueva lista</h2>
          <fieldset className="kind-options">
            <legend>¿Qué canciones lleva?</legend>
            <label className="kind-option">
              <input
                type="radio"
                name="tipo"
                checked={kind === 'manual'}
                onChange={() => setKind('manual')}
              />
              <span>
                Elijo las canciones
                <small>Agregás canciones desde la Biblioteca o desde un álbum.</small>
              </span>
            </label>
            <label className="kind-option">
              <input
                type="radio"
                name="tipo"
                checked={kind === 'folder'}
                onChange={() => setKind('folder')}
              />
              <span>
                Desde una carpeta
                <small>Incluye todo lo que haya en la carpeta elegida y se actualiza sola.</small>
              </span>
            </label>
          </fieldset>
          {kind === 'manual' ? (
            <form className="toolbar" onSubmit={createManual}>
              <input
                type="text"
                className="wide"
                aria-label="Nombre de la lista nueva"
                placeholder="Nombre de la lista nueva"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="primary" disabled={!name.trim()}>
                Crear lista
              </button>
            </form>
          ) : (
            <>
              <div className="toolbar">
                <input
                  type="text"
                  className="wide"
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
            </>
          )}
          {actionError && <p className="error">{actionError}</p>}
        </section>
      )}

      <ul className="list-plain playlist-grid">
        <li style={{ padding: 0 }}>
          <Link to="/listas/favoritas" className="playlist-card">
            <span className="playlist-art favorites-art">
              <Icon name="corazon" size={56} filled />
            </span>
            <span>
              <strong className="ellipsis" style={{ display: 'block' }}>
                Favoritas
              </strong>
              <span className="muted">
                Se arma sola con el corazón · {favorites} {favorites === 1 ? 'canción' : 'canciones'}
              </span>
            </span>
          </Link>
        </li>
        {data.playlists.map((p) => {
          const covers = mosaic(p, data);
          return (
            <li key={p.id} style={{ padding: 0 }}>
              <Link to={`/listas/${p.id}`} className="playlist-card">
                {p.type === 'folder' || covers.length === 0 ? (
                  <span className="playlist-art">
                    <Icon name={p.type === 'folder' ? 'carpeta' : 'listas'} size={44} />
                  </span>
                ) : (
                  <span className="playlist-art mosaic">
                    {[0, 1, 2, 3].map((i) => {
                      const album = covers[i % covers.length]!;
                      return <Cover key={i} coverId={album.coverId} title={album.title} />;
                    })}
                  </span>
                )}
                <span>
                  <strong className="ellipsis" style={{ display: 'block' }}>
                    {p.name}
                  </strong>
                  <span className="muted">
                    {p.type === 'manual' ? 'Manual' : 'Carpeta'} · {p.trackIds.length} canciones
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {data.playlists.length === 0 && <p className="muted">Todavía no hay listas.</p>}
    </>
  );
}
