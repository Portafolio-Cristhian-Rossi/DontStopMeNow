import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import { useScanStatus } from '../api/events.ts';
import { queryKeys, useIssues, useRoots } from '../api/queries.ts';
import { Icon } from '../components/Icon.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
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
      <PageHeader title="Ajustes" subtitle="De dónde sale tu música y cómo se baja." />

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Carpetas de música</h2>
            <p>Todo lo que haya adentro entra en la Biblioteca y se actualiza solo.</p>
          </div>
        </div>
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
                  <td className="root-path">{r.path}</td>
                  <td>
                    <span className={r.status === 'online' ? 'badge ok' : 'badge warn'}>
                      {r.status === 'online' ? 'Conectada' : 'Desconectada'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
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
        <form className="toolbar path-form" onSubmit={add}>
          <button type="button" className="primary" disabled={busy} onClick={openPicker}>
            <Icon name="carpeta" size={18} />
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
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Escaneo</h2>
            <p>
              {scan.running
                ? `Escaneando… ${scan.processed}/${scan.total}`
                : scan.total > 0
                  ? `Último escaneo: ${scan.total} archivos`
                  : 'El servidor vigila las carpetas y escanea solo cuando algo cambia.'}
            </p>
          </div>
          <button type="button" onClick={() => void act(() => api.scan())} disabled={busy || scan.running}>
            <Icon name="refrescar" size={18} />
            Reescanear todo
          </button>
        </div>
      </section>

      <section className="panel">
        <YtDlpSettings />
      </section>

      <section className="panel">
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
      </section>
    </>
  );
}
