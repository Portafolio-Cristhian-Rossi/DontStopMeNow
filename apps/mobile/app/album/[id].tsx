import { formatDuration, type Track } from '@dsmn/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover } from '../../src/components/Cover.tsx';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { PlayButtons } from '../../src/components/PlayButtons.tsx';
import { TrackActions } from '../../src/components/TrackActions.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { colors } from '../../src/ui/theme.ts';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds } = useApp();
  const player = usePlayer();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<Track | null>(null);
  const openMenu = useCallback((track: Track) => setMenu(track), []);
  const album = catalog ? libraryView(catalog, downloadedIds).albums.find((a) => a.id === id) : undefined;
  if (!catalog || !album) return <Text style={styles.missing}>Álbum no encontrado</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = album.trackIds.flatMap((tid) => byId.get(tid) ?? []);
  const ids = tracks.map((t) => t.id);
  const total = tracks.reduce((s, t) => s + t.durationMs, 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '' }} />
      <FlatList
        style={styles.screen}
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Cover coverId={album.coverId} title={album.title} size={220} />
            <View style={styles.info}>
              <Text style={styles.eyebrow}>Álbum</Text>
              <Text font="display" style={styles.title} accessibilityRole="header">
                {album.title}
              </Text>
              <Text style={styles.details}>
                {[album.artist, album.year, `${tracks.length} canciones`, formatDuration(total)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <PlayButtons trackIds={ids} />
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            number={item.trackNo ?? index + 1}
            meta={formatDuration(item.durationMs)}
            onMenu={openMenu}
            onPress={() => player.playList(ids, index)}
          />
        )}
      />
      <TrackActions track={menu} showAlbum={false} onClose={() => setMenu(null)} />
      <MiniPlayer standalone />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  missing: { padding: 24, color: colors.muted },
  list: { paddingHorizontal: 4, paddingBottom: 24 },
  header: { alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  info: { alignItems: 'center', gap: 4 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 32 },
  details: { color: colors.textSoft, textAlign: 'center' },
});
