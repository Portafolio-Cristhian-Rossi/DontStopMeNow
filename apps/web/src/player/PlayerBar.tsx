import { formatDuration, type RepeatMode } from '@dsmn/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Icon } from '../components/Icon.tsx';
import { Disc } from './Disc.tsx';
import { usePlayer } from './PlayerContext.tsx';
import type { Player, PlayerSnapshot } from './player.ts';

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
export const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repetir: no',
  all: 'Repetir: todo',
  one: 'Repetir: una',
};

/** Aleatorio, anterior, play/pausa, siguiente y repetir; los usa la barra y la pantalla Reproduciendo. */
export function Transport({
  snapshot,
  player,
  large = false,
}: {
  snapshot: PlayerSnapshot;
  player: Player;
  large?: boolean;
}) {
  const repeat = snapshot.queue?.repeat ?? 'off';
  const shuffle = snapshot.queue?.shuffle ?? false;
  const size = large ? 24 : 18;
  return (
    <div className={large ? 'transport transport-large' : 'transport'}>
      <button
        type="button"
        className={shuffle ? 'icon-button on' : 'icon-button'}
        aria-pressed={shuffle}
        aria-label="Aleatorio"
        onClick={() => player.setShuffle(!shuffle)}
      >
        <Icon name="aleatorio" size={size} />
      </button>
      <button type="button" className="icon-button" aria-label="Anterior" onClick={() => player.previous()}>
        <Icon name="anterior" size={size + 2} />
      </button>
      <button
        type="button"
        className="play-button"
        aria-label={snapshot.playing ? 'Pausa' : 'Reproducir'}
        onClick={() => player.toggle()}
      >
        <Icon name={snapshot.playing ? 'pausa' : 'play'} size={large ? 30 : 18} />
      </button>
      <button type="button" className="icon-button" aria-label="Siguiente" onClick={() => player.next()}>
        <Icon name="siguiente" size={size + 2} />
      </button>
      <button
        type="button"
        className={repeat === 'off' ? 'icon-button' : 'icon-button on'}
        aria-label={REPEAT_LABEL[repeat]}
        onClick={() => player.setRepeat(NEXT_REPEAT[repeat])}
      >
        <Icon name="repetir" size={size} />
        {repeat === 'one' && <span className="repeat-one">1</span>}
      </button>
    </div>
  );
}

/** Barra de progreso que se puede arrastrar, con los tiempos a los costados. */
export function Progress({ snapshot, player }: { snapshot: PlayerSnapshot; player: Player }) {
  const duration = Math.max(snapshot.durationMs, snapshot.positionMs);
  return (
    <div className="progress">
      <span>{formatDuration(snapshot.positionMs)}</span>
      <input
        type="range"
        aria-label="Posición en la canción"
        min={0}
        max={duration || 1}
        step={1000}
        value={Math.min(snapshot.positionMs, duration)}
        onChange={(e) => player.seek(Number(e.target.value))}
        style={{ '--fill': `${duration ? (snapshot.positionMs / duration) * 100 : 0}%` } as CSSProperties}
      />
      <span>{formatDuration(duration)}</span>
    </div>
  );
}

export function Volume({ snapshot, player }: { snapshot: PlayerSnapshot; player: Player }) {
  return (
    <label className="volume">
      <button
        type="button"
        className="icon-button"
        aria-label={snapshot.volume === 0 ? 'Activar sonido' : 'Silenciar'}
        onClick={() => player.setVolume(snapshot.volume === 0 ? 1 : 0)}
      >
        <Icon name={snapshot.volume === 0 ? 'silencio' : 'volumen'} />
      </button>
      <input
        type="range"
        aria-label="Volumen"
        min={0}
        max={100}
        value={Math.round(snapshot.volume * 100)}
        onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
        style={{ '--fill': `${snapshot.volume * 100}%` } as CSSProperties}
      />
    </label>
  );
}

/** Barra fija abajo; solo aparece cuando hay algo en la cola. */
export function PlayerBar() {
  const [snapshot, player] = usePlayer();
  const { track, album } = snapshot;
  if (!track) return null;
  return (
    <div className="player-bar" role="region" aria-label="Reproductor">
      <Link to="/reproduciendo" className="player-now">
        <Disc track={track} albumTitle={album?.title ?? ''} playing={snapshot.playing} size="small" />
        <span>
          <strong className="ellipsis">{track.title}</strong>
          <span className="ellipsis muted">{[track.artist, album?.title].filter(Boolean).join(' · ')}</span>
        </span>
      </Link>
      <div className="player-center">
        <Transport snapshot={snapshot} player={player} />
        <Progress snapshot={snapshot} player={player} />
      </div>
      <div className="player-side">
        <Link to="/reproduciendo" className="icon-button" aria-label="Ver la cola">
          <Icon name="cola" />
        </Link>
        <Volume snapshot={snapshot} player={player} />
      </div>
    </div>
  );
}
