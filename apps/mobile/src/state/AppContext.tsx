import { formatBytes, type Catalog, type Selection } from '@dsmn/shared';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
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
import type { Discovery, FetchLike, PairedServer } from '../core/types.ts';
import { createDiscovery, createDownloader, createFileStore, openSqlDb } from '../native/index.ts';

const appFetch = fetch as unknown as FetchLike;
/** El progreso se publica como mucho cada 250 ms para no re-renderizar de más. */
const PROGRESS_THROTTLE_MS = 250;
const KEEP_AWAKE_TAG = 'dsmn-sync';

export interface SyncState {
  running: boolean;
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
  discovery: Discovery;
  freeBytes(): number;
  pair(server: PairedServer): Promise<void>;
  unpair(): Promise<void>;
  toggle(sel: Selection): void;
  startSync(): Promise<void>;
  stopSync(): void;
  deleteAllDownloads(): Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);
const ProgressContext = createContext<SyncProgress | null>(null);

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp fuera de AppProvider');
  return value;
}

/** Progreso de la sincronización en curso (contexto aparte: cambia seguido). */
export const useSyncProgress = () => useContext(ProgressContext);

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
  const downloadedIds = useMemo(() => new Set(local.downloads.map((d) => d.trackId)), [local.downloads]);

  const [sync, setSync] = useState<SyncState>({ running: false, report: null, error: null });
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const controller = useRef<AbortController | null>(null);
  const running = useRef<Promise<void> | null>(null);

  const startSync = useCallback((): Promise<void> => {
    const server = store.getServer();
    if (!server) return Promise.resolve();
    if (running.current) return running.current;
    const abort = new AbortController();
    controller.current = abort;
    setSync({ running: true, report: null, error: null });
    setProgress(null);
    let lastEmit = 0;

    const job = (async () => {
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
          onProgress: (p) => {
            const now = Date.now();
            if (p.phase === 'downloading' && now - lastEmit < PROGRESS_THROTTLE_MS) return;
            lastEmit = now;
            setProgress(p);
          },
        });
        setSync({ running: false, report, error: null });
      } catch (err) {
        if (err instanceof ServerUnreachableError) setOnline(false);
        setSync({ running: false, report: null, error: syncErrorMessage(err) });
      } finally {
        controller.current = null;
        running.current = null;
        setProgress(null);
        reload();
      }
    })();
    running.current = job;
    return job;
  }, [deps, store, files, reload]);

  const stopSync = useCallback(() => controller.current?.abort(), []);

  /** Detiene la sincronización en curso y espera a que termine (para no pisarse con otra acción). */
  const stopAndWait = useCallback(async () => {
    controller.current?.abort();
    await running.current;
  }, []);

  // Si la app pasa a segundo plano, las descargas se pausan (y se retoman la próxima vez).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') controller.current?.abort();
    });
    return () => sub.remove();
  }, []);

  // Mientras sincroniza, la pantalla no se apaga (apagarla manda la app a segundo plano y pausa).
  useEffect(() => {
    if (!sync.running) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => void deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, [sync.running]);

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
      downloadedIds,
      sync,
      online,
      discovery: deps.discovery,
      freeBytes: () => files.freeBytes(),
      async pair(server) {
        await stopAndWait();
        store.setServer(server);
        reload();
        void startSync();
      },
      async unpair() {
        await stopAndWait();
        store.clearServer();
        setOnline(null);
        setSync({ running: false, report: null, error: null });
        reload();
      },
      toggle(sel) {
        const on = !local.selection.some((s) => s.kind === sel.kind && s.id === sel.id);
        store.setSelected(sel, on);
        reload();
      },
      startSync,
      stopSync,
      async deleteAllDownloads() {
        await stopAndWait();
        store.replaceSelection([]);
        for (const d of store.getDownloads()) {
          files.remove(d.path);
          store.removeDownload(d.trackId);
        }
        reload();
      },
    }),
    [
      local,
      downloadedIds,
      sync,
      online,
      deps.discovery,
      files,
      store,
      reload,
      startSync,
      stopSync,
      stopAndWait,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
    </AppContext.Provider>
  );
}
