import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useCatalog } from '../api/queries.ts';
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog.tsx';
import { LibraryTabs } from '../components/LibraryTabs.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { searchKey } from '../lib/search.ts';

/** Más filas que esto vuelven lenta la página; se pide refinar la búsqueda. */
const MAX_ROWS = 500;

export function SongsPage() {
  const { data, isPending, error } = useCatalog();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const albums = useMemo(() => new Map((data?.albums ?? []).map((a) => [a.id, a])), [data]);
  const keyed = useMemo(
    () =>
      (data?.tracks ?? []).map((t) => ({
        track: t,
        key: searchKey(`${t.title} ${t.artist} ${albums.get(t.albumId)?.title ?? ''}`),
      })),
    [data, albums],
  );
  const matches = useMemo(() => {
    const q = searchKey(deferredQuery.trim());
    return q ? keyed.filter((k) => k.key.includes(q)).map((k) => k.track) : keyed.map((k) => k.track);
  }, [keyed, deferredQuery]);

  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const shown = matches.slice(0, MAX_ROWS);

  return (
    <>
      <h1>Biblioteca</h1>
      <LibraryTabs />
      <div className="toolbar">
        <input
          type="search"
          role="searchbox"
          aria-label="Buscar canciones"
          placeholder="Buscar por título, artista o álbum"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">{matches.length} canciones</span>
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
      {matches.length > MAX_ROWS && (
        <p className="muted">
          Mostrando {MAX_ROWS} de {matches.length}. Refiná la búsqueda para ver el resto.
        </p>
      )}
      <TrackTable tracks={shown} albums={albums} selectable selected={selected} onToggle={toggle} />
    </>
  );
}
