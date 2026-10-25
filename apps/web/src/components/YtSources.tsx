import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.ts';
import { queryKeys, useRoots, useYtSources } from '../api/queries.ts';
import { displayPath } from './FolderPicker.tsx';

interface Props {
  /** "Buscar nuevas": la página muestra la previsualización de esa playlist. */
  onCheck(sourceId: number): void;
  busy?: boolean;
}

/** Sección "Tus playlists de YouTube": las playlists bajadas, para buscar lo nuevo u olvidarlas. */
export function YtSources({ onCheck, busy }: Props) {
  const sources = useYtSources();
  const roots = useRoots();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function forget(id: number, title: string) {
    if (!window.confirm(`Se deja de seguir ${title}. Los archivos y la lista no se borran.`)) return;
    setError(null);
    try {
      await api.forgetSource(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.ytSources });
  }

  const list = sources.data ?? [];

  return (
    <>
      <h2>Tus playlists de YouTube</h2>
      {error && <p className="error">{error}</p>}
      {list.length === 0 ? (
        <p className="muted">Todavía no bajaste ninguna playlist.</p>
      ) : (
        <ul className="list-plain">
          {list.map((s) => {
            const root = roots.data?.find((r) => r.id === s.rootId);
            const checked = s.lastCheckedAt
              ? `revisada ${new Date(s.lastCheckedAt).toLocaleString('es')}`
              : 'nunca revisada';
            return (
              <li key={s.id} className="source-row">
                <strong>{s.title}</strong>
                {root && <span className="muted">{displayPath(root.path, s.folder)}</span>}
                <span className="muted">{`${s.downloaded} canciones · ${checked}`}</span>
                <span className="queue-actions">
                  <button type="button" className="small" disabled={busy} onClick={() => onCheck(s.id)}>
                    Buscar nuevas
                  </button>
                  <button type="button" className="small danger" onClick={() => void forget(s.id, s.title)}>
                    Olvidar
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
