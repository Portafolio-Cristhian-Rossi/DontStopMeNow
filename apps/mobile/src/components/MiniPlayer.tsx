import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer, usePlayerSnapshot } from '../state/PlayerContext.tsx';
import { Cover } from './Cover.tsx';

/** Barra con la canción actual sobre las pestañas; tocarla abre el reproductor. */
export function MiniPlayer() {
  const player = usePlayer();
  const { current, playing, positionMs, durationMs } = usePlayerSnapshot();
  if (!current) return null;
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View style={styles.wrap}>
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      <Pressable
        style={styles.row}
        onPress={() => router.push('/reproductor')}
        accessibilityLabel="Abrir el reproductor"
      >
        <Cover coverId={current.coverId} title={current.title} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {current.artist}
          </Text>
        </View>
        <Pressable
          onPress={() => player.toggle()}
          hitSlop={12}
          accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={28} color="#888" />
        </Pressable>
        <Pressable onPress={() => player.next()} hitSlop={12} accessibilityLabel="Siguiente">
          <Ionicons name="play-skip-forward" size={24} color="#888" />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#8886' },
  progress: { height: 2, backgroundColor: '#e2483d' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  muted: { opacity: 0.6 },
});
