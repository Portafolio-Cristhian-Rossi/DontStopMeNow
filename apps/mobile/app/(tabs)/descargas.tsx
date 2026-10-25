import { Ionicons } from '@expo/vector-icons';
import { formatBytes, searchKey, type Catalog, type Selection } from '@dsmn/shared';
import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Cover } from '../../src/components/Cover.tsx';
import { ScreenHeader } from '../../src/components/ScreenHeader.tsx';
import { folderLabel } from '../../src/core/fileNames.ts';
import { libraryView, selectionSummary, sizeLookup } from '../../src/core/library.ts';
import { useApp, useSyncProgress } from '../../src/state/AppContext.tsx';
import { Button } from '../../src/ui/Button.tsx';
import { Text } from '../../src/ui/Text.tsx';
import { TextInput } from '../../src/ui/TextInput.tsx';
import { colors, radius, TOUCH } from '../../src/ui/theme.ts';

const MAX_FAILURES_SHOWN = 5;
const PADDING = 16;

type Tab = 'albumes' | 'listas';

interface Row {
  key: string;
  sel: Selection;
  title: string;
  subtitle: string;
  coverId: string | null;
  bytes: number;
  /** Todas sus canciones ya están en el celular. */
  onPhone: boolean;
  search: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function buildRows(catalog: Catalog, downloaded: Set<string>): Record<Tab, Row[]> {
  const size = sizeLookup(catalog);
  const covers = new Map(catalog.tracks.map((t) => [t.id, t.coverId]));
  const all = (ids: string[]) => ids.length > 0 && ids.every((id) => downloaded.has(id));
  return {
    albumes: catalog.albums.map((a) => ({
      key: `a-${a.id}`,
      sel: { kind: 'album', id: a.id },
      title: a.title,
      subtitle: `${a.artist} · ${plural(a.trackIds.length, 'canción', 'canciones')}`,
      coverId: a.coverId,
      bytes: size(a.trackIds),
      onPhone: all(a.trackIds),
      search: searchKey(`${a.title} ${a.artist}`),
    })),
    listas: catalog.playlists.map((p) => ({
      key: `p-${p.id}`,
      sel: { kind: 'playlist', id: p.id },
      title: p.name,
      subtitle: `${p.type === 'manual' ? 'Lista' : 'Carpeta'} · ${plural(p.trackIds.length, 'canción', 'canciones')}`,
      coverId: p.trackIds.map((id) => covers.get(id)).find((c) => c) ?? null,
      bytes: size(p.trackIds),
      onPhone: all(p.trackIds),
      search: searchKey(p.name),
    })),
  };
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
    <Pressable
      onPress={() => onToggle(row.sel)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${row.title}, ${row.subtitle}, ${formatBytes(row.bytes)}${row.onPhone ? ', en el celular' : ''}`}
    >
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={24}
        color={selected ? colors.accent : colors.faint}
      />
      <Cover coverId={row.coverId} title={row.title} size={48} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {row.subtitle}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text font="mono" style={styles.size}>
          {formatBytes(row.bytes)}
        </Text>
        {row.onPhone && <Ionicons name="checkmark-circle" size={16} color={colors.ok} />}
      </View>
    </Pressable>
  );
});

/** Estado del servidor: conectado, buscándolo, no encontrado o desvinculado. */
function ServerCard() {
  const { server, online, sync, startSync, unpair } = useApp();
  if (!server) return null;
  const host = server.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  if (sync.revoked) {
    return (
      <View style={[styles.card, styles.cardWarn]}>
        <View style={styles.cardRow}>
          <Ionicons name="link-outline" size={20} color={colors.danger} />
          <View style={styles.flex}>
            <Text style={styles.strong}>Este celular quedó desvinculado</Text>
            <Text style={styles.muted}>Lo que ya bajaste se sigue escuchando.</Text>
          </View>
        </View>
        <Button
          title="Volver a vincular"
          icon="qr-code-outline"
          variant="primary"
          onPress={() => void unpair().then(() => router.replace('/vincular'))}
        />
      </View>
    );
  }
  if (online === false && !sync.running) {
    return (
      <View style={[styles.card, styles.cardWarn]}>
        <View style={styles.cardRow}>
          <Ionicons name="wifi-outline" size={20} color={colors.warn} />
          <View style={styles.flex}>
            <Text style={styles.strong}>No encuentro {server.name}</Text>
            <Text style={styles.muted}>Conectate al WiFi de tu casa con la compu prendida.</Text>
          </View>
        </View>
        <Button title="Buscar de nuevo" icon="refresh" onPress={() => void startSync()} />
      </View>
    );
  }
  const searching = online !== true;
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.dot, { backgroundColor: searching ? colors.faint : colors.ok }]} />
        <View style={styles.flex}>
          <Text style={styles.strong} numberOfLines={1}>
            {searching ? `Buscando ${server.name}…` : `Conectado a ${server.name}`}
          </Text>
          <Text font="mono" style={styles.mutedSmall} numberOfLines={1}>
            {host}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Resultado de la última sincronización (y por qué falló, si falló). */
function SyncResult({ titles }: { titles: Map<string, string> }) {
  const { sync } = useApp();
  const { report } = sync;
  const failures = report?.failed ?? [];
  if (!report && (!sync.error || sync.revoked)) return null;
  return (
    <View style={styles.block}>
      {report && (
        <Text style={styles.muted}>
          {report.paused ? 'En pausa' : 'Listo'}: {plural(report.downloaded, 'bajada', 'bajadas')},{' '}
          {plural(report.deleted, 'borrada', 'borradas')}
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
      {sync.error && !sync.revoked && <Text style={styles.error}>{sync.error}</Text>}
    </View>
  );
}

/** Dónde se guarda la música: memoria del celular o una carpeta elegida (la SD), y mover lo ya bajado. */
function StorageCard() {
  const app = useApp();
  const { musicFolder, relocation, sync } = app;
  const outside = app.outsideTarget();
  const free = app.freeBytes();
  const busy = sync.running || relocation.running;

  async function change() {
    const picked = await app.pickMusicFolder();
    if (picked && app.outsideTarget() > 0) askMove();
  }

  function askMove() {
    Alert.alert(
      'Mover lo descargado',
      'Se copian las canciones al lugar nuevo y se borran del anterior. Puede tardar unos minutos.',
      [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Mover', onPress: () => void app.relocate() },
      ],
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Dónde se guarda</Text>
      <View style={styles.cardRow}>
        <Ionicons
          name={musicFolder ? 'folder-outline' : 'phone-portrait-outline'}
          size={22}
          color={colors.textSoft}
        />
        <View style={styles.flex}>
          <Text style={styles.strong}>{musicFolder ? folderLabel(musicFolder) : 'Memoria del celular'}</Text>
          <Text style={styles.muted}>
            {musicFolder
              ? 'Con su nombre: también la ven otros reproductores.'
              : free !== null
                ? `${formatBytes(free)} libres`
                : 'Solo la ve esta app.'}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          title={musicFolder ? 'Cambiar carpeta' : 'Elegir carpeta (SD)'}
          icon="folder-open-outline"
          disabled={busy}
          onPress={() => void change()}
        />
        {musicFolder && (
          <Button title="Volver a la memoria del celular" disabled={busy} onPress={app.storeInternally} />
        )}
      </View>
      {relocation.running ? (
        <View style={styles.block}>
          <Text style={styles.muted}>
            Moviendo {Math.min(relocation.done + 1, relocation.total)} de {relocation.total}…
          </Text>
          <Bar fraction={relocation.total ? relocation.done / relocation.total : 0} />
        </View>
      ) : (
        outside > 0 && (
          <View style={styles.block}>
            <Text style={styles.muted}>
              {plural(outside, 'canción está', 'canciones están')} en el lugar anterior. Se siguen escuchando
              igual.
            </Text>
            <Button title="Mover lo descargado" icon="swap-horizontal" disabled={busy} onPress={askMove} />
          </View>
        )
      )}
      {relocation.report && !relocation.running && (
        <Text style={relocation.report.failed > 0 ? styles.error : styles.muted}>
          {plural(relocation.report.moved, 'canción movida', 'canciones movidas')}
          {relocation.report.failed > 0 && ` · ${relocation.report.failed} no se pudieron mover`}
          {relocation.report.skipped > 0 && ' · la que suena se mueve la próxima vez'}
        </Text>
      )}
    </View>
  );
}

function Bar({ fraction }: { fraction: number }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }]} />
    </View>
  );
}

/** Barra fija de abajo: qué está marcado y Sincronizar, o el progreso mientras baja. */
function SyncBar({ summary }: { summary: { trackCount: number; bytes: number } }) {
  const { sync, startSync, stopSync, relocation } = useApp();
  const progress = useSyncProgress();
  if (sync.running) {
    const downloading = progress?.phase === 'downloading';
    return (
      <View style={styles.syncBar}>
        <View style={styles.flex}>
          <Text style={styles.strong} numberOfLines={1}>
            {downloading
              ? `Bajando ${Math.min(progress.done + 1, progress.total)} de ${progress.total}`
              : 'Sincronizando…'}
          </Text>
          <Text style={styles.mutedSmall}>
            {downloading ? `${formatBytes(progress.bytesTotal - progress.bytesDone)} restantes` : ' '}
          </Text>
          <Bar fraction={downloading && progress.bytesTotal ? progress.bytesDone / progress.bytesTotal : 0} />
        </View>
        <Button title="Detener" icon="stop" onPress={stopSync} />
      </View>
    );
  }
  return (
    <View style={styles.syncBar}>
      <View style={styles.flex}>
        <Text style={styles.strong}>{plural(summary.trackCount, 'canción', 'canciones')}</Text>
        <Text style={styles.mutedSmall}>{formatBytes(summary.bytes)} marcadas</Text>
      </View>
      <Button
        title="Sincronizar"
        icon="sync"
        variant="primary"
        disabled={relocation.running}
        onPress={() => void startSync()}
      />
    </View>
  );
}

export default function Descargas() {
  const { catalog, selection, toggle, downloadedIds } = useApp();
  const [tab, setTab] = useState<Tab>('albumes');
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => (catalog ? buildRows(catalog, downloadedIds) : { albumes: [], listas: [] }),
    [catalog, downloadedIds],
  );
  const summary = useMemo(
    () => (catalog ? selectionSummary(catalog, selection) : { trackCount: 0, bytes: 0 }),
    [catalog, selection],
  );
  const selectedKeys = useMemo(() => new Set(selection.map((s) => `${s.kind}:${s.id}`)), [selection]);
  const titles = useMemo(() => new Map((catalog?.tracks ?? []).map((t) => [t.id, t.title])), [catalog]);
  const onToggle = useCallback((sel: Selection) => toggle(sel), [toggle]);
  // Lo que hay en el celular (antes estaba arriba de la Biblioteca).
  const onPhone = useMemo(() => {
    const view = catalog ? libraryView(catalog, downloadedIds) : null;
    return { albums: view?.albums.length ?? 0, tracks: view?.tracks.length ?? 0 };
  }, [catalog, downloadedIds]);

  const q = searchKey(query.trim());
  const visible = useMemo(
    () => (q ? rows[tab].filter((r) => r.search.includes(q)) : rows[tab]),
    [rows, tab, q],
  );

  const header = (
    <View style={styles.top}>
      <ServerCard />
      {catalog && (
        <>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(
              [
                ['albumes', 'Álbumes'],
                ['listas', 'Listas'],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                style={[styles.tab, tab === key && styles.tabOn]}
              >
                <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
                  {label}{' '}
                  <Text style={[styles.tabCount, tab === key && styles.tabTextOn]}>{rows[key].length}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tab === 'albumes' ? 'Buscar álbum o artista' : 'Buscar lista'}
              accessibilityLabel="Buscar en la música de la compu"
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
        </>
      )}
    </View>
  );

  const footer = (
    <View style={styles.bottom}>
      <SyncResult titles={titles} />
      <StorageCard />
      <Text style={styles.mutedSmall}>
        En el celular: {plural(onPhone.albums, 'álbum', 'álbumes')} ·{' '}
        {plural(onPhone.tracks, 'canción', 'canciones')} · se escuchan sin conexión
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Descargas" subtitle="Elegí qué querés tener en el celular" />
      <FlatList
        data={visible}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <EntryRow
            row={item}
            selected={selectedKeys.has(`${item.sel.kind}:${item.sel.id}`)}
            onToggle={onToggle}
          />
        )}
        initialNumToRender={20}
        ListEmptyComponent={
          <Text style={[styles.muted, styles.empty]}>
            {!catalog
              ? 'Cuando encuentre tu compu vas a ver acá tu música.'
              : q
                ? `Nada coincide con «${query}».`
                : tab === 'albumes'
                  ? 'El servidor todavía no tiene álbumes.'
                  : 'El servidor todavía no tiene listas.'}
          </Text>
        }
      />
      {catalog && <SyncBar summary={summary} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13 },
  mutedSmall: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { padding: PADDING, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  top: { paddingHorizontal: PADDING, gap: 12, paddingBottom: 8 },
  bottom: { paddingHorizontal: PADDING, paddingTop: 16, paddingBottom: 24, gap: 12 },
  block: { gap: 6 },
  card: {
    padding: 14,
    gap: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWarn: { backgroundColor: colors.warnSoft, borderColor: '#3A2F18' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardLabel: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  actions: { gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 5 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
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
  tabCount: { fontWeight: '500', color: colors.faint },
  search: { justifyContent: 'center' },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: PADDING,
    paddingVertical: 6,
  },
  rowTitle: { fontWeight: '600' },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  size: { fontSize: 12, color: colors.textSoft },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 4, backgroundColor: colors.accent },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: PADDING,
    paddingVertical: 10,
    backgroundColor: colors.surfaceSide,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});
