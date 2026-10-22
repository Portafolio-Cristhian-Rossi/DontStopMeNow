import { formatBytes, type Selection } from '@dsmn/shared';
import { Button, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { entrySize, selectionSummary } from '../../src/core/library.ts';
import { useApp } from '../../src/state/AppContext.tsx';

interface Row {
  key: string;
  sel: Selection;
  title: string;
  subtitle: string;
  bytes: number;
}

export default function Descargas() {
  const { catalog, selection, sync, toggle, startSync, stopSync, freeBytes, downloadedIds } = useApp();

  if (!catalog) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Conectate al WiFi de tu casa para ver tu música.</Text>
        {sync.error && <Text style={styles.error}>{sync.error}</Text>}
        <Button
          title={sync.running ? 'Buscando el servidor…' : 'Reintentar'}
          disabled={sync.running}
          onPress={() => void startSync()}
        />
      </View>
    );
  }

  const isSelected = (sel: Selection) => selection.some((s) => s.kind === sel.kind && s.id === sel.id);
  const summary = selectionSummary(catalog, selection);
  const sections: { title: string; data: Row[] }[] = [
    {
      title: 'Listas',
      data: catalog.playlists.map((p) => ({
        key: `p-${p.id}`,
        sel: { kind: 'playlist', id: p.id },
        title: p.name,
        subtitle: `${p.type === 'manual' ? 'Lista' : 'Carpeta'} · ${p.trackIds.length} canciones`,
        bytes: entrySize(catalog, p.trackIds),
      })),
    },
    {
      title: 'Álbumes',
      data: catalog.albums.map((a) => ({
        key: `a-${a.id}`,
        sel: { kind: 'album', id: a.id },
        title: a.title,
        subtitle: `${a.artist} · ${a.trackIds.length} canciones`,
        bytes: entrySize(catalog, a.trackIds),
      })),
    },
  ].filter((s) => s.data.length > 0) as { title: string; data: Row[] }[];

  const { progress, report } = sync;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text>
          Seleccionado: {summary.trackCount} canciones · {formatBytes(summary.bytes)} · Libre:{' '}
          {formatBytes(freeBytes())}
        </Text>
        <Text style={styles.muted}>{downloadedIds.size} canciones en el celular</Text>
        {sync.running ? (
          <Button title="Detener" onPress={stopSync} />
        ) : (
          <Button title="Sincronizar" onPress={() => void startSync()} />
        )}
        {sync.running && progress?.phase === 'downloading' && (
          <Text>
            Bajando {Math.min(progress.done + 1, progress.total)} de {progress.total} ·{' '}
            {formatBytes(progress.bytesTotal - progress.bytesDone)} restantes
          </Text>
        )}
        {sync.running && progress?.phase !== 'downloading' && (
          <Text style={styles.muted}>Sincronizando…</Text>
        )}
        {report && (
          <Text>
            {report.paused ? 'En pausa' : 'Listo'}: {report.downloaded} bajadas, {report.deleted} borradas
          </Text>
        )}
        {report?.failed.map((f) => (
          <Text key={f.trackId} style={styles.error}>
            {catalog.tracks.find((t) => t.id === f.trackId)?.title ?? f.trackId}: {f.error}
          </Text>
        ))}
        {sync.error && <Text style={styles.error}>{sync.error}</Text>}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.key}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.muted}>
                {item.subtitle} · {formatBytes(item.bytes)}
              </Text>
            </View>
            <Switch value={isSelected(item.sel)} onValueChange={() => toggle(item.sel)} />
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.muted, { padding: 16 }]}>El servidor todavía no tiene música.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  header: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#8886' },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  title: { fontSize: 16 },
  muted: { opacity: 0.6 },
  error: { color: '#d33' },
});
