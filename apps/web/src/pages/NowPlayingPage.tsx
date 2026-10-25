import { Link } from 'react-router';
import { requestAddToPlaylist } from '../components/addToPlaylist.ts';
import { HeartButton } from '../components/HeartButton.tsx';
import { Icon } from '../components/Icon.tsx';
import { Disc } from '../player/Disc.tsx';
import { Progress, Transport, Volume } from '../player/PlayerBar.tsx';
import { usePlayer } from '../player/PlayerContext.tsx';
import { QueuePanel } from '../player/QueuePanel.tsx';

export function NowPlayingPage() {
  const [snapshot, player] = usePlayer();
  const { track, album } = snapshot;

  if (!track) {
    return (
      <p className="empty">
        No está sonando nada. Elegí un álbum en la <Link to="/biblioteca/albumes">Biblioteca</Link>.
      </p>
    );
  }

  return (
    <div className="now-playing">
      <section className="stage" aria-label="Reproduciendo">
        {album && (
          <Link to={`/biblioteca/albumes/${album.id}`} className="back-link">
            <Icon name="volver" size={18} />
            Sonando desde <strong>{album.title}</strong>
          </Link>
        )}
        <Disc track={track} albumTitle={album?.title ?? ''} playing={snapshot.playing} size="large" />
        <div className="stage-info">
          <h1>{track.title}</h1>
          <p className="muted">{[track.artist, album?.title].filter(Boolean).join(' · ')}</p>
          <div className="stage-actions">
            <HeartButton track={track} size={24} />
            <button type="button" className="pill" onClick={() => requestAddToPlaylist([track.id])}>
              <Icon name="listas" size={18} />
              Agregar a lista
            </button>
          </div>
        </div>
        <Progress snapshot={snapshot} player={player} />
        <Transport snapshot={snapshot} player={player} large />
        <Volume snapshot={snapshot} player={player} />
      </section>
      <QueuePanel />
    </div>
  );
}
