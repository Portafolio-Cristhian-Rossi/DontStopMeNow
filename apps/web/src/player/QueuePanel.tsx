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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDuration, type RepeatMode, type Track } from '@dsmn/shared';
import { useState } from 'react';
import { useCatalog } from '../api/queries.ts';
import { Icon } from '../components/Icon.tsx';
import { usePlayer } from './PlayerContext.tsx';
import type { Player, PlayerSnapshot, Sleep } from './player.ts';

const RATES = [0.75, 1, 1.25, 1.5];
const REPEATS: [RepeatMode, string][] = [
  ['off', 'No'],
  ['all', 'Todo'],
  ['one', 'Una'],
];
const SLEEPS: [string, Parameters<Player['setSleep']>[0]][] = [
  ['Apagado', { kind: 'off' }],
  ['15 min', { kind: 'timer', minutes: 15 }],
  ['30 min', { kind: 'timer', minutes: 30 }],
  ['1 h', { kind: 'timer', minutes: 60 }],
  ['Al terminar la canción', { kind: 'end' }],
];

function sleepMatches(sleep: Sleep, option: Parameters<Player['setSleep']>[0]): boolean {
  if (sleep.kind !== option.kind) return false;
  return sleep.kind !== 'timer' || (option.kind === 'timer' && sleep.minutes === option.minutes);
}

function QueueRow({ id, index, track, player }: { id: string; index: number; track: Track; player: Player }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className="queue-row"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span className="drag-handle" {...attributes} {...listeners} aria-label={`Arrastrar ${track.title}`}>
        <Icon name="arrastrar" size={16} />
      </span>
      <button type="button" className="queue-title" onClick={() => player.jumpTo(index)} title={track.title}>
        <span className="ellipsis">{track.title}</span>
        <span className="muted">{formatDuration(track.durationMs)}</span>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`Quitar ${track.title} de la cola`}
        onClick={() => player.removeAt(index)}
      >
        <Icon name="cerrar" size={16} />
      </button>
    </li>
  );
}

function QueueList({ snapshot, player }: { snapshot: PlayerSnapshot; player: Player }) {
  const { data } = useCatalog();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const q = snapshot.queue;
  if (!q || !snapshot.track) return <p className="muted">La cola está vacía.</p>;

  const tracks = new Map((data?.tracks ?? []).map((t) => [t.id, t]));
  const upcoming = q.order.flatMap((id, index) => {
    const track = tracks.get(id);
    return index > q.index && track ? [{ key: `${index}-${id}`, index, track }] : [];
  });

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = upcoming.find((u) => u.key === active.id)?.index;
    const to = upcoming.find((u) => u.key === over.id)?.index;
    if (from !== undefined && to !== undefined) player.move(from, to);
  }

  return (
    <div className="queue-panel-body">
      <h3 className="eyebrow">Sonando</h3>
      <div className="queue-current">
        <span className={snapshot.playing ? 'eq' : 'eq paused'} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>
          <strong className="ellipsis">{snapshot.track.title}</strong>
          <span className="ellipsis muted">{snapshot.track.artist}</span>
        </span>
      </div>
      <div className="queue-head">
        <h3 className="eyebrow">A continuación · {upcoming.length}</h3>
        {upcoming.length > 0 && (
          <button type="button" className="small" onClick={() => player.clearUpcoming()}>
            Limpiar
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <p className="muted">No hay más canciones en la cola.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={upcoming.map((u) => u.key)} strategy={verticalListSortingStrategy}>
            <ul className="list-plain">
              {upcoming.map((u) => (
                <QueueRow key={u.key} id={u.key} index={u.index} track={u.track} player={player} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function Segmented<T>({
  label,
  options,
  isOn,
  onPick,
}: {
  label: string;
  options: [string, T][];
  isOn(value: T): boolean;
  onPick(value: T): void;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(([text, value]) => (
          <button
            key={text}
            type="button"
            className={isOn(value) ? 'chip active' : 'chip'}
            aria-pressed={isOn(value)}
            onClick={() => onPick(value)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Settings({ snapshot, player }: { snapshot: PlayerSnapshot; player: Player }) {
  const repeat = snapshot.queue?.repeat ?? 'off';
  const shuffle = snapshot.queue?.shuffle ?? false;
  const { sleep } = snapshot;
  return (
    <div className="queue-panel-body settings-list">
      <Segmented
        label="Repetir"
        options={REPEATS.map(([value, text]) => [text, value])}
        isOn={(value) => value === repeat}
        onPick={(value) => player.setRepeat(value)}
      />
      <div className="setting setting-row">
        <span>
          <span className="setting-label">Aleatorio</span>
          <span className="muted">Mezcla lo que falta de la cola</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={shuffle}
          aria-label="Aleatorio"
          className="switch"
          onClick={() => player.setShuffle(!shuffle)}
        >
          <span />
        </button>
      </div>
      <Segmented
        label="Velocidad"
        options={RATES.map((r) => [`${r}×`, r])}
        isOn={(r) => r === snapshot.rate}
        onPick={(r) => player.setRate(r)}
      />
      <Segmented
        label="Temporizador para dormir"
        options={SLEEPS}
        isOn={(option) => sleepMatches(sleep, option)}
        onPick={(option) => player.setSleep(option)}
      />
      {sleep.kind === 'timer' && (
        <p className="muted" role="status">
          Se pausa a las{' '}
          {new Date(sleep.until).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.
        </p>
      )}
      {sleep.kind === 'end' && (
        <p className="muted" role="status">
          Se pausa cuando termine esta canción.
        </p>
      )}
    </div>
  );
}

/** Panel de la derecha de Reproduciendo: la cola y los ajustes de reproducción. */
export function QueuePanel() {
  const [snapshot, player] = usePlayer();
  const [tab, setTab] = useState<'cola' | 'ajustes'>('cola');
  return (
    <aside className="queue-panel" aria-label="Cola y ajustes">
      <div className="panel-tabs" role="tablist" aria-label="Panel">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cola'}
          className={tab === 'cola' ? 'active' : undefined}
          onClick={() => setTab('cola')}
        >
          Cola
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ajustes'}
          className={tab === 'ajustes' ? 'active' : undefined}
          onClick={() => setTab('ajustes')}
        >
          Ajustes
        </button>
      </div>
      {tab === 'cola' ? (
        <QueueList snapshot={snapshot} player={player} />
      ) : (
        <Settings snapshot={snapshot} player={player} />
      )}
    </aside>
  );
}
