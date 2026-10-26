import { Ionicons } from '@expo/vector-icons';
import { formatDuration, type Track } from '@dsmn/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { NameDialog } from '../../src/components/NameDialog.tsx';
import { PlayButtons } from '../../src/components/PlayButtons.tsx';
import { TrackActions } from '../../src/components/TrackActions.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { FAVORITES_ID, libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';
import { Button } from '../../src/ui/Button.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { colors, radius } from '../../src/ui/theme.ts';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalog, downloadedIds, renamePlaylist, deletePlaylist } = useApp();
  const player = usePlayer();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<Track | null>(null);
  const [renaming, setRenaming] = useState(false);
  const openMenu = useCallback((track: Track) => setMenu(track), []);
  const view = catalog ? libraryView(catalog, downloadedIds) : null;
  const isFavorites = id === FAVORITES_ID;
  // Del catálogo completo (no solo lo bajado): una lista recién creada en el celular puede estar vacía.
  const playlist = isFavorites ? null : catalog?.playlists.find((p) => p.id === id);

  if (!catalog || !view || (!isFavorites && !playlist))
    return <Text style={styles.missing}>Lista no encontrada</Text>;

  const byId = new Map(catalog.tracks.map((t) => [t.id, t]));
  const tracks = isFavorites
    ? view.favorites
    : playlist!.trackIds.flatMap((tid) => (downloadedIds.has(tid) ? (byId.get(tid) ?? []) : []));
  const missing = isFavorites ? 0 : playlist!.trackIds.length - tracks.length;
  const editable = playlist?.type === 'manual';

  const confirmDelete = () =>
    Alert.alert(
      'Borrar la lista',
      `Se borra «${playlist!.name}» también en la compu. Las canciones quedan.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => {
            deletePlaylist(playlist!.id);
            router.back();
          },
        },
      ],
    );
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
            {missing > 0 && (
              <Text style={styles.muted}>
                {missing === 1 ? '1 canción todavía no está' : `${missing} canciones todavía no están`} en el
                celular: se bajan al sincronizar.
              </Text>
            )}
            {editable && (
              <View style={styles.edit}>
                <Button title="Renombrar" icon="create-outline" onPress={() => setRenaming(true)} />
                <Button title="Borrar" icon="trash-outline" variant="danger" onPress={confirmDelete} />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isFavorites ? (
            <View style={styles.empty}>
              <Text style={styles.strong}>Todavía no hay favoritas en el celular</Text>
              <Text style={styles.muted}>
                Tocá el corazón en una canción, o marcá Favoritas en Descargas para tenerlas todas.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.strong}>La lista está vacía</Text>
              <Text style={styles.muted}>
                Agregá canciones con «Agregar a lista…» en el menú de cada una.
              </Text>
            </View>
          )
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
      <TrackActions
        track={menu}
        playlistId={editable ? playlist!.id : undefined}
        onClose={() => setMenu(null)}
      />
      {renaming && (
        <NameDialog
          title="Renombrar lista"
          initial={playlist!.name}
          confirmLabel="Guardar"
          onClose={() => setRenaming(false)}
          onSubmit={(name) => renamePlaylist(playlist!.id, name)}
        />
      )}
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
  edit: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
