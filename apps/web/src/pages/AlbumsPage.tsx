import { Link, useSearchParams } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { Cover } from '../components/Cover.tsx';
import { LibraryTabs } from '../components/LibraryTabs.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

/** Chips de artista que entran sin amontonarse; el resto se encuentra en la pestaña Artistas. */
const MAX_CHIPS = 6;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AlbumsPage() {
  const { data, isPending, error } = useCatalog();
  const [params] = useSearchParams();
  const artist = params.get('artista');

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const albums = artist ? data.albums.filter((a) => a.artist === artist) : data.albums;

  const counts = new Map<string, number>();
  for (const a of data.albums) counts.set(a.artist, (counts.get(a.artist) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_CHIPS);
  if (artist && !top.some(([name]) => name === artist)) top.push([artist, counts.get(artist) ?? 0]);

  return (
    <>
      <PageHeader
        title={artist ?? 'Biblioteca'}
        subtitle={`${plural(albums.length, 'álbum', 'álbumes')} · ${plural(
          artist ? albums.reduce((n, a) => n + a.trackIds.length, 0) : data.tracks.length,
          'canción',
          'canciones',
        )}`}
      />
      <LibraryTabs>
        {counts.size > 1 && (
          <div className="chips" role="group" aria-label="Filtrar por artista">
            <Link to="/biblioteca/albumes" className={artist ? 'chip' : 'chip active'}>
              Todos <span>{data.albums.length}</span>
            </Link>
            {top.map(([name, n]) => (
              <Link
                key={name}
                to={`/biblioteca/albumes?${new URLSearchParams({ artista: name }).toString()}`}
                className={name === artist ? 'chip active' : 'chip'}
              >
                {name} <span>{n}</span>
              </Link>
            ))}
          </div>
        )}
      </LibraryTabs>
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
              <div className="muted">{[a.artist, a.year].filter(Boolean).join(' · ')}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
