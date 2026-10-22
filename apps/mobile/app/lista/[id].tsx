import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, Text } from 'react-native';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds } = useApp();
  const playlist = catalog
    ? libraryView(catalog, downloadedIds).playlists.find((p) => p.id === id)
    : undefined;
  if (!catalog || !playlist) return <Text style={{ padding: 24, opacity: 0.6 }}>Lista no encontrada</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = playlist.trackIds.flatMap((tid) => byId.get(tid) ?? []);

  return (
    <>
      <Stack.Screen options={{ title: playlist.name }} />
      <FlatList
        data={tracks}
        keyExtractor={(t, i) => `${i}-${t.id}`}
        renderItem={({ item, index }) => <TrackRow track={item} index={index} />}
      />
    </>
  );
}
