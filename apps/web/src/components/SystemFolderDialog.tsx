import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.ts';

interface Props {
  /** Se llama con la ruta absoluta elegida. */
  onPick(path: string): void;
  onClose(): void;
  busy?: boolean;
  /** Error al usar la carpeta (por ejemplo, se superpone con otra raíz). */
  error?: string | null;
}

/** Explorador de las carpetas de la compu para elegir una raíz nueva. */
export function SystemFolderDialog({ onPick, onClose, busy, error }: Props) {
  const places = useQuery({ queryKey: ['fs-places'], queryFn: api.fsPlaces });
  const [chosen, setChosen] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const path = chosen ?? places.data?.[0]?.path ?? null;

  const listing = useQuery({
    queryKey: ['fs', path],
    queryFn: () => api.fsBrowse(path!),
    enabled: path !== null,
  });

  const data = listing.data;

  function go(next: string) {
    setPrevious(path);
    setChosen(next);
  }

  return (
    <dialog open aria-labelledby="system-folder-title" className="folder-dialog">
      <h2 id="system-folder-title">Elegí la carpeta de música</h2>
      <div className="toolbar" aria-label="Accesos rápidos">
        {places.data?.map((p) => (
          <button
            type="button"
            key={p.path}
            className={`small${p.path === path ? ' active' : ''}`}
            onClick={() => go(p.path)}
          >
            {p.name}
          </button>
        ))}
      </div>
      {places.error && <p className="error">{places.error.message}</p>}

      {path !== null && (
        <>
          <p className="folder-current">
            <strong>{data?.path ?? path}</strong>
          </p>
          <ul className="list-plain folder-list">
            {data?.parent && (
              <li>
                <button type="button" className="folder-row" onClick={() => go(data.parent!)}>
                  ↑ Subir un nivel
                </button>
              </li>
            )}
            {listing.error && previous !== null && (
              <li>
                <button type="button" className="folder-row" onClick={() => go(previous)}>
                  ← Volver
                </button>
              </li>
            )}
            {data?.folders.map((f) => (
              <li key={f.path}>
                <button type="button" className="folder-row" onClick={() => go(f.path)}>
                  📁 {f.name}
                </button>
              </li>
            ))}
            {listing.isPending && <li className="muted">Cargando…</li>}
            {data?.folders.length === 0 && <li className="muted">Sin subcarpetas</li>}
          </ul>
          {listing.error && <p className="error">{listing.error.message}</p>}
        </>
      )}

      {error && <p className="error">{error}</p>}
      <div className="toolbar folder-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !data}
          onClick={() => data && onPick(data.path)}
        >
          Usar esta carpeta
        </button>
      </div>
    </dialog>
  );
}
