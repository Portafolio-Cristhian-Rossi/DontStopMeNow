import { Ionicons } from '@expo/vector-icons';
import { formatDuration, type RepeatMode } from '@dsmn/shared';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Disc } from '../src/components/Disc.tsx';
import { QueueSheet } from '../src/components/QueueSheet.tsx';
import { useApp } from '../src/state/AppContext.tsx';
import { usePlayer, usePlayerSnapshot } from '../src/state/PlayerContext.tsx';
import { Text } from '../src/ui/Text.tsx';
import { colors } from '../src/ui/theme.ts';

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repetir: no',
  all: 'Repetir: todo',
  one: 'Repetir: una',
};

function Control({
  icon,
  label,
  onPress,
  size = 26,
  color = colors.text,
  big = false,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress(): void;
  size?: number;
  color?: string;
  big?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [big ? styles.play : styles.control, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export default function Reproductor() {
  const player = usePlayer();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { catalog, setFavorite } = useApp();
  const { current, queue, playing, positionMs, durationMs } = usePlayerSnapshot();
  const [seeking, setSeeking] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const tracks = useMemo(() => new Map((catalog?.tracks ?? []).map((t) => [t.id, t])), [catalog]);
  const albums = useMemo(() => new Map((catalog?.albums ?? []).map((a) => [a.id, a])), [catalog]);

  if (!current || !queue) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>No hay nada sonando. Elegí algo en la Biblioteca.</Text>
      </View>
    );
  }

  const album = albums.get(current.albumId);
  const nextTrack = tracks.get(queue.order[queue.index + 1] ?? '');
  const shown = seeking ?? positionMs;
  const disc = Math.min(300, width - 80);
  // Del catálogo y no de la canción que tiene el reproductor: así el corazón cambia apenas se toca.
  const favorite = Boolean((tracks.get(current.id) ?? current).favoritedAt);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.round}
          accessibilityRole="button"
          accessibilityLabel="Cerrar el reproductor"
        >
          <Ionicons name="chevron-down" size={24} color={colors.text} />
        </Pressable>
        <Pressable
          style={styles.from}
          disabled={!album}
          onPress={() => album && router.push({ pathname: '/album/[id]', params: { id: album.id } })}
          accessibilityRole="link"
          accessibilityLabel={album ? `Sonando desde ${album.title}` : undefined}
        >
          <Text style={styles.eyebrow}>Sonando desde</Text>
          <Text style={styles.fromTitle} numberOfLines={1}>
            {album?.title ?? current.artist}
          </Text>
        </Pressable>
        <View style={styles.round} />
      </View>

      <View style={styles.main}>
        <Disc coverId={current.coverId} title={album?.title ?? current.title} playing={playing} size={disc} />

        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text font="display" style={styles.title} numberOfLines={2}>
              {current.title}
            </Text>
            <Text style={styles.soft} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
          <Pressable
            style={styles.round}
            onPress={() => setFavorite(current.id, !favorite)}
            accessibilityRole="switch"
            accessibilityState={{ checked: favorite }}
            accessibilityLabel="Favorita"
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={26}
              color={favorite ? colors.accent : colors.textSoft}
            />
          </Pressable>
        </View>

        <View style={styles.progress}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={Math.max(durationMs, 1)}
            value={shown}
            onValueChange={setSeeking}
            onSlidingComplete={(v) => {
              player.seek(v);
              setSeeking(null);
            }}
            minimumTrackTintColor={colors.text}
            maximumTrackTintColor="#3A3B42"
            thumbTintColor={colors.text}
            accessibilityLabel="Posición en la canción"
          />
          <View style={styles.times}>
            <Text font="mono" style={styles.time}>
              {formatDuration(shown)}
            </Text>
            <Text font="mono" style={styles.time}>
              {formatDuration(durationMs)}
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Control
            icon="shuffle"
            label="Aleatorio"
            size={24}
            color={queue.shuffle ? colors.accent : colors.textSoft}
            onPress={() => player.setShuffle(!queue.shuffle)}
          />
          <Control icon="play-skip-back" label="Anterior" size={30} onPress={() => player.previous()} />
          <Control
            icon={playing ? 'pause' : 'play'}
            label={playing ? 'Pausa' : 'Reproducir'}
            size={34}
            color={colors.accentText}
            big
            onPress={() => player.toggle()}
          />
          <Control icon="play-skip-forward" label="Siguiente" size={30} onPress={() => player.next()} />
          <View>
            <Control
              icon="repeat"
              label={REPEAT_LABEL[queue.repeat]}
              size={24}
              color={queue.repeat === 'off' ? colors.textSoft : colors.accent}
              onPress={() => player.cycleRepeat()}
            />
            {queue.repeat === 'one' && (
              <View style={styles.badge} pointerEvents="none">
                <Text style={styles.badgeText}>1</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.queueCard, pressed && styles.pressed]}
        onPress={() => setSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={`Ver la cola. A continuación: ${nextTrack?.title ?? 'nada'}`}
      >
        <Ionicons name="list" size={22} color={colors.textSoft} />
        <View style={styles.titleText}>
          <Text style={styles.eyebrow}>Cola · a continuación</Text>
          <Text style={styles.strong} numberOfLines={1}>
            {nextTrack?.title ?? 'No hay más canciones'}
          </Text>
        </View>
        <Ionicons name="chevron-up" size={20} color={colors.muted} />
      </Pressable>

      <QueueSheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  muted: { color: colors.muted },
  soft: { color: colors.textSoft },
  strong: { fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  from: { flex: 1, minWidth: 0, alignItems: 'center' },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  fromTitle: { fontSize: 14, fontWeight: '700' },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 8 },
  titleRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleText: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 23, fontWeight: '800', lineHeight: 27 },
  progress: { alignSelf: 'stretch' },
  slider: { alignSelf: 'stretch', height: 28 },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  time: { fontSize: 12, color: colors.muted },
  controls: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  control: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  badge: {
    position: 'absolute',
    right: 8,
    top: 8,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.accentText, lineHeight: 14 },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
