import type { Preview } from '@dsmn/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.ts';
import { useYtDlp } from '../api/queries.ts';
import { DownloadQueue } from '../components/DownloadQueue.tsx';
import { Icon } from '../components/Icon.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { PreviewTable } from '../components/PreviewTable.tsx';
import { YtSources } from '../components/YtSources.tsx';

export function DownloadPage() {
  const ytdlp = useYtDlp();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ready = Boolean(ytdlp.data?.version && ytdlp.data.ffmpeg);

  async function show(load: () => Promise<Preview>) {
    setLoading(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      setPreview(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function look(e: FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (link) void show(() => api.preview(link));
  }

  return (
    <>
      <PageHeader
        title="Descargar"
        subtitle="Bajá playlists o videos de YouTube con yt-dlp. Quedan en tu carpeta de música y aparecen solos en la Biblioteca."
      />
      {ytdlp.data && !ready && (
        <p className="error" role="alert">
          Para descargar, configurá yt-dlp en <Link to="/ajustes">Ajustes</Link>
        </p>
      )}
      <form className="link-box" onSubmit={look}>
        <label>
          <Icon name="link" />
          <input
            type="text"
            aria-label="Link de YouTube"
            placeholder="Pegá un link de YouTube (playlist o video)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={loading || !url.trim()}>
          Ver
        </button>
      </form>
      {loading && <p className="muted">Leyendo el link…</p>}
      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}
      {preview && (
        <PreviewTable
          key={`${preview.url}:${preview.sourceId ?? ''}`}
          preview={preview}
          canEnqueue={ready}
          onEnqueued={(title) => {
            setPreview(null);
            setUrl('');
            setMessage(`Agregado a la cola: ${title}`);
          }}
        />
      )}
      <section className="panel">
        <DownloadQueue />
      </section>
      <section className="panel">
        <YtSources busy={loading} onCheck={(id) => void show(() => api.checkSource(id))} />
      </section>
    </>
  );
}
