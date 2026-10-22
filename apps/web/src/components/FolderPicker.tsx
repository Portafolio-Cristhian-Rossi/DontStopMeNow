import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.ts';
import { useRoots } from '../api/queries.ts';

interface Props {
  onPick(rootId: number, relPath: string): void;
  disabled?: boolean;
}

/** Ruta legible: usa el separador de la raíz (\ en Windows). */
export function displayPath(rootPath: string, relPath: string): string {
  if (!relPath) return rootPath;
  const sep = rootPath.includes('\\') ? '\\' : '/';
  const base = rootPath.endsWith(sep) ? rootPath.slice(0, -1) : rootPath;
  return [base, ...relPath.split('/')].join(sep);
}

export function FolderPicker({ onPick, disabled }: Props) {
  const roots = useRoots();
  const online = (roots.data ?? []).filter((r) => r.status === 'online');
  const [chosenRoot, setChosenRoot] = useState<number | null>(null);
  const [path, setPath] = useState('');
  const rootId = chosenRoot ?? online[0]?.id ?? null;
  const root = online.find((r) => r.id === rootId);

  const listing = useQuery({
    queryKey: ['browse', rootId, path],
    queryFn: () => api.browse(rootId!, path),
    enabled: rootId !== null,
  });

  if (roots.isPending) return <p className="muted">Cargando carpetas…</p>;
  if (!root) return <p className="muted">No hay carpetas de música conectadas. Agregá una en Ajustes.</p>;

  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

  return (
    <div className="card">
      {online.length > 1 && (
        <select
          aria-label="Carpeta raíz"
          value={root.id}
          onChange={(e) => {
            setChosenRoot(Number(e.target.value));
            setPath('');
          }}
        >
          {online.map((r) => (
            <option key={r.id} value={r.id}>
              {r.path}
            </option>
          ))}
        </select>
      )}
      <p>
        <strong>{displayPath(root.path, path)}</strong>
      </p>
      <ul className="list-plain">
        {path && (
          <li>
            <button type="button" className="small" onClick={() => setPath(parent)}>
              ↑ Subir un nivel
            </button>
          </li>
        )}
        {listing.data?.folders.map((f) => (
          <li key={f}>
            <button type="button" className="small" onClick={() => setPath(path ? `${path}/${f}` : f)}>
              {f}
            </button>
          </li>
        ))}
        {listing.data?.folders.length === 0 && <li className="muted">Sin subcarpetas</li>}
      </ul>
      {listing.error && <p className="error">{listing.error.message}</p>}
      <button type="button" className="primary" disabled={disabled} onClick={() => onPick(root.id, path)}>
        Usar esta carpeta
      </button>
    </div>
  );
}
