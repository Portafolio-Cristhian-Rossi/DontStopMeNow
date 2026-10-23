import { formatDuration, type Track } from '@dsmn/shared';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCurrentTrackId, usePlayer } from '../state/PlayerContext.tsx';

interface Props {
  track: Track;
  index?: number;
  /** Tocar la fila: normalmente reproduce la lista visible desde esta canción. */
  onPress?: () => void;
}

/** Fila de canción. Mantener apretado ofrece "a continuación" y "agregar a la cola". */
export function TrackRow({ track, index, onPress }: Props) {
  const player = usePlayer();
  const active = useCurrentTrackId() === track.id;

  function showActions() {
    Alert.alert(track.title, track.artist, [
      { text: 'Reproducir a continuación', onPress: () => player.playNext(track.id) },
      { text: 'Agregar a la cola', onPress: () => player.addToQueue(track.id) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      onLongPress={showActions}
      accessibilityHint="Mantené apretado para más opciones"
    >
      {index !== undefined && <Text style={styles.index}>{index + 1}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, active && styles.active]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <Text style={styles.muted}>{formatDuration(track.durationMs)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  index: { width: 24, opacity: 0.5, textAlign: 'right' },
  title: { fontSize: 16 },
  active: { color: '#e2483d', fontWeight: '700' },
  muted: { opacity: 0.6 },
});
