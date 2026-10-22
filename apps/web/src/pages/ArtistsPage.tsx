import { Link } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { LibraryTabs } from '../components/LibraryTabs.tsx';

export function ArtistsPage() {
  const { data, isPending, error } = useCatalog();

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const counts = new Map<string, number>();
  for (const a of data.albums) counts.set(a.artist, (counts.get(a.artist) ?? 0) + 1);
  const artists = [...counts].sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  return (
    <>
      <h1>Biblioteca</h1>
      <LibraryTabs />
      <ul className="list-plain">
        {artists.map(([name, n]) => (
          <li key={name}>
            <Link to={`/biblioteca/albumes?${new URLSearchParams({ artista: name }).toString()}`}>
              <strong>{name}</strong> <span className="muted">· {n === 1 ? '1 álbum' : `${n} álbumes`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
