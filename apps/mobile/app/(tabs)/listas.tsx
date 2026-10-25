import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { colors, radius } from '../../src/ui/theme.ts';

/** Las listas bajadas al celular (lo que antes era una sub-pestaña de Biblioteca). */
export default function Listas() {
  const { catalog, downloadedIds } = useApp();
  const view = useMemo(
    () => (catalog ? libraryView(catalog, downloadedIds) : null),
    [catalog, downloadedIds],
  );
  const playlists = view?.playlists ?? [];

  if (playlists.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          Todavía no bajaste ninguna lista. Marcalas en Descargas y sincronizá.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={playlists}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/lista/[id]', params: { id: item.id } }} asChild>
          <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.art}>
              <Ionicons name="list" size={22} color={colors.textSoft} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.muted}>
                {item.trackIds.length === 1 ? '1 canción' : `${item.trackIds.length} canciones`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.faint} />
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 10 },
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
  title: { fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, textAlign: 'left' },
});
