import { Link } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { initials } from '../components/Cover.tsx';
import { LibraryTabs } from '../components/LibraryTabs.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function ArtistsPage() {
  const { data, isPending, error } = useCatalog();

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const counts = new Map<string, number>();
  for (const a of data.albums) counts.set(a.artist, (counts.get(a.artist) ?? 0) + 1);
  const artists = [...counts].sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  return (
    <>
      <PageHeader
        title="Biblioteca"
        subtitle={`${artists.length} ${artists.length === 1 ? 'artista' : 'artistas'}`}
      />
      <LibraryTabs />
      <ul className="list-plain artist-list">
        {artists.map(([name, n]) => (
          <li key={name}>
            <Link to={`/biblioteca/albumes?${new URLSearchParams({ artista: name }).toString()}`}>
              <span className="avatar" aria-hidden="true">
                {initials(name)}
              </span>
              <span>
                <strong className="ellipsis">{name}</strong>
                <span className="muted">{n === 1 ? '1 álbum' : `${n} álbumes`}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
