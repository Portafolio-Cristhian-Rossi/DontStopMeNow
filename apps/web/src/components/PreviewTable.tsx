import { formatDuration, sanitizeFolderName, type AnalyzedEntry, type Preview } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client.ts';
import { queryKeys, useRoots } from '../api/queries.ts';

interface Props {
  preview: Preview;
  /** yt-dlp y ffmpeg listos; si no, no se puede encolar. */
  canEnqueue: boolean;
  onEnqueued(title: string): void;
}

const TAG_LABELS: Record<string, string> = {
  live: 'en vivo',
  acoustic: 'acústica',
  'sped up': 'sped up',
  slowed: 'slowed',
  'radio edit': 'radio edit',
};
const tagLabel = (tag: string) => TAG_LABELS[tag] ?? tag;

/** Lista de videos de un link con las marcas de duplicados, el destino y "Agregar a la cola". */
export function PreviewTable({ preview, canEnqueue, onEnqueued }: Props) {
  const queryClient = useQueryClient();
  const roots = useRoots().data ?? [];
  const fixed = preview.destination;
  const choices = fixed ? roots : roots.filter((r) => r.status === 'online');
  const [chosenRoot, setChosenRoot] = useState<number | null>(fixed?.rootId ?? null);
  const [folder, setFolder] = useState(
    fixed?.folder ?? (preview.kind === 'video' ? '' : sanitizeFolderName(preview.title)),
  );
  const [selected, setSelected] = useState(
    () => new Set(preview.entries.filter((e) => e.selected).map((e) => e.videoId)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootId = chosenRoot ?? choices[0]?.id ?? null;
  const available = preview.entries.filter((e) => !e.unavailable);
  const fresh = preview.entries.filter((e) => !e.alreadyDownloaded);
  const downloaded = preview.entries.filter((e) => e.alreadyDownloaded);
  const width = preview.playlistSize > 99 ? 3 : 2;
  const number = (position: number | null) =>
    position === null ? '' : String(position).padStart(width, '0');

  function toggle(videoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(videoId)) next.add(videoId);
      return next;
    });
  }

  function marks(e: AnalyzedEntry): string[] {
    const out: string[] = [];
    if (e.unavailable) out.push('No disponible');
    if (e.duplicateOf) {
      const original = preview.entries.find((o) => o.videoId === e.duplicateOf);
      out.push(original?.position ? `Repetida de #${number(original.position)}` : 'Repetida');
    }
    if (e.inLibrary) out.push('Ya en tu biblioteca');
    if (e.versionGroup) {
      const others = preview.entries
        .filter((o) => o.versionGroup === e.versionGroup && o.videoId !== e.videoId && o.position !== null)
        .map((o) => `#${number(o.position)}`);
      const also = others.length > 0 ? ` (también ${others.join(', ')})` : '';
      out.push(`Versión: ${e.versionTags.map(tagLabel).join(', ') || 'original'}${also}`);
    }
    return out;
  }

  async function enqueue() {
    if (rootId === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.enqueue({
        url: preview.url,
        title: preview.title,
        kind: preview.kind,
        ytPlaylistId: preview.ytPlaylistId,
        playlistSize: preview.playlistSize,
        rootId,
        folder: folder.trim(),
        items: preview.entries
          .filter((e) => selected.has(e.videoId))
          .map((e) => ({ videoId: e.videoId, position: e.position, title: e.title })),
      });
      for (const key of [queryKeys.downloadJobs, queryKeys.ytSources]) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
      onEnqueued(preview.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = (entries: AnalyzedEntry[]) =>
    entries.map((e) => (
      <tr key={e.videoId} className={e.unavailable ? 'unavailable' : undefined}>
        <td>
          <input
            type="checkbox"
            aria-label={e.title}
            checked={selected.has(e.videoId)}
            disabled={e.unavailable}
            onChange={() => toggle(e.videoId)}
          />
        </td>
        <td className="muted">{number(e.position)}</td>
        <td>{e.title}</td>
        <td className="muted">{e.channel ?? ''}</td>
        <td className="muted">{e.durationSec === null ? '—' : formatDuration(e.durationSec * 1000)}</td>
        <td>
          {marks(e).map((m) => (
            <span key={m} className="badge">
              {m}
            </span>
          ))}
        </td>
      </tr>
    ));

  const table = (entries: AnalyzedEntry[]) => (
    <table className="preview-table">
      <thead>
        <tr>
          <th aria-label="Elegida" />
          <th>#</th>
          <th>Título</th>
          <th>Canal</th>
          <th>Duración</th>
          <th aria-label="Marcas" />
        </tr>
      </thead>
      <tbody>{rows(entries)}</tbody>
    </table>
  );

  return (
    <section className="card preview">
      <div className="toolbar preview-head">
        <h2>{preview.title}</h2>
        <span className="muted">{preview.entries.length} videos</span>
        <span className="preview-count">
          {selected.size} de {available.length} elegidas
        </span>
      </div>

      <div className="toolbar">
        <label>
          Carpeta de música{' '}
          <select
            aria-label="Carpeta de música"
            value={rootId ?? ''}
            disabled={Boolean(fixed)}
            onChange={(e) => setChosenRoot(Number(e.target.value))}
          >
            {choices.map((r) => (
              <option key={r.id} value={r.id}>
                {r.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subcarpeta{' '}
          <input
            type="text"
            aria-label="Subcarpeta"
            value={folder}
            disabled={Boolean(fixed)}
            onChange={(e) => setFolder(e.target.value)}
          />
        </label>
      </div>
      {fixed && <p className="muted">Se guarda en la misma carpeta que la vez anterior</p>}
      {rootId === null && <p className="error">Agregá o conectá una carpeta de música en Ajustes</p>}

      {table(fresh)}
      {downloaded.length > 0 && (
        <details>
          <summary>{downloaded.length} ya descargadas</summary>
          {table(downloaded)}
        </details>
      )}

      {error && <p className="error">{error}</p>}
      <div className="toolbar preview-actions">
        <button
          type="button"
          onClick={() =>
            setSelected(new Set(available.filter((e) => !e.alreadyDownloaded).map((e) => e.videoId)))
          }
        >
          Todas
        </button>
        <button type="button" onClick={() => setSelected(new Set())}>
          Ninguna
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !canEnqueue || rootId === null || selected.size === 0}
          onClick={() => void enqueue()}
        >
          Agregar a la cola
        </button>
      </div>
    </section>
  );
}
