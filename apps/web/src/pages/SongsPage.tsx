import { useState } from 'react';
import { useCatalog } from '../api/queries.ts';
import { LibraryTabs } from '../components/LibraryTabs.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { searchKey } from '../lib/search.ts';

export function SongsPage() {
  const { data, isPending, error } = useCatalog();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      </div>
      <TrackTable tracks={tracks} albums={albums} selectable selected={selected} onToggle={toggle} />
    </>
  );
}
