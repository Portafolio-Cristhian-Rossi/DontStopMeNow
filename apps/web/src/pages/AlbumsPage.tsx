import { Link, useSearchParams } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { Cover } from '../components/Cover.tsx';
import { LibraryTabs } from '../components/LibraryTabs.tsx';

export function AlbumsPage() {
  const { data, isPending, error } = useCatalog();
  const [params] = useSearchParams();
  const artist = params.get('artista');

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const albums = artist ? data.albums.filter((a) => a.artist === artist) : data.albums;

  return (
    <>
      <h1>{artist ?? 'Biblioteca'}</h1>
      <LibraryTabs />
      {data.albums.length === 0 ? (
        <p className="empty">
          Todavía no hay música. Agregá una carpeta en <Link to="/ajustes">Ajustes</Link>.
        </p>
      ) : (
        <div className="album-grid">
          {albums.map((a) => (
            <Link key={a.id} to={`/biblioteca/albumes/${a.id}`} className="album-card">
              <Cover coverId={a.coverId} title={a.title} />
              <div className="title">{a.title}</div>
              <div className="muted">{a.artist}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
