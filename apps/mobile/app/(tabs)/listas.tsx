import { Ionicons } from '@expo/vector-icons';
import { coverColors, formatDuration, type Playlist, type Selection, type Track } from '@dsmn/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover } from '../../src/components/Cover.tsx';
import { FAVORITES_ID, libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';
import { Button } from '../../src/ui/Button.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { TextInput } from '../../src/ui/TextInput.tsx';
import { colors, radius, TOUCH } from '../../src/ui/theme.ts';

/** Cuántas favoritas se muestran en la tarjeta; el resto, en la pantalla de Favoritas. */
const FAVORITES_SHOWN = 6;
const MAX_NAME = 60;
/** Fondo de las listas de carpeta (las manuales toman un color de su nombre). */
const FOLDER_TILE = '#3A4250';

const songs = (n: number) => (n === 1 ? '1 canción' : `${n} canciones`);

interface ListRow {
  playlist: Playlist;
  meta: string;
  state: string;
  stateColor: string;
  /** Hay algo para escuchar o editar en el celular; si no, se manda a Descargas a marcarla. */
  openable: boolean;
}

function describeList(playlist: Playlist, downloaded: Set<string>, selection: Selection[]): ListRow {
  const total = playlist.trackIds.length;
  const onPhone = playlist.trackIds.filter((id) => downloaded.has(id)).length;
  const marked = selection.some((s) => s.kind === 'playlist' && s.id === playlist.id);
  const manual = playlist.type === 'manual';
  const meta = manual
    ? `Elegida a mano · ${songs(total)}`
    : `${playlist.folder?.relPath || 'Carpeta'} · se actualiza sola`;
  let state: string;
  let stateColor: string = colors.muted;
  if (manual && total === 0) state = 'Vacía: sumale canciones';
  else if (total > 0 && onPhone === total) {
    state = 'En el celular';
    stateColor = colors.okText;
  } else if (onPhone > 0) state = `${onPhone} de ${total} en el celular`;
  else if (marked) state = 'Se baja al sincronizar';
  else {
    state = 'Sin bajar · marcala en Descargas';
    stateColor = colors.warnText;
  }
  return { playlist, meta, state, stateColor, openable: manual || onPhone > 0 };
}

/** Formulario para crear una lista, dentro de la pantalla (como en el diseño). */
function NewListForm({ onClose }: { onClose(): void }) {
  const { createPlaylist } = useApp();
  const [name, setName] = useState('');
  const valid = name.trim().length > 0;
  const create = () => {
    if (!valid) return;
    createPlaylist(name);
    onClose();
  };
  return (
    <View style={styles.form}>
      <Text font="display" style={styles.formTitle} accessibilityRole="header">
        Nueva lista
      </Text>
      <View style={styles.field}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nombre de tu lista"
          accessibilityLabel="Nombre de la lista"
          autoFocus
          maxLength={MAX_NAME}
          returnKeyType="done"
          onSubmitEditing={create}
        />
        <Text style={styles.muted}>
          Para sumarle canciones, mantené apretada cualquiera y elegí «Agregar a lista…».
        </Text>
      </View>
      <View style={styles.formButtons}>
        <Button title="Cancelar" onPress={onClose} style={styles.flex} />
        <Button
          title="Crear lista"
          variant="primary"
          disabled={!valid}
          onPress={create}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

/** Favoritas bajadas, con reproducir y el corazón para sacarlas. */
function FavoritesCard({ favorites }: { favorites: Track[] }) {
  const { setFavorite } = useApp();
  const player = usePlayer();
  const ids = favorites.map((t) => t.id);
  const shown = favorites.slice(0, FAVORITES_SHOWN);
  return (
    <View style={styles.favCard}>
      <View style={styles.favHead}>
        <View style={styles.favArt} importantForAccessibility="no-hide-descendants">
          <Ionicons name="heart" size={30} color={colors.accentText} />
        </View>
        <View style={styles.flex}>
          <Text font="display" style={styles.favTitle} accessibilityRole="header">
            Favoritas
          </Text>
          <Text style={styles.muted}>Se arma sola con tus corazones · {songs(favorites.length)}</Text>
        </View>
        {favorites.length > 0 && (
          <Pressable
            onPress={() => player.playList(ids, 0)}
            style={({ pressed }) => [styles.favPlay, pressed && styles.dim]}
            accessibilityRole="button"
            accessibilityLabel="Reproducir Favoritas"
          >
            <Ionicons name="play" size={22} color={colors.accentText} />
          </Pressable>
        )}
      </View>
      {shown.map((t, i) => (
        <View key={t.id} style={styles.favRow}>
          <Pressable
            onPress={() => player.playList(ids, i)}
            style={({ pressed }) => [styles.favMain, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Reproducir ${t.title}, ${t.artist}`}
          >
            <Cover coverId={t.coverId} title={t.title} size={40} />
            <View style={styles.flex}>
              <Text style={styles.favSong} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {t.artist} · {formatDuration(t.durationMs)}
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => setFavorite(t.id, false)}
            style={({ pressed }) => [styles.unfav, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${t.title} de Favoritas`}
          >
            <Ionicons name="heart" size={20} color={colors.accent} />
          </Pressable>
        </View>
      ))}
      {favorites.length > FAVORITES_SHOWN && (
        <Pressable
          onPress={() => router.push({ pathname: '/lista/[id]', params: { id: FAVORITES_ID } })}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          accessibilityRole="link"
        >
          <Text style={styles.moreText}>Ver las {favorites.length}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
        </Pressable>
      )}
      {favorites.length === 0 && (
        <View style={styles.favEmpty}>
          <Text style={styles.strong}>Todavía no hay favoritas</Text>
          <Text style={styles.muted}>Tocá el corazón en cualquier canción y aparece acá.</Text>
        </View>
      )}
    </View>
  );
}

function ListItem({ row }: { row: ListRow }) {
  const { playlist } = row;
  const folder = playlist.type === 'folder';
  return (
    <Pressable
      onPress={() =>
        row.openable
          ? router.push({ pathname: '/lista/[id]', params: { id: playlist.id } })
          : router.push('/descargas')
      }
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel={`${playlist.name}, ${row.meta}, ${row.state}`}
    >
      <View
        style={[
          styles.listArt,
          { backgroundColor: folder ? FOLDER_TILE : coverColors(playlist.name).background },
        ]}
      >
        <Ionicons name={folder ? 'folder-outline' : 'list'} size={24} color={colors.text} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {row.meta}
        </Text>
        <Text style={[styles.state, { color: row.stateColor }]} numberOfLines={1}>
          {row.state}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

/** Favoritas arriba y después todas las listas de la compu, con su estado en el celular. */
export default function Listas() {
  const { catalog, downloadedIds, selection } = useApp();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const view = useMemo(
    () => (catalog ? libraryView(catalog, downloadedIds) : null),
    [catalog, downloadedIds],
  );
  const rows = useMemo(
    () => (catalog?.playlists ?? []).map((p) => describeList(p, downloadedIds, selection)),
    [catalog, downloadedIds, selection],
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.playlist.id}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.top}>
            <View style={styles.header}>
              <Text font="display" style={styles.title} accessibilityRole="header">
                Listas
              </Text>
              <Button title="Nueva lista" icon="add" disabled={creating} onPress={() => setCreating(true)} />
            </View>
            {creating && <NewListForm onClose={() => setCreating(false)} />}
            <FavoritesCard favorites={view?.favorites ?? []} />
            <Text font="display" style={styles.section} accessibilityRole="header">
              Tus listas
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.muted, styles.pad]}>
            Todavía no hay listas. Creá una acá o en la web de la compu.
          </Text>
        }
        renderItem={({ item }) => <ListItem row={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 4 },
  top: { gap: 20, marginBottom: 4 },
  flex: { flex: 1, minWidth: 0 },
  pad: { paddingHorizontal: 4 },
  dim: { opacity: 0.8 },
  pressed: { backgroundColor: colors.surface2 },
  muted: { color: colors.muted, fontSize: 13 },
  strong: { fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  title: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  form: {
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#2A2B30',
  },
  formTitle: { fontSize: 19, fontWeight: '700' },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  formButtons: { flexDirection: 'row', gap: 10 },
  favCard: {
    gap: 6,
    paddingTop: 14,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  favHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingBottom: 6 },
  favArt: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favTitle: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  favPlay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  favMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 6,
    borderRadius: radius.md,
  },
  favSong: { fontSize: 14, fontWeight: '500' },
  unfav: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    minHeight: TOUCH,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  moreText: { color: colors.textSoft, fontWeight: '600', fontSize: 14 },
  favEmpty: { gap: 4, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 12 },
  section: { fontSize: 19, fontWeight: '700', paddingHorizontal: 4 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  listArt: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontWeight: '600' },
  state: { fontSize: 12, fontWeight: '600' },
});
