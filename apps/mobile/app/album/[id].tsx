import { formatDuration } from '@dsmn/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Cover } from '../../src/components/Cover.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds } = useApp();
  const album = catalog ? libraryView(catalog, downloadedIds).albums.find((a) => a.id === id) : undefined;
  if (!catalog || !album) return <Text style={styles.empty}>Álbum no encontrado</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = album.trackIds.flatMap((tid) => byId.get(tid) ?? []);
  const total = tracks.reduce((s, t) => s + t.durationMs, 0);

  return (
    <>
      <Stack.Screen options={{ title: album.title }} />
      <FlatList
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
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TrackRow track={item} index={item.trackNo ? item.trackNo - 1 : undefined} />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 24, opacity: 0.6 },
  header: { flexDirection: 'row', gap: 16, padding: 16, alignItems: 'flex-end' },
  title: { fontSize: 22, fontWeight: '700' },
  muted: { opacity: 0.6 },
});
