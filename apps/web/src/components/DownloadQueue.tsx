import type { DownloadEvent, DownloadItem, DownloadJob } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.ts';
import { useDownloadProgress } from '../api/events.ts';
import { queryKeys, useDownloadJobs } from '../api/queries.ts';

const JOB_STATUS: Record<DownloadJob['status'], string> = {
  pending: 'En espera',
  running: 'Bajando',
  paused: 'Pausado',
  done: 'Terminado',
  cancelled: 'Cancelado',
};

function itemLabel(item: DownloadItem): string {
  switch (item.status) {
    case 'pending':
      return 'en espera';
    case 'downloading':
      return 'bajando';
    case 'done':
      return 'lista';
    case 'failed':
      return `falló: ${item.error ?? 'error desconocido'}`;
    case 'cancelled':
      return 'cancelada';
  }
}

/** "1/3 · 1 fallida": del último evento en vivo si hay, si no de las canciones guardadas. */
function counts(job: DownloadJob, event: DownloadEvent | undefined): string {
  const done = event?.done ?? job.items.filter((i) => i.status === 'done').length;
  const failed = event?.failed ?? job.items.filter((i) => i.status === 'failed').length;
  const total = event?.total ?? job.items.length;
  return `${done}/${total}${failed > 0 ? ` · ${failed} ${failed === 1 ? 'fallida' : 'fallidas'}` : ''}`;
}

function current(event: DownloadEvent | undefined): string | null {
  const now = event?.current;
  if (!now) return null;
  if (now.stage === 'convert') return `${now.title}: convirtiendo…`;
  return now.percent === null ? now.title : `${now.title} ${Math.round(now.percent)}%`;
}

/** Sección "Cola": cada trabajo con su estado, el progreso en vivo y las acciones que admite. */
export function DownloadQueue() {
  const jobs = useDownloadJobs();
  const progress = useDownloadProgress();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.downloadJobs });
  }

  const list = jobs.data ?? [];

  return (
    <>
      <h2>Cola</h2>
      {error && <p className="error">{error}</p>}
      {jobs.isPending ? (
        <p className="muted">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="muted">No hay descargas en la cola.</p>
      ) : (
        <ul className="list-plain queue">
          {list.map((job) => {
            const event = progress[job.id];
            const now = job.status === 'running' ? current(event) : null;
            const retryable =
              job.status !== 'running' &&
              job.items.some((i) => i.status === 'failed' || i.status === 'cancelled');
            return (
              <li key={job.id} className="card queue-job">
                <div className="toolbar">
                  <strong>{job.title}</strong>
                  <span className={job.status === 'paused' ? 'error' : 'muted'}>
                    {job.status === 'paused' && job.pauseReason
                      ? `${JOB_STATUS.paused}: ${job.pauseReason}`
                      : JOB_STATUS[job.status]}
                  </span>
                  <span>{counts(job, event)}</span>
                  {now && <span className="muted">{now}</span>}
                  <span className="queue-actions">
                    {job.status === 'paused' && (
                      <button
                        type="button"
                        className="small"
                        onClick={() => void act(() => api.resumeJob(job.id))}
                      >
                        Reanudar
                      </button>
                    )}
                    {retryable && (
                      <button
                        type="button"
                        className="small"
                        onClick={() => void act(() => api.retryJob(job.id))}
                      >
                        Reintentar fallidas
                      </button>
                    )}
                    {(job.status === 'pending' || job.status === 'running' || job.status === 'paused') && (
                      <button
                        type="button"
                        className="small danger"
                        onClick={() => void act(() => api.cancelJob(job.id))}
                      >
                        Cancelar
                      </button>
                    )}
                    {(job.status === 'pending' || job.status === 'done' || job.status === 'cancelled') && (
                      <button
                        type="button"
                        className="small"
                        onClick={() => void act(() => api.removeJob(job.id))}
                      >
                        Quitar
                      </button>
                    )}
                  </span>
                </div>
                <details>
                  <summary>Ver canciones</summary>
                  <ul className="list-plain">
                    {job.items.map((item) => (
                      <li key={item.videoId} className={item.status === 'failed' ? 'error' : undefined}>
                        {`${item.title}: ${itemLabel(item)}`}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
