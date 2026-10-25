import type { Album, Track } from '@dsmn/shared';
import { memo, type ReactNode } from 'react';
import { formatDuration } from '@dsmn/shared';

interface Props {
  tracks: Track[];
  albums: Map<string, Album>;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?(id: string): void;
  actions?(track: Track, index: number): ReactNode;
  /** Numerar por posición en la lista en lugar de por número de pista. */
  numbered?: boolean;
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
}: RowProps) {
  return (
    <tr className={t.available ? undefined : 'unavailable'}>
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
      <td className="title" title={t.title}>
        <span>
          {t.title}
          {!t.available && (
            <span className="muted">
              {' '}
              · <span>no disponible</span>
            </span>
          )}
        </span>
      </td>
      <td className="secondary">{t.artist}</td>
      <td className="secondary">{albumTitle}</td>
      <td className="time">{formatDuration(t.durationMs)}</td>
      {hasActions && <td>{actions}</td>}
    </tr>
  );
});

export function TrackTable({ tracks, albums, selectable, selected, onToggle, actions, numbered }: Props) {
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
          />
        ))}
      </tbody>
    </table>
  );
}
