# Etapa 3 — App móvil: sincronización — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android (Expo) que se vincula al servidor por QR, trae el catálogo, deja elegir álbumes y listas, los sincroniza al almacenamiento privado del teléfono (bajando lo nuevo y borrando lo desmarcado, sin dejar archivos corruptos) y muestra la biblioteca descargada sin conexión. El reproductor queda para la etapa 4.

**Architecture:** Workspace `apps/mobile` (Expo SDK 58, expo-router). Toda la lógica vive en `src/core/` como TypeScript puro con dependencias inyectadas (HTTP, base SQL, archivos, descargador, mDNS) y se prueba con Vitest en Node; `src/native/` tiene los adaptadores finos a expo-sqlite, expo-file-system, react-native-zeroconf; `app/` son las pantallas. La APK se compila con EAS Build en la nube.

**Tech Stack:** Expo 58 (React Native 0.88, React 19.3.0), expo-router, expo-sqlite, expo-file-system (`File`, `Directory`, `Paths`, `DownloadTask`), expo-camera, expo-device, expo-build-properties, react-native-zeroconf, `@noble/hashes`, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-22-dontstopmenow-design.md` (§6 Sincronización, §7 App del celular)

## Global Constraints

- React fijado en **`19.3.0` exacto** en `apps/web` y `apps/mobile` (lo exige Expo 58); `@types/react` `~19.3.0`.
- Versiones de paquetes Expo: las de `expo/bundledNativeModules.json` del SDK 58 (`npx expo install <pkg>` las elige).
- `app.json`: `name: "DontStopMeNow"`, `slug: "dontstopmenow"`, `scheme: "dontstopmenow"`, `android.package: "com.cristhianrossi.dontstopmenow"`, permisos `CHANGE_WIFI_MULTICAST_STATE` y `ACCESS_WIFI_STATE`, plugins `expo-router`, `expo-sqlite`, `["expo-camera", { "cameraPermission": "La cámara se usa para escanear el código QR del servidor." }]`, `["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]` (el servidor es HTTP en la red local; sin esto Android bloquea los pedidos).
- `eas.json`: perfil `preview` → `android.buildType: "apk"`, `distribution: "internal"`; perfil `development` → además `developmentClient: true`.
- Nada de `src/core/` importa `react-native`, `expo-*` ni `react`: solo `@dsmn/shared`, `@noble/hashes` y sus propias interfaces.
- Archivos de música en `Paths.document/music/<trackId>.<format>`; descargas en curso en `<trackId>.part`.
- Margen de espacio libre: `200 * 1024 * 1024` bytes. Reintentos: 3, con esperas de 2 s, 4 s y 8 s. Descargas en paralelo: 2.
- Textos en español rioplatense.

## Decisiones de esta etapa (actualizan el spec en Task 1)

1. **Retomar descargas:** `DownloadTask` de expo-file-system guarda un estado de pausa (`savable`) que se persiste. Se usa cuando la app pasa a segundo plano o el usuario detiene la sincronización: la próxima vez se retoma con `DownloadTask.fromSavable`. Si la descarga falla por un error de red no hay estado de pausa: se reintenta desde cero (3 veces). **Toda descarga terminada se verifica con la huella** (misma fórmula que el servidor); si no coincide se borra y se baja de nuevo completa. Así ningún corte ni cambio del archivo en la compu deja una canción corrupta.
2. **Catálogo local:** se guarda como un JSON en una fila de SQLite (más índices en memoria), en lugar de tablas `catalog_*`.
3. **Pruebas del celular:** Vitest (como el resto del monorepo) para `src/core`; las pantallas se verifican con typecheck, `expo export` y la lista manual del README.
4. **Elegir la URL del servidor:** el QR trae varias URLs (adaptadores virtuales de Windows incluidos). Se prueban **en paralelo** con `GET /api/catalog` (un `401` ya prueba que el servidor está ahí) y se usa la primera que responde; recién entonces se canjea el código en esa URL.

## Review Focus

1. **QR con varias URLs donde la primera es un adaptador virtual muerto** (vEthernet, VirtualBox): la vinculación no espera timeouts en serie; test en Task 2.
2. **Selección con canciones compartidas entre un álbum y una lista, y desmarcar solo uno de los dos:** la canción compartida no se borra; test en Task 5.
3. **La app se cierra a mitad de una descarga:** al volver no queda un archivo a medias registrado como descargado (`.part` nunca se registra; la huella se verifica); test en Task 5.
4. **Token revocado en la compu:** la sincronización frena con un aviso de "volvé a vincular" y no borra nada; test en Task 5.
5. **La compu cambió de IP:** se reencuentra por mDNS usando el `serverId` y se actualiza la URL guardada; test en Task 2.

---

## Estructura de archivos

```
packages/shared/src/fingerprint.ts      fingerprintFromWindows (misma fórmula que el servidor)
apps/mobile/
  package.json  app.json  eas.json  tsconfig.json  vitest.config.ts  README.md
  app/_layout.tsx                 proveedor de estado; redirige a /vincular si no hay servidor
  app/vincular.tsx                QR, servidores encontrados, dirección + código a mano
  app/(tabs)/_layout.tsx          pestañas Biblioteca / Descargas / Ajustes
  app/(tabs)/index.tsx            biblioteca descargada
  app/(tabs)/descargas.tsx        selección y sincronización
  app/(tabs)/ajustes.tsx          servidor, desvincular, espacio, borrar descargas
  app/album/[id].tsx  app/lista/[id].tsx
  src/core/types.ts               interfaces inyectadas (SqlDb, FileStore, Downloader, Discovery, Fetch)
  src/core/http.ts                ServerClient, errores tipados
  src/core/pairing.ts             parseQr, pickReachableUrl, pairWithQr, pairManually
  src/core/discovery.ts           resolveServerUrl
  src/core/store.ts               LocalStore sobre SqlDb
  src/core/library.ts             libraryView, selectionSummary
  src/core/syncEngine.ts          runSync
  src/native/sqlite.ts  src/native/fileStore.ts  src/native/downloader.ts  src/native/zeroconf.ts
  src/state/AppContext.tsx        estado global de la app (store, servidor, catálogo, sincronización)
  test/helpers.ts                 sqliteDb (node:sqlite → SqlDb), memoryFiles, fakeDownloader, makeCatalog
  test/*.test.ts
```

---

### Task 1: Preparar el monorepo y crear el proyecto Expo

**Files:**

- Modify: `apps/web/package.json` (`react`, `react-dom` → `19.3.0`; `@types/react*` → `~19.3.0`), `docs/superpowers/specs/2026-10-22-dontstopmenow-design.md` (§6.1, §6.3, §10 con las decisiones de arriba), `package.json` raíz (nada si los scripts por workspace alcanzan)
- Create: `packages/shared/src/fingerprint.ts` (+ export), `apps/mobile/*` (package.json, app.json, eas.json, tsconfig.json, vitest.config.ts, `app/_layout.tsx` y `app/(tabs)/index.tsx` mínimos)
- Test: `packages/shared/test/fingerprint.test.ts`, `apps/server/test/scan/fingerprint.test.ts` (caso cruzado)

**Interfaces:**

- Produces:
  - `fingerprintFromWindows(size: number, head: Uint8Array, tail: Uint8Array): string` — `` `${size}:${sha1hex(head ++ tail)}` ``; para archivos de ≤ 128 KiB, `head` es el archivo entero y `tail` vacío. `FINGERPRINT_WINDOW = 64 * 1024`.
  - `apps/mobile/package.json`: `"main": "expo-router/entry"`, scripts `start: expo start`, `typecheck: tsc --noEmit -p .`, `export:android: expo export --platform android --output-dir .expo-export`.
  - `tsconfig.json` de mobile: extiende `expo/tsconfig.base` con `strict`, `noUncheckedIndexedAccess`, `allowImportingTsExtensions`, `noEmit`; `include: ["app", "src", "test", "expo-env.d.ts"]`.
  - `vitest.config.ts`: `name: 'mobile'`, `include: ['test/**/*.test.ts']`, entorno `node`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/test/fingerprint.test.ts
it('archivo chico: hash del contenido completo', () => {
  const data = new TextEncoder().encode('0123456789');
  expect(fingerprintFromWindows(10, data, new Uint8Array())).toBe(
    '10:87acec17cd9dcd20a716cc2cf67417b71c8a7016',
  );
});
// apps/server/test/scan/fingerprint.test.ts
it('coincide con fingerprintFromWindows de shared', async () => {
  const data = randomBytes(300 * 1024);
  const file = await writeTmp('x.bin', data);
  expect(await fingerprintFile(file, data.length)).toBe(
    fingerprintFromWindows(data.length, data.subarray(0, 65536), data.subarray(data.length - 65536)),
  );
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** `fingerprint.ts`.
- [ ] **Step 4: Crear `apps/mobile`** con `npm install -w @dsmn/mobile` de: `expo@~58.0.17 expo-router expo-sqlite expo-file-system expo-camera expo-device expo-build-properties expo-constants expo-linking expo-status-bar react@19.3.0 react-native@0.88.0 react-native-screens react-native-safe-area-context react-native-zeroconf @noble/hashes` en las versiones de `bundledNativeModules.json`; dev: `@types/react@~19.3.0 typescript@~5.9.3`. Alinear web a React 19.3.0. Pantallas mínimas que muestren "DontStopMeNow".
- [ ] **Step 5: Verificar** `npm test && npm run lint && npm run typecheck` PASS, y `npm run export:android -w @dsmn/mobile` termina sin errores (prueba que Metro resuelve `@dsmn/shared` con sus imports `.ts`). Si Metro no resuelve los `.ts` explícitos, agregar `apps/mobile/metro.config.js` con `getDefaultConfig` y `resolver.unstable_enablePackageExports = true` antes de tocar `shared`.
- [ ] **Step 6: Commit** — `feat(mobile): proyecto Expo y huella compartida`

---

### Task 2: Cliente HTTP, vinculación y descubrimiento

**Files:**

- Create: `apps/mobile/src/core/types.ts`, `src/core/http.ts`, `src/core/pairing.ts`, `src/core/discovery.ts`
- Test: `apps/mobile/test/http.test.ts`, `test/pairing.test.ts`, `test/discovery.test.ts`

**Interfaces:**

- Produces:
  - `type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>`
  - Errores: `class UnauthorizedError extends Error`, `class ServerUnreachableError extends Error`, `class ServerError extends Error { status: number; code: string }`.
  - `createServerClient(opts: { baseUrl: string; token: string; fetch: FetchLike; timeoutMs?: number /* 10_000 */ }): ServerClient` con
    - `catalog(etag?: string): Promise<{ notModified: true } | { notModified: false; catalog: Catalog; etag: string }>` — valida con `CatalogSchema`; `401` → `UnauthorizedError`; red/timeout → `ServerUnreachableError`.
    - `trackUrl(id: string): string`, `authHeaders(): Record<string, string>` (`Authorization: Bearer …`).
  - `parseQr(text: string): QrPayload | null`.
  - `pickReachableUrl(urls: string[], fetch: FetchLike, timeoutMs = 3000): Promise<string | null>` — `GET <url>/api/catalog` a todas en paralelo; gana la primera con cualquier status HTTP; aborta las demás.
  - `pairWithQr(payload: QrPayload, deviceName: string, fetch: FetchLike): Promise<PairedServer>` y `pairManually(address: string, code: string, deviceName: string, fetch: FetchLike): Promise<PairedServer>` (`address` acepta `192.168.1.10`, `192.168.1.10:4747` o `http://…`; puerto por defecto `DEFAULT_PORT`). `PairedServer = { serverId: string; name: string; url: string; token: string }`. Código inválido → `ServerError` con el mensaje del servidor.
  - `interface Discovery { find(serverId: string, timeoutMs: number): Promise<string | null> }` (devuelve URL `http://<ipv4>:<port>`).
  - `resolveServerUrl(server: PairedServer, deps: { fetch: FetchLike; discovery: Discovery }): Promise<string | null>` — si `server.url` responde (cualquier status) en 3 s, la devuelve; si no, `discovery.find(server.serverId, 5000)`; si esa URL responde, la devuelve; si no, `null`.

- [ ] **Step 1: Write the failing tests** (`fakeFetch(routes)` en `test/helpers.ts`: claves `"GET http://a:4747/api/catalog"`, valores `{ status, body }`, `'hang'` para no responder nunca o `'fail'` para error de red)

```ts
it('pickReachableUrl no espera a las URLs muertas', async () => {
  const fetch = fakeFetch({
    'GET http://172.20.0.1:4747/api/catalog': 'hang',
    'GET http://192.168.1.10:4747/api/catalog': { status: 401 },
  });
  const t0 = Date.now();
  expect(await pickReachableUrl(['http://172.20.0.1:4747', 'http://192.168.1.10:4747'], fetch, 3000)).toBe(
    'http://192.168.1.10:4747',
  );
  expect(Date.now() - t0).toBeLessThan(500);
});
it('pairWithQr canjea el código en la URL alcanzable', async () => {
  /* POST /api/pair en 192.168.1.10 con { code, deviceName } → PairedServer */
});
it('pairManually normaliza la dirección', async () => {
  /* '192.168.1.10' → http://192.168.1.10:4747 */
});
it('código inválido → ServerError con el mensaje', async () => {
  /* 401 { error: { message: 'Código inválido o vencido' } } */
});
it('parseQr rechaza QRs ajenos', () => {
  expect(parseQr('https://example.com')).toBeNull();
});
it('catalog: 304 → notModified; 401 → UnauthorizedError; sin red → ServerUnreachableError', async () => {
  /* */
});
it('resolveServerUrl usa mDNS cuando cambió la IP', async () => {
  const discovery = { find: vi.fn(async () => 'http://192.168.1.77:4747') };
  /* server.url = http://192.168.1.10:4747 ('fail'); 192.168.1.77 responde 401 → devuelve la nueva; find llamado con serverId */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/mobile` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): cliente HTTP, vinculación y descubrimiento`

---

### Task 3: Almacenamiento local

**Files:**

- Create: `apps/mobile/src/core/store.ts`; en `src/core/types.ts`: `SqlDb`
- Test: `apps/mobile/test/store.test.ts` (con `sqliteDb()` de `test/helpers.ts`, que envuelve `node:sqlite` `:memory:`)

**Interfaces:**

- Produces:
  - `interface SqlDb { exec(sql: string): void; run(sql: string, ...params: SqlValue[]): void; all<T>(sql: string, ...params: SqlValue[]): T[]; first<T>(sql: string, ...params: SqlValue[]): T | null }`, `type SqlValue = string | number | null`.
  - `class LocalStore { constructor(db: SqlDb) }` — migra al construir (tablas `server`, `catalog`, `selection`, `downloads`, `partials`, `failures`). Métodos:
    - `getServer(): PairedServer | null`, `setServer(s: PairedServer): void`, `updateServerUrl(url: string): void`, `clearServer(): void` (borra servidor, catálogo, selección, fallas y parciales; **no** las descargas).
    - `getCatalog(): { catalog: Catalog; etag: string } | null`, `setCatalog(catalog: Catalog, etag: string): void`.
    - `getSelection(): Selection[]`, `setSelected(sel: Selection, on: boolean): void`, `replaceSelection(sel: Selection[]): void`.
    - `getDownloads(): (LocalDownload & { path: string; size: number })[]`, `addDownload(d: { trackId; fingerprint; path; size }): void`, `removeDownload(trackId: string): void`.
    - `getPartial(trackId): { fingerprint: string; state: string } | null`, `setPartial(trackId, fingerprint, state: string): void`, `removePartial(trackId): void`.
    - `setFailures(f: { trackId: string; error: string }[]): void`, `getFailures()`.

- [ ] **Step 1: Write the failing tests**

```ts
it('guarda y lee servidor, catálogo y selección', () => {
  /* round-trip */
});
it('clearServer conserva las descargas', () => {
  /* addDownload; clearServer; getDownloads().length === 1 */
});
it('setSelected es idempotente', () => {
  /* dos veces on → una fila; off → cero */
});
it('reabrir la base conserva los datos (migración idempotente)', () => {
  /* new LocalStore(db) dos veces */
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): almacenamiento local`

---

### Task 4: Vista de biblioteca y resumen de selección

**Files:**

- Create: `apps/mobile/src/core/library.ts`
- Test: `apps/mobile/test/library.test.ts`

**Interfaces:**

- Produces:
  - `libraryView(catalog: Catalog, downloadedIds: Set<string>): { albums: Album[]; artists: { name: string; albumIds: string[] }[]; playlists: Playlist[]; tracks: Track[] }` — solo lo descargado: álbumes y listas con `trackIds` filtrados a descargados, sin los que quedan vacíos; artistas derivados de esos álbumes ordenados con `localeCompare('es')`.
  - `selectionSummary(catalog: Catalog, selection: Selection[]): { trackCount: number; bytes: number }` — canciones únicas de la selección (las compartidas cuentan una vez).
  - `entrySize(catalog: Catalog, trackIds: string[]): number`.

- [ ] **Step 1: Write the failing tests**

```ts
it('solo muestra lo descargado y oculta álbumes vacíos', () => {
  /* */
});
it('selectionSummary cuenta una vez las canciones compartidas', () => {
  /* álbum [t1,t2] + lista [t2,t3] con size 100 → { trackCount: 3, bytes: 300 } */
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): vista de biblioteca descargada`

---

### Task 5: Motor de sincronización

**Files:**

- Create: `apps/mobile/src/core/syncEngine.ts`; en `src/core/types.ts`: `FileStore`, `Downloader`
- Test: `apps/mobile/test/syncEngine.test.ts` (con `memoryFiles()` y `fakeDownloader()` de `test/helpers.ts`)

**Interfaces:**

- Consumes: `ServerClient` (Task 2), `LocalStore` (Task 3), `computeSyncPlan`, `fingerprintFromWindows`, `FINGERPRINT_WINDOW`.
- Produces:
  - `interface FileStore { musicDir: string; exists(path: string): boolean; size(path: string): number; read(path: string, offset: number, length: number): Promise<Uint8Array>; move(from: string, to: string): void; remove(path: string): void; freeBytes(): number }`
  - `interface Downloader { download(req: { url: string; headers: Record<string, string>; dest: string; resumeState?: string; onProgress(bytes: number): void; signal: AbortSignal }): Promise<{ status: 'done' } | { status: 'paused'; state: string }> }` — lanza en errores de red/HTTP (`401` → `UnauthorizedError`).
  - `class InsufficientSpaceError extends Error { missingBytes: number }`.
  - `interface SyncProgress { phase: 'catalog' | 'deleting' | 'downloading' | 'done'; done: number; total: number; bytesDone: number; bytesTotal: number }`
  - `interface SyncReport { downloaded: number; deleted: number; failed: { trackId: string; error: string }[]; paused: boolean }`
  - `runSync(deps: { client: ServerClient; store: LocalStore; files: FileStore; downloader: Downloader; protectedTrackIds?: Set<string>; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; onProgress?: (p: SyncProgress) => void }): Promise<SyncReport>`

Comportamiento (en orden):

1. `client.catalog(etag guardado)`; si cambió, `store.setCatalog`. `UnauthorizedError` y `ServerUnreachableError` se propagan **antes** de tocar archivos.
2. `computeSyncPlan(catalog, selection, downloads)`; `store.replaceSelection(prunedSelection)`.
3. Espacio: `sum(download.size) > files.freeBytes() - 200 MiB` → `InsufficientSpaceError(faltante)` sin tocar nada.
4. Borrados: cada id de `plan.delete` que no esté en `protectedTrackIds` → `files.remove(path)` + `store.removeDownload`.
5. Descargas, de a 2: destino `<musicDir>/<id>.part`; si `store.getPartial(id)` existe con la misma huella, se pasa `resumeState`. Resultado `paused` → `store.setPartial` y se corta todo (`report.paused = true`). Resultado `done` → leer ventanas, `fingerprintFromWindows`; si coincide con `track.fingerprint` → `move` a `<id>.<format>`, `addDownload`, `removePartial`; si no → borrar `.part` y **una** descarga completa más sin `resumeState`; si vuelve a no coincidir, falla con `"La huella no coincide"`.
6. Errores de una canción: hasta 3 reintentos (`sleep` 2000/4000/8000); después se anota en `failed` y se sigue. `ServerUnreachableError` o `UnauthorizedError` frenan el resto (lo ya bajado queda). `store.setFailures(report.failed)` al final.

- [ ] **Step 1: Write the failing tests**

```ts
it('baja lo seleccionado, verifica la huella y lo registra', async () => {
  /* 2 canciones → downloaded 2, archivos <id>.mp3, sin .part */
});
it('desmarcar un álbum no borra la canción que sigue en una lista marcada', async () => {
  /* */
});
it('borra lo desmarcado salvo la canción que está sonando', async () => {
  /* protectedTrackIds */
});
it('sin espacio no toca nada', async () => {
  /* freeBytes chico → InsufficientSpaceError; ningún remove ni download */
});
it('token revocado: avisa y no borra nada', async () => {
  /* catalog → UnauthorizedError; downloads intactas */
});
it('huella distinta → rebaja completa una vez; si sigue mal, falla', async () => {
  /* fakeDownloader escribe bytes incorrectos la 1.ª vez */
});
it('un .part de una ejecución cortada nunca queda registrado', async () => {
  /* .part preexistente sin partial → se descarta y se baja de cero */
});
it('pausa: guarda el estado y lo usa al retomar', async () => {
  /* 1.ª corrida → paused; 2.ª → download recibe resumeState */
});
it('reintenta 3 veces con espera y sigue con las demás', async () => {
  /* sleep espía: [2000, 4000, 8000]; failed 1, downloaded 1 */
});
it('servidor caído a mitad: frena y conserva lo ya bajado', async () => {
  /* */
});
it('reporta progreso por bytes', async () => {
  /* onProgress final bytesDone === bytesTotal */
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): motor de sincronización`

---

### Task 6: Adaptadores nativos

**Files:**

- Create: `apps/mobile/src/native/sqlite.ts`, `fileStore.ts`, `downloader.ts`, `zeroconf.ts`

**Interfaces:**

- Produces (verificados con typecheck y `expo export`; no tienen tests automáticos porque necesitan el dispositivo):
  - `openSqlDb(): SqlDb` — `openDatabaseSync('dontstopmenow.db')`; `exec` → `execSync`, `run` → `runSync`, `all` → `getAllSync`, `first` → `getFirstSync`.
  - `createFileStore(): FileStore` — `musicDir = new Directory(Paths.document, 'music')` (se crea si no existe); `read` con `file.open(FileMode.ReadOnly)`, `handle.offset = offset`, `readBytes(length)`, `close()`; `freeBytes` → `Paths.availableDiskSpace`.
  - `createDownloader(): Downloader` — `new File(dest)`; si hay `resumeState`, `DownloadTask.fromSavable(JSON.parse(state), { headers, onProgress })` + `resumeAsync()`, si no `File.createDownloadTask(url, file, { headers, onProgress })` + `downloadAsync()`; `signal.aborted` → `pauseAsync()` y devuelve `{ status: 'paused', state: JSON.stringify(task.savable()) }`; respuesta `401` → `UnauthorizedError`.
  - `createDiscovery(): Discovery` — `new Zeroconf()`, `scan({ type: 'dontstopmenow', protocol: 'tcp', domain: 'local.' })`, en `resolved` compara `service.txt.id`; devuelve `http://${service.ipv4[0]}:${service.port}`; `stop()` al terminar o vencer.

- [ ] **Step 1: Implementar** los cuatro adaptadores.
- [ ] **Step 2: Verificar** `npm run typecheck -w @dsmn/mobile` y `npm run export:android -w @dsmn/mobile` PASS.
- [ ] **Step 3: Commit** — `feat(mobile): adaptadores nativos`

---

### Task 7: Estado de la app y vinculación

**Files:**

- Create: `apps/mobile/src/state/AppContext.tsx`, `apps/mobile/app/vincular.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**

- Produces:
  - `AppProvider` (crea `LocalStore(openSqlDb())`, `createFileStore()`, `createDownloader()`, `createDiscovery()` una sola vez) y `useApp(): { server: PairedServer | null; catalog: Catalog | null; downloads: Set<string>; selection: Selection[]; sync: { running: boolean; progress: SyncProgress | null; report: SyncReport | null; error: string | null }; online: boolean | null; pair(s: PairedServer): void; unpair(): void; toggle(sel: Selection): void; startSync(): Promise<void>; stopSync(): void; refresh(): Promise<void>; deleteAllDownloads(): void }`.
  - `startSync`: `resolveServerUrl` (actualiza la URL guardada si cambió) → `runSync` con un `AbortController` (que `stopSync` y `AppState` → `background` abortan). Mensajes: `UnauthorizedError` → `"El servidor revocó este celular. Volvé a vincularlo."`; `ServerUnreachableError`/`null` → `"No se encuentra el servidor. ¿Estás en el mismo WiFi que la compu?"`; `InsufficientSpaceError` → `"Faltan <formatBytes> de espacio libre."`. Al abrir la app con servidor guardado se llama `startSync` una vez.
  - `_layout.tsx`: `Stack` dentro de `AppProvider`; sin servidor → `<Redirect href="/vincular" />`.
  - `vincular.tsx`: `CameraView` con `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` (pide permiso con `useCameraPermissions`); al leer un QR válido → `pairWithQr` → `pair` → `router.replace('/')`. Debajo: campo "Nombre de este celular" (por defecto `Device.modelName ?? 'Android'`), sección "Ingresar a mano" (dirección + código de 6 caracteres → `pairManually`). Errores visibles en pantalla.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar** typecheck + `export:android` PASS; `npm test` PASS.
- [ ] **Step 3: Commit** — `feat(mobile): estado de la app y vinculación`

---

### Task 8: Pantalla de descargas

**Files:**

- Create: `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/(tabs)/descargas.tsx`

**Interfaces:**

- Produces:
  - Pestañas `Biblioteca` (`index`), `Descargas`, `Ajustes` con `Tabs` de expo-router.
  - `descargas.tsx`: arriba, `"Seleccionado: <n> canciones · <formatBytes> · Libre: <formatBytes>"` (`selectionSummary`, `freeBytes`); botón `"Sincronizar"` / `"Detener"`; progreso `"Bajando <done> de <total> · <formatBytes(bytesTotal - bytesDone)> restantes"`; resumen al terminar (`"Listo: <n> bajadas, <m> borradas"` y la lista de fallas); errores de `sync.error`. Dos secciones con `SectionList`: **Listas** y **Álbumes**, cada fila con nombre, artista o tipo, tamaño (`entrySize`) y un `Switch` (`toggle`). Sin catálogo (nunca conectó) → `"Conectate al WiFi de tu casa para ver tu música."`.
  - `formatBytes` se mueve de `apps/web/src/lib/format.ts` a `packages/shared/src/format.ts` (junto con `formatDuration`) y la web lo importa de ahí; sus tests pasan a `packages/shared/test/format.test.ts`.

- [ ] **Step 1: Mover `formatBytes`/`formatDuration` a shared** (tests movidos, web importando de `@dsmn/shared`); `npm test` PASS.
- [ ] **Step 2: Implementar** las pestañas y la pantalla.
- [ ] **Step 3: Verificar** typecheck + `export:android` + `npm test` PASS.
- [ ] **Step 4: Commit** — `feat(mobile): pantalla de descargas`

---

### Task 9: Biblioteca sin conexión, detalles y ajustes

**Files:**

- Create: `apps/mobile/app/(tabs)/index.tsx` (reemplaza el mínimo), `app/(tabs)/ajustes.tsx`, `app/album/[id].tsx`, `app/lista/[id].tsx`, `apps/mobile/README.md`
- Modify: `README.md` raíz (sección de la app)

**Interfaces:**

- Produces:
  - `index.tsx`: selector Álbumes / Artistas / Listas / Canciones y buscador (mismo criterio que la web: sin tildes ni mayúsculas; `searchKey` se mueve a `@dsmn/shared`); listas con `FlatList`; portadas con `<Image source={{ uri: coverUrl, headers }}>` solo si hay conexión (si no, la inicial). Vacío: `"Todavía no bajaste música. Elegí qué bajar en Descargas."`. Filas de canción sin acción todavía (el reproductor llega en la etapa 4).
  - `album/[id].tsx` y `lista/[id].tsx`: título, datos y canciones descargadas en orden.
  - `ajustes.tsx`: servidor (nombre, URL, estado `online`), `"Desvincular"` (confirmación; conserva lo descargado), espacio usado (suma de `downloads.size`), `"Borrar todo lo descargado"` (confirmación).
  - `apps/mobile/README.md`: **compilar con EAS** (`npm install -g eas-cli`, `eas login`, `cd apps/mobile && eas init`, `eas build -p android --profile preview`, instalar el APK desde el link/QR), **probar** (servidor corriendo, mismo WiFi, abrir la app y escanear el QR de Dispositivos) y la **lista de verificación manual**: vincular por QR; vincular a mano; marcar un álbum y sincronizar; desmarcarlo y ver que se borra; cortar el WiFi a mitad de una descarga y volver a sincronizar; mandar la app a segundo plano durante una descarga y volver; revocar el celular desde la web y ver el aviso; cambiar la IP de la compu y ver que la encuentra; modo avión y ver la biblioteca.

- [ ] **Step 1: Mover `searchKey` a shared** (web importa de ahí); tests PASS.
- [ ] **Step 2: Implementar** las pantallas y los READMEs.
- [ ] **Step 3: Verificar** `npm test && npm run lint && npm run typecheck && npm run format:check` y `npm run export:android -w @dsmn/mobile` PASS.
- [ ] **Step 4: Commit** — `feat(mobile): biblioteca sin conexión y ajustes`
