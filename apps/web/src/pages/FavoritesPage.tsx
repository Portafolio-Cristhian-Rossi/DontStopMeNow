import type { Catalog, Track } from '@dsmn/shared';
import { Link } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { Icon } from '../components/Icon.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useCurrentTrackId, usePlayerActions } from '../player/PlayerContext.tsx';

/** Las favoritas, la última marcada primero; una sola vez por huella aunque haya copias. */
export function favoriteTracks(catalog: Catalog): Track[] {
  const seen = new Set<string>();
  return catalog.tracks
    .filter((t) => t.favoritedAt)
    .sort((a, b) => b.favoritedAt! - a.favoritedAt!)
    .filter((t) => !seen.has(t.fingerprint) && seen.add(t.fingerprint));
}

export function FavoritesPage() {
  const { data, isPending, error } = useCatalog();
  const player = usePlayerActions();
  const currentId = useCurrentTrackId();

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const tracks = favoriteTracks(data);
  const ids = tracks.map((t) => t.id);
  const albums = new Map(data.albums.map((a) => [a.id, a]));

  return (
    <>
      <Link to="/listas" className="back-link">
        <Icon name="volver" size={18} />
        Listas
      </Link>
      <PageHeader
        title="Favoritas"
        subtitle={`Se arma sola con lo que marcás con el corazón · ${tracks.length} ${
          tracks.length === 1 ? 'canción' : 'canciones'
        }`}
      />
      {tracks.length === 0 ? (
        <p className="empty">
          Todavía no marcaste ninguna. Tocá el corazón de una canción en un álbum, en una lista o en el
          reproductor.
        </p>
      ) : (
        <>
          <div className="toolbar">
            <button
              type="button"
              className="primary pill"
              onClick={() => player.playList(ids, 0, { shuffle: false })}
            >
              <Icon name="play" size={18} />
              Reproducir
            </button>
            <button type="button" className="pill" onClick={() => player.playList(ids, 0, { shuffle: true })}>
              <Icon name="aleatorio" size={18} />
              Aleatorio
            </button>
          </div>
          <TrackTable
            tracks={tracks}
            albums={albums}
            numbered
            onPlay={(index) => player.playList(ids, index)}
            currentId={currentId}
          />
        </>
      )}
    </>
  );
}
