import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ScreenHeader } from '../../src/components/ScreenHeader.tsx';
import { FAVORITES_ID, libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { colors, radius } from '../../src/ui/theme.ts';

const songs = (n: number) => (n === 1 ? '1 canción' : `${n} canciones`);

function ListCard({
  id,
  name,
  meta,
  favorites = false,
}: {
  id: string;
  name: string;
  meta: string;
  favorites?: boolean;
}) {
  return (
    <Link href={{ pathname: '/lista/[id]', params: { id } }} asChild>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityLabel={`${name}, ${meta}`}
      >
        <View style={[styles.art, favorites && styles.artFavorites]}>
          <Ionicons
            name={favorites ? 'heart' : 'list'}
            size={24}
            color={favorites ? colors.accentText : colors.textSoft}
          />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.faint} />
      </Pressable>
    </Link>
  );
}

/** Favoritas primero y después las listas bajadas al celular. */
export default function Listas() {
  const { catalog, downloadedIds } = useApp();
  const view = useMemo(
    () => (catalog ? libraryView(catalog, downloadedIds) : null),
    [catalog, downloadedIds],
  );
  const playlists = view?.playlists ?? [];
  const favorites = view?.favorites.length ?? 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Listas" subtitle="Lo que bajaste al celular, para escuchar sin conexión." />
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ListCard
              id={FAVORITES_ID}
              name="Favoritas"
              meta={favorites ? songs(favorites) : 'Tocá el corazón en la web y aparecen acá'}
              favorites
            />
            <Text style={styles.section} accessibilityRole="header">
              Tus listas
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.muted}>
            Todavía no bajaste ninguna lista. Marcalas en Descargas y sincronizá.
          </Text>
        }
        renderItem={({ item }) => (
          <ListCard id={item.id} name={item.name} meta={songs(item.trackIds.length)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  headerBlock: { gap: 10 },
  section: { marginTop: 14, fontSize: 19, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surface2 },
  art: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artFavorites: { backgroundColor: colors.accent },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted },
});
