import { Ionicons } from '@expo/vector-icons';
import { formatDuration, type Track } from '@dsmn/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { PlayButtons } from '../../src/components/PlayButtons.tsx';
import { TrackActions } from '../../src/components/TrackActions.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { FAVORITES_ID, libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { colors, radius } from '../../src/ui/theme.ts';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds } = useApp();
  const player = usePlayer();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<Track | null>(null);
  const openMenu = useCallback((track: Track) => setMenu(track), []);
  const view = catalog ? libraryView(catalog, downloadedIds) : null;
  const isFavorites = id === FAVORITES_ID;
  const playlist = isFavorites ? null : view?.playlists.find((p) => p.id === id);

  if (!catalog || !view || (!isFavorites && !playlist))
    return <Text style={styles.missing}>Lista no encontrada</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = isFavorites ? view.favorites : playlist!.trackIds.flatMap((tid) => byId.get(tid) ?? []);
  const ids = tracks.map((t) => t.id);
  const total = tracks.reduce((s, t) => s + t.durationMs, 0);
  const name = isFavorites ? 'Favoritas' : playlist!.name;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '' }} />
      <FlatList
        style={styles.screen}
        data={tracks}
        keyExtractor={(t, i) => `${i}-${t.id}`}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.art, isFavorites && styles.artFavorites]}>
              <Ionicons
                name={isFavorites ? 'heart' : 'list'}
                size={56}
                color={isFavorites ? colors.accentText : colors.textSoft}
              />
            </View>
            <Text style={styles.eyebrow}>{isFavorites ? 'Se arma sola con el corazón' : 'Lista'}</Text>
            <Text font="display" style={styles.title} accessibilityRole="header">
              {name}
            </Text>
            <Text style={styles.details}>
              {tracks.length} canciones · {formatDuration(total)}
            </Text>
            {tracks.length > 0 && <PlayButtons trackIds={ids} />}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.strong}>Todavía no hay favoritas en el celular</Text>
            <Text style={styles.muted}>
              Marcá canciones con el corazón en la web y sincronizá las que quieras escuchar acá.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            number={index + 1}
            onMenu={openMenu}
            onPress={() => player.playList(ids, index)}
          />
        )}
      />
      <TrackActions track={menu} onClose={() => setMenu(null)} />
      <MiniPlayer standalone />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  missing: { padding: 24, color: colors.muted },
  list: { paddingHorizontal: 4, paddingBottom: 24 },
  header: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  art: {
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  artFavorites: { backgroundColor: colors.accent },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 32 },
  details: { color: colors.textSoft },
  empty: { alignItems: 'center', gap: 6, padding: 24 },
  strong: { fontWeight: '600', textAlign: 'center' },
  muted: { color: colors.muted, textAlign: 'center' },
});
