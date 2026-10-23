import { formatDuration } from '@dsmn/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Cover } from '../../src/components/Cover.tsx';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { PlayButtons } from '../../src/components/PlayButtons.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds } = useApp();
  const player = usePlayer();
  const album = catalog ? libraryView(catalog, downloadedIds).albums.find((a) => a.id === id) : undefined;
  if (!catalog || !album) return <Text style={styles.empty}>Álbum no encontrado</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = album.trackIds.flatMap((tid) => byId.get(tid) ?? []);
  const total = tracks.reduce((s, t) => s + t.durationMs, 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: album.title }} />
      <FlatList
        style={{ flex: 1 }}
        data={tracks}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Cover coverId={album.coverId} title={album.title} size={120} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{album.title}</Text>
              <Text style={styles.muted}>
                {[album.artist, album.year, `${tracks.length} canciones`, formatDuration(total)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <PlayButtons trackIds={tracks.map((t) => t.id)} />
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={item.trackNo ? item.trackNo - 1 : undefined}
            onPress={() =>
              player.playList(
                tracks.map((t) => t.id),
                index,
              )
            }
          />
        )}
      />
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 24, opacity: 0.6 },
  header: { flexDirection: 'row', gap: 16, padding: 16, alignItems: 'flex-end' },
  title: { fontSize: 22, fontWeight: '700' },
  muted: { opacity: 0.6 },
});
