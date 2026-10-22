import { searchKey } from '@dsmn/shared';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Cover } from '../../src/components/Cover.tsx';
import { TrackRow } from '../../src/components/TrackRow.tsx';
import { libraryView } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';

type Tab = 'albumes' | 'artistas' | 'listas' | 'canciones';
const TABS: [Tab, string][] = [
  ['albumes', 'Álbumes'],
  ['artistas', 'Artistas'],
  ['listas', 'Listas'],
  ['canciones', 'Canciones'],
];

export default function Biblioteca() {
  const { catalog, downloadedIds } = useApp();
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
          >
            <Text style={tab === key ? styles.tabTextActive : undefined}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={styles.search} placeholder="Buscar" value={query} onChangeText={setQuery} />
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
      {tab === 'listas' && (
        <FlatList
          data={view.playlists.filter((p) => matches(p.name))}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/lista/[id]', params: { id: item.id } }} asChild>
              <Pressable style={styles.row}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.muted}>{item.trackIds.length} canciones</Text>
              </Pressable>
            </Link>
          )}
        />
      )}
      {tab === 'canciones' && (
        <FlatList
          data={view.tracks.filter((t) => matches(t.title, t.artist))}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TrackRow track={item} />}
          initialNumToRender={30}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  tabs: { flexDirection: 'row', padding: 8, gap: 4 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: '#8883' },
  tabTextActive: { fontWeight: '700' },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#8884',
    borderRadius: 8,
    padding: 8,
  },
  filter: { paddingHorizontal: 16, paddingBottom: 8, opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  title: { fontSize: 16, flexShrink: 1 },
  muted: { opacity: 0.6 },
});
