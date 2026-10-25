import { Ionicons } from '@expo/vector-icons';
import { initials, searchKey, type Track } from '@dsmn/shared';
import { Link, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Cover } from '../../src/components/Cover.tsx';
import { ScreenHeader } from '../../src/components/ScreenHeader.tsx';
import { TrackActions } from '../../src/components/TrackActions.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';
import { Button } from '../../src/ui/Button.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { TextInput } from '../../src/ui/TextInput.tsx';
import { colors, radius, TOUCH } from '../../src/ui/theme.ts';

type Tab = 'albumes' | 'artistas' | 'canciones';
const TABS: [Tab, string][] = [
  ['albumes', 'Álbumes'],
  ['artistas', 'Artistas'],
  ['canciones', 'Canciones'],
];
const GAP = 12;
const PADDING = 16;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Biblioteca() {
  const { catalog, downloadedIds } = useApp();
  const player = usePlayer();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('albumes');
  const [artist, setArtist] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<Track | null>(null);
  const view = useMemo(
    () => (catalog ? libraryView(catalog, downloadedIds) : null),
    [catalog, downloadedIds],
  );

  const q = searchKey(query.trim());
  const matches = useCallback((...texts: string[]) => !q || searchKey(texts.join(' ')).includes(q), [q]);
  const albums = useMemo(
    () => (view?.albums ?? []).filter((a) => (!artist || a.artist === artist) && matches(a.title, a.artist)),
    [view, artist, matches],
  );
  const songs = useMemo(
    () => (view?.tracks ?? []).filter((t) => matches(t.title, t.artist)),
    [view, matches],
  );
  const artists = useMemo(() => (view?.artists ?? []).filter((a) => matches(a.name)), [view, matches]);
  const openMenu = useCallback((track: Track) => setMenu(track), []);

  if (!view || view.tracks.length === 0) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Biblioteca" />
        <View style={styles.empty}>
          <Ionicons name="cloud-download-outline" size={40} color={colors.faint} />
          <Text style={styles.strong}>Todavía no bajaste música</Text>
          <Text style={styles.muted}>Elegí qué querés tener en el celular y sincronizá.</Text>
          <Button title="Ir a Descargas" variant="primary" onPress={() => router.push('/descargas')} />
        </View>
      </View>
    );
  }

  const cell = (width - PADDING * 2 - GAP) / 2;
  const nothing =
    (tab === 'albumes' && albums.length === 0) ||
    (tab === 'artistas' && artists.length === 0) ||
    (tab === 'canciones' && songs.length === 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={artist ?? 'Biblioteca'} />
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar canción, artista o álbum"
          accessibilityLabel="Buscar en lo descargado"
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query !== '' && (
          <Pressable
            onPress={() => setQuery('')}
            style={styles.clear}
            accessibilityRole="button"
            accessibilityLabel="Borrar la búsqueda"
          >
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              setTab(key);
              setArtist(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            style={[styles.tab, tab === key && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {artist && (
        <Pressable onPress={() => setArtist(null)} style={styles.filter} accessibilityRole="button">
          <Ionicons name="close" size={16} color={colors.textSoft} />
          <Text style={styles.filterText}>Ver todos los artistas</Text>
        </Pressable>
      )}

      {nothing ? (
        <View style={styles.empty}>
          <Text style={styles.strong}>Nada descargado coincide con «{query}»</Text>
          <Text style={styles.muted}>Si está en tu compu, marcalo en Descargas y sincronizá.</Text>
          <Button title="Ir a Descargas" onPress={() => router.push('/descargas')} />
        </View>
      ) : tab === 'albumes' ? (
        <FlatList
          key="albumes"
          data={albums}
          numColumns={2}
          keyExtractor={(a) => a.id}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/album/[id]', params: { id: item.id } }} asChild>
              <Pressable
                style={({ pressed }) => [{ width: cell }, pressed && styles.pressed]}
                accessibilityLabel={`${item.title}, ${item.artist}, ${plural(item.trackIds.length, 'canción', 'canciones')}`}
              >
                <View>
                  <Cover coverId={item.coverId} title={item.title} size={cell} />
                  <View style={styles.count} importantForAccessibility="no-hide-descendants">
                    <Ionicons name="musical-note" size={11} color={colors.text} />
                    <Text font="mono" style={styles.countText}>
                      {item.trackIds.length}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.cardTitle, { width: cell }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.cardMeta, { width: cell }]} numberOfLines={1}>
                  {item.artist}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      ) : tab === 'artistas' ? (
        <FlatList
          key="artistas"
          data={artists}
          keyExtractor={(a) => a.name}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.artist, pressed && styles.pressed]}
              onPress={() => {
                setArtist(item.name);
                setTab('albumes');
              }}
              accessibilityRole="button"
            >
              <View style={styles.avatar}>
                <Text font="display" style={styles.avatarText}>
                  {initials(item.name)}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.strong} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.muted}>{plural(item.albumIds.length, 'álbum', 'álbumes')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faint} />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="canciones"
          data={songs}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          initialNumToRender={20}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              onMenu={openMenu}
              onPress={() =>
                player.playList(
                  songs.map((t) => t.id),
                  index,
                )
              }
            />
          )}
        />
      )}
      <TrackActions track={menu} onClose={() => setMenu(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '600', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  search: { marginHorizontal: PADDING, marginBottom: 12, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  searchInput: { paddingLeft: 42, paddingRight: 44, borderRadius: radius.pill },
  clear: {
    position: 'absolute',
    right: 2,
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: PADDING,
    marginBottom: 12,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.text },
  tabText: { fontWeight: '600', color: colors.textSoft },
  tabTextOn: { color: '#141414' },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: TOUCH,
    marginHorizontal: PADDING,
  },
  filterText: { color: colors.textSoft, fontWeight: '500' },
  grid: { paddingHorizontal: PADDING, paddingBottom: 24, gap: 18 },
  cardTitle: { marginTop: 8, fontWeight: '600' },
  cardMeta: { fontSize: 13, color: colors.muted },
  count: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,15,17,0.78)',
  },
  countText: { fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  list: { paddingHorizontal: 4, paddingBottom: 24 },
  artist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '800', fontSize: 16 },
});
