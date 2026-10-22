import { useState } from 'react';
import { useCatalog } from '../api/queries.ts';
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog.tsx';
import { LibraryTabs } from '../components/LibraryTabs.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { searchKey } from '../lib/search.ts';

export function SongsPage() {
  const { data, isPending, error } = useCatalog();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const albums = new Map(data.albums.map((a) => [a.id, a]));
  const q = searchKey(query.trim());
  const tracks = q
    ? data.tracks.filter((t) =>
        searchKey(`${t.title} ${t.artist} ${albums.get(t.albumId)?.title ?? ''}`).includes(q),
      )
    : data.tracks;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <h1>Biblioteca</h1>
      <LibraryTabs />
      <div className="toolbar">
        <input
          type="search"
          role="searchbox"
          placeholder="Buscar por título, artista o álbum"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">{tracks.length} canciones</span>
        <button type="button" disabled={selected.size === 0} onClick={() => setAdding(true)}>
          Agregar a lista… {selected.size > 0 && `(${selected.size})`}
        </button>
      </div>
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {adding && (
        <AddToPlaylistDialog
          trackIds={[...selected]}
          onClose={(message) => {
            setAdding(false);
            if (message) {
              setNotice(message);
              setSelected(new Set());
            }
          }}
        />
      )}
      <TrackTable tracks={tracks} albums={albums} selectable selected={selected} onToggle={toggle} />
    </>
  );
}
