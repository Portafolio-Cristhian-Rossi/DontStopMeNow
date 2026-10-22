import { formatDuration, type Track } from '@dsmn/shared';
import { StyleSheet, Text, View } from 'react-native';

export function TrackRow({ track, index }: { track: Track; index?: number }) {
  return (
    <View style={styles.row}>
      {index !== undefined && <Text style={styles.index}>{index + 1}</Text>}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <Text style={styles.muted}>{formatDuration(track.durationMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  index: { width: 24, opacity: 0.5, textAlign: 'right' },
  title: { fontSize: 16 },
  muted: { opacity: 0.6 },
});
