import { formatBytes, type Catalog, type Selection } from '@dsmn/shared';
import { memo, useCallback, useMemo } from 'react';
import { Button, SectionList, StyleSheet, Switch, Text, View } from 'react-native';
import { selectionSummary, sizeLookup } from '../../src/core/library.ts';
import { useApp, useSyncProgress } from '../../src/state/AppContext.tsx';

const MAX_FAILURES_SHOWN = 5;

interface Row {
  key: string;
  sel: Selection;
  title: string;
  subtitle: string;
  bytes: number;
}

function buildSections(catalog: Catalog): { title: string; data: Row[] }[] {
  const size = sizeLookup(catalog);
  const sections = [
    {
      title: 'Listas',
      data: catalog.playlists.map((p): Row => ({
        key: `p-${p.id}`,
        sel: { kind: 'playlist', id: p.id },
        title: p.name,
        subtitle: `${p.type === 'manual' ? 'Lista' : 'Carpeta'} · ${p.trackIds.length} canciones`,
        bytes: size(p.trackIds),
      })),
    },
    {
      title: 'Álbumes',
      data: catalog.albums.map((a): Row => ({
        key: `a-${a.id}`,
        sel: { kind: 'album', id: a.id },
        title: a.title,
        subtitle: `${a.artist} · ${a.trackIds.length} canciones`,
        bytes: size(a.trackIds),
      })),
    },
  ];
  return sections.filter((s) => s.data.length > 0);
}

/** Solo esta línea se re-renderiza con cada actualización de progreso. */
function ProgressLine() {
  const progress = useSyncProgress();
  if (!progress) return <Text style={styles.muted}>Sincronizando…</Text>;
  if (progress.phase !== 'downloading') return <Text style={styles.muted}>Sincronizando…</Text>;
  return (
    <Text>
      Bajando {Math.min(progress.done + 1, progress.total)} de {progress.total} ·{' '}
      {formatBytes(progress.bytesTotal - progress.bytesDone)} restantes
    </Text>
  );
}

const EntryRow = memo(function EntryRow({
  row,
  selected,
  onToggle,
}: {
  row: Row;
  selected: boolean;
  onToggle(sel: Selection): void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{row.title}</Text>
        <Text style={styles.muted}>
          {row.subtitle} · {formatBytes(row.bytes)}
        </Text>
      </View>
      <Switch value={selected} onValueChange={() => onToggle(row.sel)} />
    </View>
  );
});

export default function Descargas() {
  const { catalog, selection, sync, toggle, startSync, stopSync, freeBytes, downloadedIds } = useApp();
  const sections = useMemo(() => (catalog ? buildSections(catalog) : []), [catalog]);
  const summary = useMemo(
    () => (catalog ? selectionSummary(catalog, selection) : null),
    [catalog, selection],
  );
  const selectedKeys = useMemo(() => new Set(selection.map((s) => `${s.kind}:${s.id}`)), [selection]);
  const titles = useMemo(() => new Map((catalog?.tracks ?? []).map((t) => [t.id, t.title])), [catalog]);
  const onToggle = useCallback((sel: Selection) => toggle(sel), [toggle]);

  if (!catalog || !summary) {
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

  const { report } = sync;
  const failures = report?.failed ?? [];

  const header = (
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
      {sync.running && <ProgressLine />}
      {report && (
        <Text>
          {report.paused ? 'En pausa' : 'Listo'}: {report.downloaded} bajadas, {report.deleted} borradas
        </Text>
      )}
      {failures.slice(0, MAX_FAILURES_SHOWN).map((f) => (
        <Text key={f.trackId} style={styles.error}>
          {titles.get(f.trackId) ?? f.trackId}: {f.error}
        </Text>
      ))}
      {failures.length > MAX_FAILURES_SHOWN && (
        <Text style={styles.error}>
          y {failures.length - MAX_FAILURES_SHOWN} canciones más no se pudieron bajar
        </Text>
      )}
      {sync.error && <Text style={styles.error}>{sync.error}</Text>}
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      renderItem={({ item }) => (
        <EntryRow
          row={item}
          selected={selectedKeys.has(`${item.sel.kind}:${item.sel.id}`)}
          onToggle={onToggle}
        />
      )}
      initialNumToRender={25}
      ListEmptyComponent={
        <Text style={[styles.muted, { padding: 16 }]}>El servidor todavía no tiene música.</Text>
      }
    />
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
