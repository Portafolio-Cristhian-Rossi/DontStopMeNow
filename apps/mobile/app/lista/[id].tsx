import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Text } from '../../src/ui/Text.tsx';
import { colors } from '../../src/ui/theme.ts';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { PlayButtons } from '../../src/components/PlayButtons.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds } = useApp();
  const player = usePlayer();
  const playlist = catalog
    ? libraryView(catalog, downloadedIds).playlists.find((p) => p.id === id)
    : undefined;
  if (!catalog || !playlist)
    return <Text style={{ padding: 24, color: colors.muted }}>Lista no encontrada</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = playlist.trackIds.flatMap((tid) => byId.get(tid) ?? []);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: playlist.name }} />
      <FlatList
        style={{ flex: 1 }}
        data={tracks}
        keyExtractor={(t, i) => `${i}-${t.id}`}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <PlayButtons trackIds={tracks.map((t) => t.id)} />
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
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
