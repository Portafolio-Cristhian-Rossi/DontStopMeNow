import type { Album, Track } from '@dsmn/shared';
import { memo, type ReactNode } from 'react';
import { formatDuration } from '@dsmn/shared';
import { Icon } from './Icon.tsx';

interface Props {
  tracks: Track[];
  albums: Map<string, Album>;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?(id: string): void;
  actions?(track: Track, index: number): ReactNode;
  /** Numerar por posición en la lista en lugar de por número de pista. */
  numbered?: boolean;
  /** Reproducir desde la canción en `index` (muestra el botón de play en cada fila). */
  onPlay?(index: number): void;
  /** La canción que está sonando, para resaltarla. */
  currentId?: string | null;
}

/** Celda del título: el botón de play (si hay), el título cortado con "…" y si no está disponible. */
export function TitleCell({
  track: t,
  playing,
  onPlay,
}: {
  track: Track;
  playing: boolean;
  onPlay?: () => void;
}) {
  return (
    <td className="title" title={t.title}>
      <span className="title-cell">
        {onPlay && t.available && (
          <button type="button" className="row-play" aria-label={`Reproducir ${t.title}`} onClick={onPlay}>
            <Icon name="play" size={16} />
          </button>
        )}
        {playing && (
          <span className="eq" aria-label="Sonando">
            <span />
            <span />
            <span />
          </span>
        )}
        <span className="title-text">
          {t.title}
          {!t.available && (
            <span className="muted">
              {' '}
              · <span>no disponible</span>
            </span>
          )}
        </span>
      </span>
    </td>
  );
}

interface RowProps {
  track: Track;
  index: number;
  albumTitle: string;
  selectable?: boolean;
  checked: boolean;
  onToggle?(id: string): void;
  numbered?: boolean;
  actions?: ReactNode;
  hasActions: boolean;
  playing: boolean;
  onPlay?(index: number): void;
}

const TrackRow = memo(function TrackRow({
  track: t,
  index,
  albumTitle,
  selectable,
  checked,
  onToggle,
  numbered,
  actions,
  hasActions,
  playing,
  onPlay,
}: RowProps) {
  const classes = [t.available ? '' : 'unavailable', playing ? 'playing' : ''].filter(Boolean).join(' ');
  return (
    <tr className={classes || undefined}>
      <td className="num">
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`Seleccionar ${t.title}`}
            checked={checked}
            onChange={() => onToggle?.(t.id)}
          />
        ) : numbered ? (
          index + 1
        ) : (
          (t.trackNo ?? '')
        )}
      </td>
      <TitleCell track={t} playing={playing} onPlay={onPlay && (() => onPlay(index))} />
      <td className="secondary">{t.artist}</td>
      <td className="secondary">{albumTitle}</td>
      <td className="time">{formatDuration(t.durationMs)}</td>
      {hasActions && <td>{actions}</td>}
    </tr>
  );
});

export function TrackTable({
  tracks,
  albums,
  selectable,
  selected,
  onToggle,
  actions,
  numbered,
  onPlay,
  currentId,
}: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Título</th>
          <th>Artista</th>
          <th>Álbum</th>
          <th style={{ textAlign: 'right' }}>Duración</th>
          {actions && <th aria-label="Acciones" />}
        </tr>
      </thead>
      <tbody>
        {tracks.map((t, i) => (
          <TrackRow
            key={`${i}-${t.id}`}
            track={t}
            index={i}
            albumTitle={albums.get(t.albumId)?.title ?? ''}
            selectable={selectable}
            checked={selected?.has(t.id) ?? false}
            onToggle={onToggle}
            numbered={numbered}
            actions={actions?.(t, i)}
            hasActions={Boolean(actions)}
            playing={t.id === currentId}
            onPlay={onPlay}
          />
        ))}
      </tbody>
    </table>
  );
}
