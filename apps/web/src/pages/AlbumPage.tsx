import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCatalog } from '../api/queries.ts';
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog.tsx';
import { Cover } from '../components/Cover.tsx';
import { Icon } from '../components/Icon.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useCurrentTrackId, usePlayerActions } from '../player/PlayerContext.tsx';
import { formatDuration } from '@dsmn/shared';

export function AlbumPage() {
  const { id } = useParams();
  const { data, isPending, error } = useCatalog();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const player = usePlayerActions();
  const currentId = useCurrentTrackId();

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const album = data.albums.find((a) => a.id === id);
  if (!album) return <p className="empty">Álbum no encontrado</p>;

  const byId = new Map(data.tracks.map((t) => [t.id, t]));
  const tracks = album.trackIds.flatMap((tid) => byId.get(tid) ?? []);
  const ids = tracks.map((t) => t.id);
  const total = tracks.reduce((sum, t) => sum + t.durationMs, 0);
  const details = [album.artist, album.year, `${tracks.length} canciones`, formatDuration(total)].filter(
    Boolean,
  );

  return (
    <>
      <Link to="/biblioteca/albumes" className="back-link">
        <Icon name="volver" size={18} />
        Biblioteca
      </Link>
      <div className="album-header">
        <Cover coverId={album.coverId} title={album.title} />
        <div>
          <span className="eyebrow">Álbum</span>
          <h1>{album.title}</h1>
          <p>{details.join(' · ')}</p>
          <div className="toolbar" style={{ margin: '6px 0 0' }}>
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
            <button type="button" className="pill" onClick={() => setAdding(true)}>
              <Icon name="mas" size={18} />
              Agregar a lista…
            </button>
          </div>
        </div>
      </div>
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {adding && (
        <AddToPlaylistDialog
          trackIds={tracks.map((t) => t.id)}
          onClose={(message) => {
            setAdding(false);
            if (message) setNotice(message);
          }}
        />
      )}
      <TrackTable
        tracks={tracks}
        albums={new Map([[album.id, album]])}
        onPlay={(index) => player.playList(ids, index)}
        currentId={currentId}
        showAlbum={false}
      />
    </>
  );
}
