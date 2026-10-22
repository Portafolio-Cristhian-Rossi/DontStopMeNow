import type { Album, Track } from '@dsmn/shared';
import type { ReactNode } from 'react';
import { formatDuration } from '../lib/format.ts';

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

export function TrackTable({ tracks, albums, selectable, selected, onToggle, actions, numbered }: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Título</th>
          <th>Artista</th>
          <th>Álbum</th>
          <th>Duración</th>
          {actions && <th aria-label="Acciones" />}
        </tr>
      </thead>
      <tbody>
        {tracks.map((t, i) => (
          <tr key={`${i}-${t.id}`} className={t.available ? undefined : 'unavailable'}>
            <td>
              {selectable ? (
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${t.title}`}
                  checked={selected?.has(t.id) ?? false}
                  onChange={() => onToggle?.(t.id)}
                />
              ) : numbered ? (
                i + 1
              ) : (
                (t.trackNo ?? '')
              )}
            </td>
            <td>
              {t.title}
              {!t.available && (
                <span className="muted">
                  {' '}
                  · <span>no disponible</span>
                </span>
              )}
            </td>
            <td>{t.artist}</td>
            <td>{albums.get(t.albumId)?.title ?? ''}</td>
            <td>{formatDuration(t.durationMs)}</td>
            {actions && <td>{actions(t, i)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
