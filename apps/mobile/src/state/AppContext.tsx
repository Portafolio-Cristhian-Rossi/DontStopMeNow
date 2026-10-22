import { formatBytes, type Catalog, type Selection } from '@dsmn/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { resolveServerUrl } from '../core/discovery.ts';
import { ServerUnreachableError, UnauthorizedError, createServerClient } from '../core/http.ts';
import { LocalStore, type StoredDownload } from '../core/store.ts';
import { InsufficientSpaceError, runSync, type SyncProgress, type SyncReport } from '../core/syncEngine.ts';
import type { FetchLike, PairedServer } from '../core/types.ts';
import { createDiscovery, createDownloader, createFileStore, openSqlDb } from '../native/index.ts';

const appFetch = fetch as unknown as FetchLike;

export interface SyncState {
  running: boolean;
  progress: SyncProgress | null;
  report: SyncReport | null;
  error: string | null;
}

export interface AppValue {
  server: PairedServer | null;
  catalog: Catalog | null;
  downloads: StoredDownload[];
  downloadedIds: Set<string>;
  selection: Selection[];
  sync: SyncState;
  /** null mientras no se sabe; false si la última vez no se encontró el servidor. */
  online: boolean | null;
  freeBytes(): number;
  pair(server: PairedServer): void;
  unpair(): void;
  toggle(sel: Selection): void;
  startSync(): Promise<void>;
  stopSync(): void;
  deleteAllDownloads(): void;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp fuera de AppProvider');
  return value;
}

function syncErrorMessage(err: unknown): string {
  if (err instanceof UnauthorizedError) return 'El servidor revocó este celular. Volvé a vincularlo.';
  if (err instanceof ServerUnreachableError) return new ServerUnreachableError().message;
  if (err instanceof InsufficientSpaceError)
    return `Faltan ${formatBytes(err.missingBytes)} de espacio libre.`;
  return err instanceof Error ? err.message : String(err);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const deps = useMemo(
    () => ({
      store: new LocalStore(openSqlDb()),
      files: createFileStore(),
      downloader: createDownloader(),
      discovery: createDiscovery(),
    }),
    [],
  );
  const { store, files } = deps;

  const read = useCallback(
    () => ({
      server: store.getServer(),
      catalog: store.getCatalog()?.catalog ?? null,
      downloads: store.getDownloads(),
      selection: store.getSelection(),
    }),
    [store],
  );
  const [local, setLocal] = useState(read);
  const reload = useCallback(() => setLocal(read()), [read]);

  const [sync, setSync] = useState<SyncState>({ running: false, progress: null, report: null, error: null });
  const [online, setOnline] = useState<boolean | null>(null);
  const controller = useRef<AbortController | null>(null);

  const startSync = useCallback(async () => {
    const server = store.getServer();
    if (!server || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setSync({ running: true, progress: null, report: null, error: null });
    try {
      const url = await resolveServerUrl(server, { fetch: appFetch, discovery: deps.discovery });
      if (!url) throw new ServerUnreachableError();
      if (url !== server.url) store.updateServerUrl(url);
      setOnline(true);
      const client = createServerClient({ baseUrl: url, token: server.token, fetch: appFetch });
      const report = await runSync({
        client,
        store,
        files,
        downloader: deps.downloader,
        signal: abort.signal,
        onProgress: (progress) => setSync((s) => ({ ...s, progress })),
      });
      setSync({ running: false, progress: null, report, error: null });
    } catch (err) {
      if (err instanceof ServerUnreachableError) setOnline(false);
      setSync({ running: false, progress: null, report: null, error: syncErrorMessage(err) });
    } finally {
      controller.current = null;
      reload();
    }
  }, [deps, store, files, reload]);

  const stopSync = useCallback(() => controller.current?.abort(), []);

  // Si la app pasa a segundo plano, las descargas se pausan (y se retoman la próxima vez).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') controller.current?.abort();
    });
    return () => sub.remove();
  }, []);

  // Al abrir la app con un servidor vinculado, se sincroniza una vez.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !store.getServer()) return;
    started.current = true;
    void startSync();
  }, [store, startSync]);

  const value = useMemo<AppValue>(
    () => ({
      ...local,
      downloadedIds: new Set(local.downloads.map((d) => d.trackId)),
      sync,
      online,
      freeBytes: () => files.freeBytes(),
      pair(server) {
        store.setServer(server);
        reload();
        void startSync();
      },
      unpair() {
        controller.current?.abort();
        store.clearServer();
        setOnline(null);
        reload();
      },
      toggle(sel) {
        const on = !local.selection.some((s) => s.kind === sel.kind && s.id === sel.id);
        store.setSelected(sel, on);
        reload();
      },
      startSync,
      stopSync,
      deleteAllDownloads() {
        for (const d of store.getDownloads()) {
          files.remove(d.path);
          store.removeDownload(d.trackId);
        }
        store.replaceSelection([]);
        reload();
      },
    }),
    [local, sync, online, files, store, reload, startSync, stopSync],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
