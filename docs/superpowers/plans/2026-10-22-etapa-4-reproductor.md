# Etapa 4 — App móvil: reproductor — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproductor propio en la app Android: reproduce la música descargada sin conexión, sigue sonando con la pantalla apagada, tiene controles en la notificación, la pantalla de bloqueo y los auriculares/Bluetooth, cola con "a continuación" y "agregar a la cola", aleatorio, repetir, y retoma donde quedaste. Además las portadas se guardan en el celular para verse sin conexión.

**Architecture:** La lógica del reproductor vive en `src/core/player/` como TypeScript puro: funciones de cola (`queue.ts`) y un `PlayerController` que maneja un `PlayerEngine` inyectado y persiste el estado en `LocalStore`. El motor real (`src/native/player.ts`) envuelve `AudioPlaylist` de **expo-audio** (cola nativa: sigue avanzando de canción en segundo plano sin depender de JS). Las pantallas consumen el controlador con `useSyncExternalStore`.

**Tech Stack:** expo-audio 58 (`createAudioPlaylist`, `setAudioModeAsync`, lock screen), `@react-native-community/slider`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-dontstopmenow-design.md` (§7.1 Reproductor, §7.3)

## Global Constraints

- Mismas reglas que la etapa 3: `src/core/**` no importa `react`, `react-native` ni `expo-*`; textos en español rioplatense; versiones de `expo/bundledNativeModules.json` del SDK 58 (`expo-audio ~58.0.10`, `@react-native-community/slider 5.2.1`).
- `app.json`: plugin `["expo-audio", { "enableBackgroundPlayback": true, "recordAudioAndroid": false }]` (sin permiso de micrófono).
- Modo de audio al iniciar: `setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix', playsInSilentMode: true })`. En Android 13+ se pide `requestNotificationPermissionsAsync()` la primera vez que se reproduce (sin él no hay controles en la notificación).
- Persistencia del estado del reproductor: al cambiar de canción, al pausar y cada `10_000` ms mientras suena.
- Las portadas se guardan en `Paths.document/covers/<coverId>`.

## Decisiones de esta etapa (actualizan el spec en Task 1)

1. **expo-audio en lugar de react-native-track-player.** RNTP no publica versiones desde marzo de 2026 y su módulo es de la arquitectura vieja de React Native (RN 0.88 ya no la incluye). expo-audio viene con el SDK 58 y ya trae lo que pide el spec:
   - cola nativa con repetir (`none` / `single` / `all`);
   - reproducción en segundo plano (servicio en primer plano);
   - controles en la notificación y la pantalla de bloqueo, con siguiente y anterior;
   - botones de auriculares y Bluetooth vía MediaSession;
   - pausa al desconectar los auriculares (`setHandleAudioBecomingNoisy`);
   - pausa en llamadas (foco de audio).

   El modo aleatorio se arma en JS: la cola se carga ya mezclada.

2. **Notificaciones de otras apps:** con expo-audio, cuando otra app pide el foco "con atenuación" el reproductor **pausa un instante y retoma**, en lugar de bajar el volumen. El spec pedía bajar el volumen; la diferencia es mínima y lo resuelve la librería.
3. **Portadas sin conexión:** la sincronización baja las portadas de lo descargado y borra las que ya no se usan. La biblioteca y la pantalla de bloqueo las leen del celular (esto resuelve el pendiente de la etapa 3 sobre portadas fuera de casa).

## Review Focus

1. **Canción borrada por una sincronización mientras está en la cola:** la sincronización no borra la que suena (`protectedTrackIds`) y, al terminar, el reproductor saca de la cola las canciones cuyo archivo ya no existe sin cortar la que suena; test en Task 4.
2. **Restaurar el estado con canciones que ya no están descargadas:** se descartan y el índice se ajusta; si no queda ninguna, el reproductor arranca vacío; test en Task 4.
3. **Aleatorio activado y desactivado en medio de la cola:** la canción actual sigue sonando y en la misma posición; al desactivar vuelve al orden original a partir de esa canción; test en Task 1.
4. **"Reproducir a continuación" varias veces seguidas:** quedan en el orden en que se agregaron (la primera agregada suena primero); test en Task 1.
5. **Repetir una con "siguiente" manual:** "siguiente" avanza igual (repetir una solo afecta el final natural de la canción); test en Task 4.

---

## Estructura de archivos

```
apps/mobile/src/core/player/queue.ts        estado de la cola (funciones puras)
apps/mobile/src/core/player/controller.ts   PlayerController
apps/mobile/src/core/types.ts               (modificar) PlayerEngine, FileStore.coversDir
apps/mobile/src/core/store.ts               (modificar) getPlayerState / setPlayerState
apps/mobile/src/core/syncEngine.ts          (modificar) caché de portadas
apps/mobile/src/native/player.ts            motor sobre expo-audio
apps/mobile/src/native/fileStore.ts         (modificar) coversDir
apps/mobile/src/state/PlayerContext.tsx     controlador único + hooks
apps/mobile/src/components/MiniPlayer.tsx   barra inferior
apps/mobile/src/components/Cover.tsx        (modificar) portada local
apps/mobile/app/reproductor.tsx             pantalla completa + cola
apps/mobile/test/queue.test.ts  test/player.test.ts  (test de portadas en syncEngine.test.ts, de store en store.test.ts)
```

---

### Task 1: Funciones de cola y decisiones en el spec

**Files:**

- Create: `apps/mobile/src/core/player/queue.ts`
- Modify: spec §7.1/§7.3 (decisiones 1–3), §2 (tabla: reproductor = expo-audio)
- Test: `apps/mobile/test/queue.test.ts`

**Interfaces:**

- Produces:
  - `type RepeatMode = 'off' | 'all' | 'one'`
  - `interface QueueState { order: string[]; original: string[]; index: number; shuffle: boolean; repeat: RepeatMode }` — `order` es lo que suena, `original` el orden sin mezclar (cuando `shuffle` es false, son iguales).
  - `createQueue(trackIds: string[], startIndex: number, opts: { shuffle: boolean; repeat: RepeatMode }, random = Math.random): QueueState` — con `shuffle`, la canción de `startIndex` queda primera y el resto se mezcla (Fisher–Yates con `random`).
  - `setShuffle(q: QueueState, on: boolean, random = Math.random): QueueState` — la actual queda en el índice actual; al activar, mezcla solo lo que viene después; al desactivar, `order = original` e `index` = posición de la actual en `original` (la primera aparición desde la última conocida si hay repetidas).
  - `playNext(q: QueueState, trackId: string): QueueState` — inserta después de la actual y después de las ya agregadas con "a continuación" en esta misma canción (se lleva la cuenta en `QueueState.nextInsertAt?: number`, que se reinicia al cambiar de canción). También se agrega a `original` en la posición equivalente.
  - `addToQueue(q, trackId): QueueState` — al final de `order` y de `original`.
  - `removeMissing(q, exists: (id: string) => boolean): QueueState` — saca ids inexistentes, ajusta `index` (si la actual desaparece, pasa a la siguiente existente; si no queda ninguna, `index = -1`).
  - `moveTo(q, index: number): QueueState` — fija `index` (y reinicia `nextInsertAt`).
  - `currentId(q): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
const rnd = seq(0.1, 0.9, 0.5, 0.3); // helper: devuelve esos valores en ciclo
it('createQueue sin aleatorio respeta el orden y el inicio', () => {
  expect(createQueue(['a', 'b', 'c'], 1, { shuffle: false, repeat: 'off' })).toMatchObject({
    order: ['a', 'b', 'c'],
    index: 1,
  });
});
it('createQueue con aleatorio pone primero la elegida', () => {
  const q = createQueue(['a', 'b', 'c', 'd'], 2, { shuffle: true, repeat: 'off' }, rnd);
  expect(q.order[0]).toBe('c');
  expect(q.index).toBe(0);
  expect([...q.order].sort()).toEqual(['a', 'b', 'c', 'd']);
});
it('activar y desactivar aleatorio no mueve la actual', () => {
  let q = createQueue(['a', 'b', 'c', 'd', 'e'], 2, { shuffle: false, repeat: 'off' });
  q = setShuffle(q, true, rnd);
  expect(currentId(q)).toBe('c');
  expect(q.order.slice(0, q.index)).toEqual(['a', 'b']);
  q = setShuffle(q, false);
  expect(q).toMatchObject({ order: ['a', 'b', 'c', 'd', 'e'], index: 2 });
});
it('varios "a continuación" quedan en el orden en que se agregaron', () => {
  let q = createQueue(['a', 'b', 'c'], 0, { shuffle: false, repeat: 'off' });
  q = playNext(playNext(q, 'x'), 'y');
  expect(q.order).toEqual(['a', 'x', 'y', 'b', 'c']);
});
it('agregar a la cola va al final', () => {
  /* addToQueue → último */
});
it('removeMissing ajusta el índice', () => {
  const q = createQueue(['a', 'b', 'c', 'd'], 2, { shuffle: false, repeat: 'off' });
  expect(removeMissing(q, (id) => id !== 'a')).toMatchObject({ order: ['b', 'c', 'd'], index: 1 });
  expect(removeMissing(q, (id) => id !== 'c')).toMatchObject({ order: ['a', 'b', 'd'], index: 2 });
  expect(removeMissing(q, () => false)).toMatchObject({ order: [], index: -1 });
});
```

- [ ] **Step 2: Run** `npx vitest run apps/mobile/test/queue.test.ts` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): cola del reproductor`

---

### Task 2: Estado del reproductor en el almacenamiento local

**Files:**

- Modify: `apps/mobile/src/core/store.ts` (tabla `player_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`)
- Test: `apps/mobile/test/store.test.ts`

**Interfaces:**

- Produces: `interface SavedPlayerState { queue: QueueState; positionMs: number }`; `getPlayerState(): SavedPlayerState | null`, `setPlayerState(s: SavedPlayerState | null): void` (null borra). `clearServer()` **no** lo borra; `deleteAllDownloads` (AppContext) sí.

- [ ] **Step 1: Write the failing test** — round-trip, `null` borra, reabrir la base conserva.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): guardar el estado del reproductor`

---

### Task 3: Portadas en el celular

**Files:**

- Modify: `apps/mobile/src/core/types.ts` (`FileStore.coversDir: string`), `src/core/syncEngine.ts`, `src/native/fileStore.ts`, `src/components/Cover.tsx`, `test/helpers.ts` (`memoryFiles` con `coversDir = '/covers'`)
- Test: `apps/mobile/test/syncEngine.test.ts`

**Interfaces:**

- Produces:
  - Al final de `runSync` (solo si no hubo pausa ni error fatal): para cada `coverId` de canciones descargadas sin archivo en `<coversDir>/<coverId>` → `downloader.download({ url: <baseUrl>/api/covers/<id>, headers: authHeaders, dest: <coversDir>/<id>, … })` (sin reintentos; una falla de portada no cuenta como falla de canción); borra archivos de `coversDir` cuyo id ya no está en ninguna canción descargada. `ServerClient` suma `coverUrl(id: string): string`. `FileStore` suma `list(dir: string): string[]` (nombres de archivo).
  - `coverPath(files: FileStore, coverId: string): string` exportada desde `syncEngine.ts`.
  - `Cover.tsx`: si existe el archivo local, `<Image source={{ uri: coverPath }}>`; si no, la inicial (sin pedir nada al servidor). `onError` → inicial.

- [ ] **Step 1: Write the failing tests**

```ts
it('baja las portadas de lo descargado y borra las que sobran', async () => {
  /* t1 y t2 con coverId 'c1'; cover vieja 'c9' en /covers → después: /covers/c1 existe, c9 no; una sola descarga de c1 */
});
it('una portada que falla no afecta el resultado', async () => {
  /* download de la portada lanza → report.failed vacío */
});
it('no baja portadas si la sincronización quedó en pausa', async () => {
  /* */
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS; typecheck mobile PASS.
- [ ] **Step 5: Commit** — `feat(mobile): portadas guardadas en el celular`

---

### Task 4: PlayerController

**Files:**

- Create: `apps/mobile/src/core/player/controller.ts`; en `src/core/types.ts`: `PlayerEngine`
- Test: `apps/mobile/test/player.test.ts` (con `fakeEngine()` en `test/helpers.ts`)

**Interfaces:**

- Consumes: `queue.ts` (Task 1), `LocalStore.get/setPlayerState` (Task 2), `coverPath` (Task 3).
- Produces:
  - `interface PlayerEngine { load(sources: { uri: string }[], startIndex: number, positionMs: number, autoplay: boolean): void; play(): void; pause(): void; skipTo(index: number): void; seekTo(ms: number): void; setLoop(mode: 'none' | 'single' | 'all'): void; insert(source: { uri: string }, index: number): void; add(source: { uri: string }): void; remove(index: number): void; setNowPlaying(meta: { title: string; artist: string; albumTitle: string; artworkUrl?: string }): void; status(): { index: number; positionMs: number; durationMs: number; playing: boolean }; onTrackChanged(cb: (index: number) => void): () => void; onStatus(cb: () => void): () => void }`
  - `interface PlayerSnapshot { queue: QueueState; current: Track | null; playing: boolean; positionMs: number; durationMs: number }`
  - `class PlayerController { constructor(deps: { engine: PlayerEngine; store: LocalStore; files: FileStore; tracks: () => Map<string, Track>; downloadPath: (id: string) => string | null; now?: () => number }) }` con:
    - `subscribe(cb): () => void`, `getSnapshot(): PlayerSnapshot` (misma referencia mientras no cambie nada, para `useSyncExternalStore`).
    - `playList(trackIds: string[], startIndex: number, opts?: { shuffle?: boolean }): void` — solo con ids descargados (`downloadPath` no nulo); `engine.load(…, autoplay = true)`.
    - `toggle()`, `next()` (si es la última y `repeat !== 'all'`, no hace nada), `previous()` (si van más de 3 s, vuelve al principio de la canción), `seek(ms)`, `setShuffle(on)`, `cycleRepeat()` (`off → all → one → off`, mapea a `setLoop` `none/all/single`), `playNext(id)`, `addToQueue(id)`, `jumpTo(index)`.
    - `restore(): void` — lee `getPlayerState`, aplica `removeMissing(downloadPath)`, `engine.load(…, positionMs, autoplay = false)`.
    - `pruneMissing(): void` — tras una sincronización: `removeMissing`; si la actual sigue, no la corta (quita las demás con `engine.remove`); si la actual desapareció, salta a la siguiente.
    - `currentTrackId(): string | null` (para `protectedTrackIds`).
    - Guarda el estado (`setPlayerState`) en `onTrackChanged`, en `toggle()` al pausar y en `tick()` (que la capa de React llama cada 10 s); en cada cambio de canción llama `engine.setNowPlaying` con `artworkUrl = file://…/covers/<coverId>` si existe.

- [ ] **Step 1: Write the failing tests**

```ts
it('playList carga solo lo descargado y empieza a sonar', () => {
  /* t2 sin descargar → load con 2 fuentes, autoplay true, index ajustado */
});
it('restaura pausado en la misma canción y segundo', () => {
  /* setPlayerState previo → load(…, 42_000, false) */
});
it('restaurar descarta canciones que ya no están', () => {
  /* */
});
it('"siguiente" con repetir una avanza igual', () => {
  /* cycleRepeat x2 → setLoop('single'); next() → skipTo(index+1) */
});
it('anterior después de 3 s vuelve al principio', () => {
  /* status positionMs 5000 → seekTo(0) */
});
it('guarda el estado al cambiar de canción y al pausar', () => {
  /* */
});
it('pruneMissing no corta la canción que suena', () => {
  /* quita otra → engine.remove(i), sin load */
});
it('actualiza la pantalla de bloqueo con la portada local', () => {
  /* setNowPlaying con artworkUrl de /covers/c1 */
});
it('getSnapshot es estable entre cambios', () => {
  expect(c.getSnapshot()).toBe(c.getSnapshot());
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(mobile): controlador del reproductor`

---

### Task 5: Motor nativo y contexto del reproductor

**Files:**

- Create: `apps/mobile/src/native/player.ts`, `apps/mobile/src/state/PlayerContext.tsx`
- Modify: `apps/mobile/app.json` (plugin expo-audio), `apps/mobile/package.json` (`expo-audio`, `@react-native-community/slider`), `apps/mobile/app/_layout.tsx` (`PlayerProvider` dentro de `AppProvider`), `apps/mobile/src/state/AppContext.tsx` (`startSync` recibe `protectedTrackIds` del reproductor y llama `pruneMissing` al terminar)

**Interfaces:**

- Produces:
  - `createPlayerEngine(): PlayerEngine` — `createAudioPlaylist({ loop: 'none', updateInterval: 500 })`; `load` = `clear()` + `add` de cada fuente + `skipTo` + `seekTo` + `play` si corresponde; eventos `trackChanged` y `playlistStatusUpdate`; `setNowPlaying` = `setActiveForLockScreen(true, meta, { showNextTrack: true, showPreviousTrack: true })` la primera vez y `updateLockScreenMetadata` después.
  - `PlayerProvider` (crea un único `PlayerController`, llama `restore()` al montar, `tick()` cada 10 s mientras suena, `setAudioModeAsync` y `requestNotificationPermissionsAsync` en la primera reproducción) y hooks `usePlayer(): PlayerController` y `usePlayerSnapshot(): PlayerSnapshot` (`useSyncExternalStore`).

- [ ] **Step 1: Implementar** (`npm install` con las versiones de Global Constraints escritas en `package.json`).
- [ ] **Step 2: Verificar** typecheck, lint, `npm test`, `npm run export:android -w @dsmn/mobile` y `npx expo prebuild --platform android --no-install` (el manifiesto debe tener `FOREGROUND_SERVICE_MEDIA_PLAYBACK` y `POST_NOTIFICATIONS`, y **no** `RECORD_AUDIO`; borrar `android/` después).
- [ ] **Step 3: Commit** — `feat(mobile): motor de audio y estado del reproductor`

---

### Task 6: Pantallas del reproductor y acciones en la biblioteca

**Files:**

- Create: `apps/mobile/src/components/MiniPlayer.tsx`, `apps/mobile/app/reproductor.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (mini reproductor sobre las pestañas), `app/(tabs)/index.tsx`, `app/album/[id].tsx`, `app/lista/[id].tsx`, `src/components/TrackRow.tsx` (`onPress`, `onLongPress`), `app/_layout.tsx` (pantalla `reproductor` como modal)

**Interfaces:**

- Produces:
  - `MiniPlayer`: portada chica, título y artista, play/pausa y siguiente; tocarlo abre `/reproductor`. No se muestra si la cola está vacía.
  - `reproductor.tsx`: portada grande, título, artista, álbum; `Slider` de posición (al soltar → `seek`) con tiempos `formatDuration`; botones anterior / play-pausa / siguiente; aleatorio (resaltado si está activo); repetir (`"Repetir: no" / "todo" / "una"`); debajo, la cola (`FlatList` con la actual resaltada; tocar una → `jumpTo`).
  - Biblioteca: tocar una canción reproduce la lista visible desde esa canción (pestaña Canciones: todas las canciones filtradas; álbum: el álbum; lista: la lista). Mantener apretado → `Alert` con `"Reproducir a continuación"`, `"Agregar a la cola"`, `"Cancelar"`. Álbum y lista: botones `"Reproducir"` y `"Aleatorio"`.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar** typecheck, lint, `npm test`, `export:android`.
- [ ] **Step 3: Commit** — `feat(mobile): pantallas del reproductor`

---

### Task 7: Documentación

**Files:**

- Modify: `apps/mobile/README.md` (lista de verificación del reproductor), `README.md` raíz (la app ya reproduce)

- [ ] **Step 1:** Agregar a la lista manual:
  - reproducir un álbum y apagar la pantalla;
  - controles en la notificación y en la pantalla de bloqueo;
  - botón de auriculares Bluetooth;
  - desconectar los auriculares → pausa;
  - entra una llamada → pausa y retoma;
  - aleatorio y repetir;
  - "a continuación" y "agregar a la cola";
  - cerrar la app y volver → misma canción y segundo, en pausa;
  - sincronizar mientras suena una canción desmarcada → sigue sonando y se borra en la próxima sincronización;
  - portadas en modo avión.
- [ ] **Step 2: Verificar** `npm run format:check`.
- [ ] **Step 3: Commit** — `docs: reproductor en la app`
