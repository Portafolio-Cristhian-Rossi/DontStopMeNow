import { searchKey } from '@dsmn/shared';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Cover } from '../../src/components/Cover.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';
import { usePlayer } from '../../src/state/PlayerContext.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { TextInput } from '../../src/ui/TextInput.tsx';
import { colors } from '../../src/ui/theme.ts';

type Tab = 'albumes' | 'artistas' | 'canciones';
const TABS: [Tab, string][] = [
  ['albumes', 'Álbumes'],
  ['artistas', 'Artistas'],
  ['canciones', 'Canciones'],
];

export default function Biblioteca() {
  const { catalog, downloadedIds } = useApp();
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>('albumes');
  const [artist, setArtist] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const view = useMemo(
    () => (catalog ? libraryView(catalog, downloadedIds) : null),
    [catalog, downloadedIds],
  );

  if (!view || view.tracks.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Todavía no bajaste música. Elegí qué bajar en Descargas.</Text>
      </View>
    );
  }

  const q = searchKey(query.trim());
  const matches = (...texts: string[]) => !q || searchKey(texts.join(' ')).includes(q);
  const albums = view.albums.filter((a) => (!artist || a.artist === artist) && matches(a.title, a.artist));
  const songs = view.tracks.filter((t) => matches(t.title, t.artist));

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              setTab(key);
              setArtist(null);
            }}
            style={[styles.tab, tab === key && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={tab === key ? styles.tabTextActive : styles.tabText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.search}
        placeholder="Buscar en lo descargado"
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Buscar en lo descargado"
      />
      {artist && (
        <Pressable onPress={() => setArtist(null)}>
          <Text style={styles.filter}>{artist} · ver todos</Text>
        </Pressable>
      )}

      {tab === 'albumes' && (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/album/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.row}>
                <Cover coverId={item.coverId} title={item.title} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.muted}>
                    {item.artist} · {item.trackIds.length} canciones
                  </Text>
                </View>
              </Pressable>
            </Link>
          )}
        />
      )}
      {tab === 'artistas' && (
        <FlatList
          data={view.artists.filter((a) => matches(a.name))}
          keyExtractor={(a) => a.name}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                setArtist(item.name);
                setTab('albumes');
              }}
            >
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.muted}>
                {item.albumIds.length === 1 ? '1 álbum' : `${item.albumIds.length} álbumes`}
              </Text>
            </Pressable>
          )}
        />
      )}
      {tab === 'canciones' && (
        <FlatList
          data={songs}
          keyExtractor={(t) => t.id}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              onPress={() =>
                player.playList(
                  songs.map((t) => t.id),
                  index,
                )
              }
            />
          )}
          initialNumToRender={30}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  tabs: {
    flexDirection: 'row',
    gap: 24,
    marginHorizontal: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabActive: { borderColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '500' },
  tabTextActive: { fontWeight: '600' },
  search: { marginHorizontal: 16, marginBottom: 8 },
  filter: { paddingHorizontal: 16, paddingBottom: 8, color: colors.textSoft },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  muted: { color: colors.muted },
});
