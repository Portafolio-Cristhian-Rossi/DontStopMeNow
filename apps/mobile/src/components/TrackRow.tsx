import { Ionicons } from '@expo/vector-icons';
import { formatDuration, type Track } from '@dsmn/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCurrentTrackId } from '../state/PlayerContext.tsx';
import { Text } from '../ui/Text.tsx';
import { colors, TOUCH } from '../ui/theme.ts';
import { Cover } from './Cover.tsx';

interface Props {
  track: Track;
  /** Número a la izquierda (posición en el álbum o la lista); sin número, la portada chica. */
  number?: number;
  /** Tocar la fila: normalmente reproduce la lista visible desde esta canción. */
  onPress(): void;
  /** Abre el menú de la canción (botón "⋯" o mantener apretada la fila). */
  onMenu(track: Track): void;
  /** Texto debajo del título; por defecto, el artista. */
  meta?: string;
}

function Equalizer() {
  return (
    <View style={styles.eq} accessibilityLabel="Sonando">
      <View style={[styles.bar, { height: 9 }]} />
      <View style={[styles.bar, { height: 14 }]} />
      <View style={[styles.bar, { height: 6 }]} />
    </View>
  );
}

/** Fila de canción: número o portada, título, corazón si es favorita y el menú "⋯". */
export const TrackRow = memo(function TrackRow({ track, number, onPress, onMenu, meta }: Props) {
  const active = useCurrentTrackId() === track.id;
  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <Pressable
        style={styles.main}
        onPress={onPress}
        onLongPress={() => onMenu(track)}
        accessibilityRole="button"
        accessibilityLabel={`Reproducir ${track.title}`}
        accessibilityHint="Mantené apretado para más opciones"
      >
        <View style={styles.lead}>
          {active ? (
            <Equalizer />
          ) : number !== undefined ? (
            <Text font="mono" style={styles.number}>
              {String(number).padStart(2, '0')}
            </Text>
          ) : (
            <Cover coverId={track.coverId} title={track.title} size={44} />
          )}
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta ?? `${track.artist} · ${formatDuration(track.durationMs)}`}
          </Text>
        </View>
        {track.favoritedAt ? (
          <Ionicons name="heart" size={16} color={colors.accent} accessibilityLabel="Favorita" />
        ) : null}
      </Pressable>
      <Pressable
        style={styles.more}
        onPress={() => onMenu(track)}
        accessibilityRole="button"
        accessibilityLabel={`Más opciones para ${track.title}`}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingLeft: 12, borderRadius: 14 },
  rowActive: { backgroundColor: colors.surface },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  lead: { width: 44, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 13, color: colors.faint },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '500' },
  titleActive: { color: colors.accent, fontWeight: '600' },
  meta: { fontSize: 13, color: colors.muted },
  more: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.accent },
});
