import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import { useScanStatus } from '../api/events.ts';
import { queryKeys, useIssues, useRoots } from '../api/queries.ts';
import { SystemFolderDialog } from '../components/SystemFolderDialog.tsx';
import { YtDlpSettings } from '../components/YtDlpSettings.tsx';

/** Limpia una ruta pegada desde el Explorador: espacios y comillas en los extremos. */
export function cleanPath(input: string): string {
  return input
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

export function SettingsPage() {
  const roots = useRoots();
  const issues = useIssues();
  const scan = useScanStatus();
  const queryClient = useQueryClient();
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      for (const key of [queryKeys.roots, queryKeys.catalog, queryKeys.issues]) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const cleaned = cleanPath(path);
    if (!cleaned) return;
    if (await act(() => api.addRoot(cleaned))) setPath('');
  }

  async function addPicked(picked: string) {
    if (await act(() => api.addRoot(picked))) setPicking(false);
  }

  function openPicker() {
    setError(null);
    setPicking(true);
  }

  function remove(id: number, rootPath: string) {
    const ok = window.confirm(
      `Se quitarán de la biblioteca las canciones de ${rootPath} y sus listas de carpeta.`,
    );
    if (ok) void act(() => api.removeRoot(id));
  }

  return (
    <>
      <h1>Ajustes</h1>

      <h2>Carpetas de música</h2>
      {roots.isPending ? (
        <p className="muted">Cargando…</p>
      ) : roots.data?.length ? (
        <table>
          <thead>
            <tr>
              <th>Ruta</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {roots.data.map((r) => (
              <tr key={r.id}>
                <td>{r.path}</td>
                <td>{r.status === 'online' ? 'Conectada' : 'Desconectada'}</td>
                <td>
                  <button
                    type="button"
                    className="small danger"
                    disabled={busy}
                    onClick={() => remove(r.id, r.path)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Todavía no agregaste ninguna carpeta.</p>
      )}
      <form className="toolbar" onSubmit={add} style={{ marginTop: '1rem' }}>
        <button type="button" className="primary" disabled={busy} onClick={openPicker}>
          Examinar…
        </button>
        <span className="muted">o pegá la ruta:</span>
        <input
          type="text"
          aria-label="Ruta de la carpeta"
          placeholder="Por ejemplo D:\Música"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button type="submit" disabled={busy || !cleanPath(path)}>
          Agregar carpeta
        </button>
      </form>
      {error && !picking && <p className="error">{error}</p>}
      {picking && (
        <SystemFolderDialog
          busy={busy}
          error={error}
          onPick={(picked) => void addPicked(picked)}
          onClose={() => setPicking(false)}
        />
      )}

      <h2>Escaneo</h2>
      <div className="toolbar">
        <button type="button" onClick={() => void act(() => api.scan())} disabled={busy || scan.running}>
          Reescanear todo
        </button>
        <span className="muted">
          {scan.running
            ? `Escaneando… ${scan.processed}/${scan.total}`
            : scan.total > 0
              ? `Último escaneo: ${scan.total} archivos`
              : 'El servidor vigila las carpetas y escanea solo cuando algo cambia.'}
        </span>
      </div>

      <YtDlpSettings />

      <h2>Archivos con problemas</h2>
      {issues.data?.length ? (
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Problema</th>
            </tr>
          </thead>
          <tbody>
            {issues.data.map((i) => (
              <tr key={i.path}>
                <td>{i.path}</td>
                <td>{i.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No hay archivos con problemas.</p>
      )}
    </>
  );
}
