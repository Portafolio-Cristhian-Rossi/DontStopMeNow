import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Album, Track } from '@dsmn/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.ts';
import { queryKeys, useCatalog, useRoots } from '../api/queries.ts';
import { displayPath } from '../components/FolderPicker.tsx';
import { Icon } from '../components/Icon.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { TitleCell, TrackTable } from '../components/TrackTable.tsx';
import { useCurrentTrackId, usePlayerActions } from '../player/PlayerContext.tsx';
import { formatDuration } from '@dsmn/shared';

interface RowProps {
  id: string;
  index: number;
  track: Track;
  album: Album | undefined;
  last: boolean;
  busy: boolean;
  onMove(from: number, to: number): void;
  onRemove(index: number): void;
  playing: boolean;
  onPlay(): void;
}

function SortableRow({ id, index, track, album, last, busy, onMove, onRemove, playing, onPlay }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: busy });
  return (
    <tr
      ref={setNodeRef}
      className={playing ? 'playing' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <td className="num">
        <span className="drag-handle" {...attributes} {...listeners} aria-label={`Arrastrar ${track.title}`}>
          ⠿
        </span>{' '}
        {index + 1}
      </td>
      <TitleCell track={track} playing={playing} onPlay={onPlay} />
      <td className="secondary">{track.artist}</td>
      <td className="secondary">{album?.title ?? ''}</td>
      <td className="time">{formatDuration(track.durationMs)}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button
          type="button"
          className="small"
          disabled={busy || index === 0}
          onClick={() => onMove(index, index - 1)}
        >
          Subir
        </button>{' '}
        <button
          type="button"
          className="small"
          disabled={busy || last}
          onClick={() => onMove(index, index + 1)}
        >
          Bajar
        </button>{' '}
        <button type="button" className="small danger" disabled={busy} onClick={() => onRemove(index)}>
          Quitar
        </button>
      </td>
    </tr>
  );
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { data, isPending, error } = useCatalog();
  const roots = useRoots();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Orden que se está guardando: se muestra al instante y se descarta cuando llega el catálogo nuevo.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const player = usePlayerActions();
  const currentId = useCurrentTrackId();

  if (isPending) return <p className="muted">Cargando…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const playlist = data.playlists.find((p) => p.id === id);
  if (!playlist) return <p className="empty">Lista no encontrada</p>;

  const tracksById = new Map(data.tracks.map((t) => [t.id, t]));
  const albums = new Map(data.albums.map((a) => [a.id, a]));
  const trackIds = pendingOrder ?? playlist.trackIds;
  const entries = trackIds.flatMap((tid, i) => {
    const track = tracksById.get(tid);
    return track ? [{ key: `${i}-${tid}`, index: i, track }] : [];
  });
  const ids = entries.map((e) => e.track.id);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveOrder(next: string[]) {
    setPendingOrder(next);
    await act(() => api.updatePlaylist(id, { trackIds: next }));
    setPendingOrder(null);
  }
  const move = (from: number, to: number) => void saveOrder(arrayMove(trackIds, from, to));
  const remove = (index: number) => void saveOrder(trackIds.filter((_, i) => i !== index));

  function rename(value: string) {
    const trimmed = value.trim();
    if (trimmed && trimmed !== playlist!.name) void act(() => api.updatePlaylist(id, { name: trimmed }));
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') rename(e.currentTarget.value);
  }

  async function destroy() {
    if (!window.confirm(`¿Borrar la lista ${playlist!.name}?`)) return;
    await act(() => api.deletePlaylist(id));
    navigate('/listas');
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const keys = entries.map((e) => e.key);
    move(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
  }

  const root = playlist.folder && roots.data?.find((r) => r.id === playlist.folder!.rootId);

  return (
    <>
      <Link to="/listas" className="back-link">
        <Icon name="volver" size={18} />
        Listas
      </Link>
      <PageHeader
        title={playlist.name}
        subtitle={`${playlist.type === 'manual' ? 'Lista manual' : 'Lista de carpeta'} · ${entries.length} canciones`}
      />
      <div className="toolbar">
        <button
          type="button"
          className="primary pill"
          disabled={ids.length === 0}
          onClick={() => player.playList(ids, 0, { shuffle: false })}
        >
          <Icon name="play" size={18} />
          Reproducir
        </button>
        <button
          type="button"
          className="pill"
          disabled={ids.length === 0}
          onClick={() => player.playList(ids, 0, { shuffle: true })}
        >
          <Icon name="aleatorio" size={18} />
          Aleatorio
        </button>
        <input
          key={playlist.name}
          type="text"
          aria-label="Nombre de la lista"
          defaultValue={playlist.name}
          onKeyDown={onNameKey}
          onBlur={(e) => rename(e.currentTarget.value)}
        />
        <button type="button" className="danger" disabled={busy} onClick={() => void destroy()}>
          Borrar lista
        </button>
      </div>
      {actionError && <p className="error">{actionError}</p>}
      {playlist.type === 'folder' ? (
        <>
          <p className="muted">
            Carpeta: {root ? displayPath(root.path, playlist.folder!.relPath) : playlist.folder!.relPath}
          </p>
          <TrackTable
            tracks={entries.map((e) => e.track)}
            albums={albums}
            numbered
            onPlay={(index) => player.playList(ids, index)}
            currentId={currentId}
          />
        </>
      ) : entries.length === 0 ? (
        <p className="empty">La lista está vacía. Agregá canciones desde la Biblioteca.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map((e) => e.key)} strategy={verticalListSortingStrategy}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Título</th>
                  <th>Artista</th>
                  <th>Álbum</th>
                  <th>Duración</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <SortableRow
                    key={e.key}
                    id={e.key}
                    index={e.index}
                    track={e.track}
                    album={albums.get(e.track.albumId)}
                    last={i === entries.length - 1}
                    busy={busy}
                    onMove={move}
                    onRemove={remove}
                    playing={e.track.id === currentId}
                    onPlay={() => player.playList(ids, i)}
                  />
                ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}
