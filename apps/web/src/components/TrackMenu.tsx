import type { Track } from '@dsmn/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { usePlayerActions } from '../player/PlayerContext.tsx';
import { requestAddToPlaylist } from './addToPlaylist.ts';
import { Icon, type IconName } from './Icon.tsx';
import { notify } from './Toast.tsx';

/** Alto aproximado del menú: si no entra debajo del botón, se abre hacia arriba. */
const MENU_HEIGHT = 240;

function Item({
  icon,
  disabled,
  onSelect,
  children,
}: {
  icon: IconName;
  disabled?: boolean;
  onSelect(): void;
  children: ReactNode;
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect}>
      <Icon name={icon} size={18} />
      {children}
    </button>
  );
}

/** Botón "⋯" de una canción: encolar, agregar a una lista o ir a su álbum. */
export function TrackMenu({ track, showAlbum = true }: { track: Track; showAlbum?: boolean }) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const player = usePlayerActions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function toggle() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setUpward(window.innerHeight - rect.bottom < MENU_HEIGHT);
    setOpen((v) => !v);
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function pick(action: () => void) {
    action();
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <span className="track-menu">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={`Más opciones para ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="opciones" size={18} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={upward ? 'menu menu-up' : 'menu'}
          role="menu"
          aria-label={`Opciones para ${track.title}`}
          onKeyDown={onKeyDown}
        >
          <Item
            icon="aContinuacion"
            disabled={!track.available}
            onSelect={() =>
              pick(() => {
                player.playNext(track.id);
                notify(`Suena a continuación: ${track.title}`);
              })
            }
          >
            Reproducir a continuación
          </Item>
          <Item
            icon="cola"
            disabled={!track.available}
            onSelect={() =>
              pick(() => {
                player.addToQueue(track.id);
                notify(`Agregada a la cola: ${track.title}`);
              })
            }
          >
            Agregar a la cola
          </Item>
          <Item icon="listas" onSelect={() => pick(() => requestAddToPlaylist([track.id]))}>
            Agregar a lista…
          </Item>
          {showAlbum && (
            <Item
              icon="biblioteca"
              onSelect={() => pick(() => navigate(`/biblioteca/albumes/${track.albumId}`))}
            >
              Ir al álbum
            </Item>
          )}
        </div>
      )}
    </span>
  );
}
