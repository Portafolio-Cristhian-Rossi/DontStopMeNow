import { Ionicons } from '@expo/vector-icons';
import { formatDuration, type RepeatMode, type Track } from '@dsmn/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SleepSetting } from '../core/player/controller.ts';
import { useApp } from '../state/AppContext.tsx';
import { usePlayer, usePlayerSnapshot } from '../state/PlayerContext.tsx';
import { Text } from '../ui/Text.tsx';
import { colors, radius, TOUCH } from '../ui/theme.ts';
import { Cover } from './Cover.tsx';

/** Alto de cada fila de la cola: se usa para saber a dónde se soltó una fila arrastrada. */
const ROW = 60;

const REPEATS: [RepeatMode, string, string][] = [
  ['off', 'No', 'Al terminar la cola, se frena.'],
  ['all', 'Todo', 'Al terminar la cola, vuelve a empezar.'],
  ['one', 'Una', 'Repite la canción que está sonando.'],
];
const RATES = [0.75, 1, 1.25, 1.5];
const SLEEPS: [string, SleepSetting][] = [
  ['Apagado', { kind: 'off' }],
  ['15 min', { kind: 'timer', minutes: 15 }],
  ['30 min', { kind: 'timer', minutes: 30 }],
  ['1 h', { kind: 'timer', minutes: 60 }],
  ['Al terminar la canción', { kind: 'end' }],
];

function Segment({ label, on, onPress }: { label: string; on: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.segment, on && styles.segmentOn]}
    >
      <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
    </Pressable>
  );
}

interface Entry {
  index: number;
  track: Track;
}

/** Fila de lo que viene: la manija se arrastra para reordenar; también "Subir"/"Bajar" para lector de pantalla. */
function QueueRow({
  entry,
  offset,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPress,
  onRemove,
  onMove,
}: {
  entry: Entry;
  offset: number;
  dragging: boolean;
  onDragStart(): void;
  onDragMove(dy: number): void;
  onDragEnd(dy: number): void;
  onPress(): void;
  onRemove(): void;
  onMove(delta: number): void;
}) {
  const handlers = useRef({ onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    handlers.current = { onDragStart, onDragMove, onDragEnd };
  });
  // El PanResponder se crea una vez y lee los manejadores del ref en cada gesto (no durante el render):
  // recrearlo en cada render cortaría el arrastre a la mitad.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => handlers.current.onDragStart(),
      onPanResponderMove: (_, g) => handlers.current.onDragMove(g.dy),
      onPanResponderRelease: (_, g) => handlers.current.onDragEnd(g.dy),
      onPanResponderTerminate: (_, g) => handlers.current.onDragEnd(g.dy),
    }),
  );
  const { track } = entry;
  return (
    <View
      style={[styles.row, dragging && styles.rowDragging, { transform: [{ translateY: offset }] }]}
      accessible
      accessibilityLabel={`${track.title}, ${formatDuration(track.durationMs)}`}
      accessibilityActions={[
        { name: 'activate', label: 'Reproducir' },
        { name: 'subir', label: 'Subir' },
        { name: 'bajar', label: 'Bajar' },
        { name: 'quitar', label: 'Quitar de la cola' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') onPress();
        else if (e.nativeEvent.actionName === 'subir') onMove(-1);
        else if (e.nativeEvent.actionName === 'bajar') onMove(1);
        else if (e.nativeEvent.actionName === 'quitar') onRemove();
      }}
    >
      <View style={styles.handle} {...pan.panHandlers}>
        <Ionicons name="reorder-three" size={22} color={colors.faint} />
      </View>
      <Pressable style={styles.rowMain} onPress={onPress}>
        <Cover coverId={track.coverId} title={track.title} size={40} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {track.title}
          </Text>
          <Text font="mono" style={styles.small}>
            {formatDuration(track.durationMs)}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onRemove}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel={`Quitar ${track.title} de la cola`}
      >
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function QueueTab() {
  const player = usePlayer();
  const { catalog } = useApp();
  const { queue, current, positionMs, durationMs } = usePlayerSnapshot();
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const tracks = useMemo(() => new Map((catalog?.tracks ?? []).map((t) => [t.id, t])), [catalog]);

  if (!queue || !current) return <Text style={styles.empty}>No hay nada sonando.</Text>;
  const upcoming: Entry[] = queue.order.flatMap((id, index) => {
    const track = tracks.get(id);
    return index > queue.index && track ? [{ index, track }] : [];
  });
  const first = queue.index + 1;
  const last = queue.order.length - 1;
  const target = (from: number, dy: number) => Math.min(last, Math.max(first, from + Math.round(dy / ROW)));

  // Mientras se arrastra, las filas entre el origen y el destino se corren una posición.
  const offsetFor = (index: number) => {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    const to = target(drag.from, drag.dy);
    if (drag.from < to && index > drag.from && index <= to) return -ROW;
    if (drag.from > to && index < drag.from && index >= to) return ROW;
    return 0;
  };

  return (
    <View style={styles.tabBody}>
      <Text style={styles.eyebrow}>Sonando</Text>
      <View style={styles.current}>
        <Cover coverId={current.coverId} title={current.title} size={44} />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.accent }]} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.small} numberOfLines={1}>
            {current.artist} · {formatDuration(positionMs)} de {formatDuration(durationMs)}
          </Text>
        </View>
      </View>
      <View style={styles.upNextHead}>
        <Text style={styles.eyebrow}>A continuación · {upcoming.length}</Text>
        {upcoming.length > 0 && (
          <Pressable onPress={() => player.clearUpcoming()} style={styles.link} accessibilityRole="button">
            <Text style={styles.linkText}>Limpiar</Text>
          </Pressable>
        )}
      </View>
      {upcoming.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.strong}>La cola está vacía</Text>
          <Text style={styles.small}>Mantené apretada una canción y elegí «Agregar a la cola».</Text>
        </View>
      ) : (
        upcoming.map((entry) => (
          <QueueRow
            key={`${entry.index}-${entry.track.id}`}
            entry={entry}
            offset={offsetFor(entry.index)}
            dragging={drag?.from === entry.index}
            onDragStart={() => setDrag({ from: entry.index, dy: 0 })}
            onDragMove={(dy) => setDrag({ from: entry.index, dy })}
            onDragEnd={(dy) => {
              setDrag(null);
              const to = target(entry.index, dy);
              if (to !== entry.index) player.move(entry.index, to);
            }}
            onPress={() => player.jumpTo(entry.index)}
            onRemove={() => player.removeAt(entry.index)}
            onMove={(delta) => {
              const to = entry.index + delta;
              if (to >= first && to <= last) player.move(entry.index, to);
            }}
          />
        ))
      )}
    </View>
  );
}

function SettingsTab() {
  const player = usePlayer();
  const { queue, rate, sleep } = usePlayerSnapshot();
  const repeat = queue?.repeat ?? 'off';
  const sleepOn = (option: SleepSetting) =>
    option.kind === sleep.kind &&
    (option.kind !== 'timer' || (sleep.kind === 'timer' && sleep.minutes === option.minutes));

  return (
    <View style={[styles.tabBody, styles.settings]}>
      <View style={styles.setting}>
        <Text style={styles.settingLabel}>Repetir</Text>
        <View style={styles.segments} accessibilityRole="radiogroup">
          {REPEATS.map(([mode, label]) => (
            <Segment key={mode} label={label} on={repeat === mode} onPress={() => player.setRepeat(mode)} />
          ))}
        </View>
        <Text style={styles.small}>{REPEATS.find(([mode]) => mode === repeat)?.[2]}</Text>
      </View>

      <View style={[styles.setting, styles.settingRow]}>
        <View style={styles.rowText}>
          <Text style={styles.settingLabel}>Aleatorio</Text>
          <Text style={styles.small}>Mezcla lo que queda en la cola</Text>
        </View>
        <Switch
          value={queue?.shuffle ?? false}
          onValueChange={(on) => player.setShuffle(on)}
          trackColor={{ false: '#3A3B42', true: colors.accent }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Aleatorio"
        />
      </View>

      <View style={styles.setting}>
        <Text style={styles.settingLabel}>Velocidad</Text>
        <View style={styles.segments}>
          {RATES.map((r) => (
            <Segment key={r} label={`${r}×`} on={rate === r} onPress={() => player.setRate(r)} />
          ))}
        </View>
      </View>

      <View style={styles.setting}>
        <Text style={styles.settingLabel}>Temporizador para dormir</Text>
        <View style={[styles.segments, styles.wrap]}>
          {SLEEPS.map(([label, option]) => (
            <Segment key={label} label={label} on={sleepOn(option)} onPress={() => player.setSleep(option)} />
          ))}
        </View>
        {sleep.kind !== 'off' && (
          <View style={styles.sleepNote}>
            <Ionicons name="moon" size={16} color={colors.accent} />
            <Text style={styles.soft}>
              {sleep.kind === 'end'
                ? 'Se pausa cuando termine esta canción.'
                : `Se pausa a las ${new Date(sleep.until).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Hoja que sube desde abajo con la cola y los ajustes de reproducción. */
export function QueueSheet({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'cola' | 'ajustes'>('cola');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar la cola" />
      <View style={[styles.sheet, { top: insets.top + 72, paddingBottom: insets.bottom }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['cola', 'ajustes'] as const).map((key) => (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                style={[styles.tab, tab === key && styles.tabOn]}
              >
                <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
                  {key === 'cola' ? 'Cola' : 'Ajustes'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          {tab === 'cola' ? <QueueTab /> : <SettingsTab />}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,6,8,0.66)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: '#2A2B30',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#3A3B42',
    marginTop: 10,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.text },
  tabText: { fontWeight: '600', color: colors.textSoft },
  tabTextOn: { color: '#141414' },
  scroll: { paddingHorizontal: 12, paddingBottom: 24 },
  tabBody: { gap: 6 },
  eyebrow: {
    paddingHorizontal: 8,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    marginBottom: 10,
  },
  upNextHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { minHeight: TOUCH, paddingHorizontal: 14, justifyContent: 'center' },
  linkText: { fontWeight: '600', color: colors.textSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, height: ROW, borderRadius: 14 },
  rowDragging: { backgroundColor: colors.surface3, zIndex: 2, elevation: 6 },
  handle: { width: 36, height: ROW, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, height: ROW },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  iconButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 12, color: colors.muted },
  soft: { fontSize: 13, color: colors.textSoft },
  strong: { fontWeight: '600' },
  empty: { padding: 24, color: colors.muted },
  emptyBox: { paddingVertical: 28, paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  settings: { gap: 24, paddingTop: 8, paddingHorizontal: 6 },
  setting: { gap: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingLabel: { fontSize: 15, fontWeight: '600' },
  segments: { flexDirection: 'row', gap: 6 },
  wrap: { flexWrap: 'wrap' },
  segment: {
    flexGrow: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#33343A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.text, borderColor: colors.text },
  segmentText: { fontWeight: '600', color: '#D6D6DB', fontSize: 14 },
  segmentTextOn: { color: '#141414' },
  sleepNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
