import { useParams } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { Cover } from '../components/Cover.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { formatDuration } from '../lib/format.ts';

export function AlbumPage() {
  const { id } = useParams();
  const { data, isPending, error } = useCatalog();

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const album = data.albums.find((a) => a.id === id);
  if (!album) return <p className="empty">Álbum no encontrado</p>;

  const byId = new Map(data.tracks.map((t) => [t.id, t]));
  const tracks = album.trackIds.flatMap((tid) => byId.get(tid) ?? []);
  const total = tracks.reduce((sum, t) => sum + t.durationMs, 0);
  const details = [album.artist, album.year, `${tracks.length} canciones`, formatDuration(total)].filter(
    Boolean,
  );

  return (
    <>
      <div className="album-header">
        <Cover coverId={album.coverId} title={album.title} />
        <div>
          <h1>{album.title}</h1>
          <p className="muted">{details.join(' · ')}</p>
        </div>
      </div>
      <TrackTable tracks={tracks} albums={new Map([[album.id, album]])} />
    </>
  );
}
