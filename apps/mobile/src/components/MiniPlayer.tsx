import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppContext.tsx';
import { usePlayer, usePlayerSnapshot } from '../state/PlayerContext.tsx';
import { Text } from '../ui/Text.tsx';
import { colors, TOUCH } from '../ui/theme.ts';
import { Disc } from './Disc.tsx';

/** Barra con la canción actual sobre las pestañas; tocarla abre el reproductor. */
export function MiniPlayer() {
  const player = usePlayer();
  const { catalog } = useApp();
  const { current, playing, positionMs, durationMs } = usePlayerSnapshot();
  if (!current) return null;
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const album = catalog?.albums.find((a) => a.id === current.albumId);

  return (
    <View style={styles.wrap} accessibilityLabel="Reproductor">
      <Pressable
        style={styles.row}
        onPress={() => router.push('/reproductor')}
        accessibilityRole="button"
        accessibilityLabel={`Abrir el reproductor: ${current.title}`}
      >
        <Disc coverId={current.coverId} title={album?.title ?? current.title} playing={playing} size={44} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {[current.artist, album?.title].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable
          onPress={() => player.toggle()}
          style={styles.play}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pausa' : 'Reproducir'}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={22} color={colors.accentText} />
        </Pressable>
        <Pressable
          onPress={() => player.next()}
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel="Siguiente"
        >
          <Ionicons name="play-skip-forward" size={22} color={colors.text} />
        </Pressable>
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 8,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 8,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  muted: { fontSize: 13, color: colors.muted },
  play: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  track: { height: 2, backgroundColor: colors.surface3 },
  fill: { height: 2, backgroundColor: colors.text },
});
