import { Ionicons } from '@expo/vector-icons';
import { formatDuration } from '@dsmn/shared';
import Slider from '@react-native-community/slider';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Cover } from '../src/components/Cover.tsx';
import { useApp } from '../src/state/AppContext.tsx';
import { usePlayer, usePlayerSnapshot } from '../src/state/PlayerContext.tsx';

const REPEAT_LABEL = { off: 'Repetir: no', all: 'Repetir: todo', one: 'Repetir: una' } as const;

export default function Reproductor() {
  const player = usePlayer();
  const { catalog } = useApp();
  const { current, queue, playing, positionMs, durationMs } = usePlayerSnapshot();
  const [seeking, setSeeking] = useState<number | null>(null);
  const tracks = useMemo(() => new Map((catalog?.tracks ?? []).map((t) => [t.id, t])), [catalog]);
  const albums = useMemo(() => new Map((catalog?.albums ?? []).map((a) => [a.id, a])), [catalog]);

  if (!current || !queue) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No hay nada sonando. Elegí algo en la Biblioteca.</Text>
      </View>
    );
  }

  const shown = seeking ?? positionMs;

  return (
    <FlatList
      data={queue.order.map((id, index) => ({ id, index }))}
      keyExtractor={(item) => `${item.index}-${item.id}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <Cover coverId={current.coverId} title={current.title} size={260} />
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.muted}>
            {current.artist} · {albums.get(current.albumId)?.title ?? ''}
          </Text>
          <Slider
            style={{ alignSelf: 'stretch' }}
            minimumValue={0}
            maximumValue={Math.max(durationMs, 1)}
            value={shown}
            onValueChange={setSeeking}
            onSlidingComplete={(v) => {
              player.seek(v);
              setSeeking(null);
            }}
            accessibilityLabel="Posición"
          />
          <View style={styles.times}>
            <Text style={styles.muted}>{formatDuration(shown)}</Text>
            <Text style={styles.muted}>{formatDuration(durationMs)}</Text>
          </View>
          <View style={styles.controls}>
            <Pressable
              onPress={() => player.setShuffle(!queue.shuffle)}
              accessibilityLabel="Aleatorio"
              hitSlop={8}
            >
              <Ionicons name="shuffle" size={26} color={queue.shuffle ? '#e2483d' : '#888'} />
            </Pressable>
            <Pressable onPress={() => player.previous()} accessibilityLabel="Anterior" hitSlop={8}>
              <Ionicons name="play-skip-back" size={34} color="#888" />
            </Pressable>
            <Pressable
              onPress={() => player.toggle()}
              accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
              hitSlop={8}
            >
              <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={72} color="#e2483d" />
            </Pressable>
            <Pressable onPress={() => player.next()} accessibilityLabel="Siguiente" hitSlop={8}>
              <Ionicons name="play-skip-forward" size={34} color="#888" />
            </Pressable>
            <Pressable
              onPress={() => player.cycleRepeat()}
              accessibilityLabel={REPEAT_LABEL[queue.repeat]}
              hitSlop={8}
            >
              <Ionicons name="repeat" size={26} color={queue.repeat === 'off' ? '#888' : '#e2483d'} />
              {queue.repeat === 'one' && <Text style={styles.badge}>1</Text>}
            </Pressable>
          </View>
          <Text style={styles.muted}>{REPEAT_LABEL[queue.repeat]}</Text>
          <Text style={styles.section}>Cola</Text>
        </View>
      }
      renderItem={({ item }) => {
        const track = tracks.get(item.id);
        const active = item.index === queue.index;
        return (
          <Pressable style={styles.queueRow} onPress={() => player.jumpTo(item.index)}>
            <Text style={[styles.queueTitle, active && styles.active]} numberOfLines={1}>
              {track?.title ?? item.id}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              {track?.artist ?? ''}
            </Text>
          </Pressable>
        );
      }}
      initialNumToRender={20}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  muted: { opacity: 0.6 },
  times: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  badge: { position: 'absolute', right: -4, top: -4, fontSize: 10, color: '#e2483d', fontWeight: '700' },
  section: { alignSelf: 'flex-start', fontSize: 17, fontWeight: '600', marginTop: 16 },
  queueRow: { paddingHorizontal: 24, paddingVertical: 8 },
  queueTitle: { fontSize: 15 },
  active: { color: '#e2483d', fontWeight: '700' },
});
