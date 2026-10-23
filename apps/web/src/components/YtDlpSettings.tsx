import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import { queryKeys, useYtDlp } from '../api/queries.ts';

/** Sección de Ajustes: dónde está yt-dlp, su versión, si hay ffmpeg y el botón para actualizarlo. */
export function YtDlpSettings() {
  const status = useYtDlp();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = status.data;
  const path = typed ?? data?.path ?? data?.suggestedPath ?? '';

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      queryClient.setQueryData(queryKeys.ytdlp, await api.setYtdlpPath(path.trim()));
      setTyped(null);
    });
  }

  function update() {
    setOutput(null);
    void run(async () => {
      setOutput((await api.updateYtdlp()).output);
      await queryClient.invalidateQueries({ queryKey: queryKeys.ytdlp });
    });
  }

  return (
    <>
      <h2>Descargas con yt-dlp</h2>
      <form className="toolbar" onSubmit={save}>
        <input
          type="text"
          aria-label="Ruta de yt-dlp"
          placeholder="Por ejemplo D:\Music\yt-dlp.exe"
          value={path}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button type="submit" disabled={busy || !path.trim()}>
          Guardar
        </button>
        {data?.path && (
          <button type="button" disabled={busy} onClick={update}>
            Actualizar
          </button>
        )}
      </form>
      {data && (
        <ul className="list-plain">
          <li>
            {data.version ? (
              `Versión ${data.version}`
            ) : data.error ? (
              <span className="error">{data.error}</span>
            ) : (
              <span className="muted">yt-dlp no está configurado</span>
            )}
          </li>
          <li className={data.ffmpeg ? undefined : 'error'}>
            {data.ffmpeg ? 'ffmpeg: encontrado' : 'ffmpeg: no encontrado (instalalo y reiniciá el servidor)'}
          </li>
        </ul>
      )}
      {busy && <p className="muted">Trabajando…</p>}
      {output && <pre className="card">{output}</pre>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
