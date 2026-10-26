import type { Track } from '@dsmn/shared';
import { coverUrl } from '../api/client.ts';
import { coverColors, initials } from '../components/Cover.tsx';

/**
 * La portada recortada como un disco. Sonando: quieto unos segundos, dos vueltas rápidas y repite
 * (`@keyframes girar` en styles.css); en pausa se congela donde esté.
 */
export function Disc({
  track,
  albumTitle,
  playing,
  size,
}: {
  track: Track;
  albumTitle: string;
  playing: boolean;
  size: 'small' | 'large';
}) {
  const fallback = coverColors(albumTitle || track.title);
  return (
    <span
      className={`disc disc-${size}`}
      role={size === 'large' ? 'img' : undefined}
      aria-label={size === 'large' ? `Portada de ${albumTitle || track.title}` : undefined}
      aria-hidden={size === 'small' ? true : undefined}
      style={{ animationPlayState: playing ? 'running' : 'paused', ...(track.coverId ? {} : fallback) }}
    >
      {track.coverId ? (
        <img src={coverUrl(track.coverId)} alt="" />
      ) : (
        <span className="disc-initials">{initials(albumTitle || track.title)}</span>
      )}
      <span className="disc-grooves" />
      <span className="disc-label" />
      <span className="disc-hole" />
    </span>
  );
}
