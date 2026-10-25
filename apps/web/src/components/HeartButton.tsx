import type { Track } from '@dsmn/shared';
import { useToggleFavorite } from '../api/favorites.ts';
import { Icon } from './Icon.tsx';

/** Corazón para marcar o desmarcar una canción como favorita. */
export function HeartButton({ track, size = 18 }: { track: Track; size?: number }) {
  const toggle = useToggleFavorite();
  const on = Boolean(track.favoritedAt);
  return (
    <button
      type="button"
      className={on ? 'icon-button heart on' : 'icon-button heart'}
      aria-pressed={on}
      aria-label={on ? `Quitar ${track.title} de favoritas` : `Agregar ${track.title} a favoritas`}
      onClick={() => void toggle(track)}
    >
      <Icon name="corazon" size={size} filled={on} />
    </button>
  );
}
