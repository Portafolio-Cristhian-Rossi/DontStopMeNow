# Etapa 1 — Base y servidor: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo con el paquete `shared` y el servidor completo: escanea carpetas de música, arma la biblioteca desde la metadata, gestiona listas, vincula celulares y expone la API HTTP del spec, anunciándose por mDNS.

**Architecture:** npm workspaces. `packages/shared` contiene tipos/esquemas zod y lógica pura (clave de álbum, plan de sincronización), consumidos como código TypeScript fuente (sin build). `apps/server` es Fastify sobre `node:sqlite`, organizado en unidades pequeñas (`db`, `scan`, `library`, `pairing`, `net`, `http`) que se conectan en `main.ts`. Todo el escaneo pasa por una cola serializada dentro del `scanner`.

**Tech Stack:** Node ≥ 22.22 (CI en 24), TypeScript ~5.9.3, ESM, Fastify 5, `node:sqlite`, music-metadata 12, chokidar 6, bonjour-service 1, zod 4, Vitest 5, tsx, ESLint 10 + typescript-eslint, Prettier.

**Spec:** `docs/superpowers/specs/2026-10-22-dontstopmenow-design.md`

## Global Constraints

- `"type": "module"` en todos los paquetes; `tsconfig` con `"module": "preserve"`, `"moduleResolution": "bundler"`, `"strict": true`, `"noEmit": true`, `"noUncheckedIndexedAccess": true`.
- `engines.node`: `">=22.22"` (chokidar 6 lo exige). CI corre en Node 24.
- TypeScript fijado en `~5.9.3` (typescript-eslint no soporta 7.x).
- Nombres de paquetes: `@dsmn/shared`, `@dsmn/server`. `@dsmn/shared` exporta `"./src/index.ts"`.
- El servidor se ejecuta con `tsx` (`npm start -w @dsmn/server` → `tsx src/main.ts`); sin paso de build en esta etapa.
- Puerto por defecto `4747` (`DSMN_PORT`); carpeta de datos `%APPDATA%\DontStopMeNow` (win32) o `~/.local/share/dontstopmenow` (otros), sobreescribible con `DSMN_DATA_DIR`. Contiene `library.db` y `covers/`.
- Servicio mDNS: tipo `dontstopmenow` / `tcp` (`_dontstopmenow._tcp`), TXT `{ id: serverId, v: "1" }`.
- Código de vinculación: un solo uso, vence a los `5 * 60_000` ms.
- Formatos: `.mp3 .flac .m4a .aac .ogg .oga .opus .wav` (sin distinguir mayúsculas).
- `rel_path` siempre con `/` como separador, sin `/` inicial ni final; `''` = raíz.
- Huella: `` `${size}:${sha1hex(primeros 64 KiB ++ últimos 64 KiB)}` `` (si el archivo mide ≤ 128 KiB, se hashea completo).
- Errores HTTP: `{ "error": { "code", "message" } }` con `code ∈ bad_request | unauthorized | forbidden | not_found | conflict | range_not_satisfiable | internal`.
- Valores faltantes: título → nombre de archivo sin extensión; artista → `"Artista desconocido"`; álbum → `"Sin álbum"`.
- Tests: `npm test` en la raíz corre todos los proyectos de Vitest; ningún test usa red real salvo `listen` en `127.0.0.1` puerto `0`.

## Review Focus

1. **Rutas de Windows** (`D:\Música\Rock\a.mp3`): `rel_path` debe guardarse como `Rock/a.mp3`; tests en Task 6 con `path.win32`.
2. **Unicode en nombres y tags** (`Canción ñandú.mp3`, artista `Björk`): se lee, guarda y sirve intacto; test en Task 8 y Task 11.
3. **Dos copias idénticas del mismo archivo** en carpetas distintas: son dos canciones distintas, la detección de movimientos no debe fusionarlas; test en Task 7.
4. **Archivo copiándose mientras se escanea** (truncado/ilegible): queda en `scan_issues` y, al reescanear ya completo, entra a la biblioteca y el issue desaparece; test en Task 8.
5. **Retomar una descarga ya completa** (`Range: bytes=<size>-`): debe responder `416` con `Content-Range: bytes */<size>`, no `500` ni el archivo entero; test en Task 11.

---

## Estructura de archivos

```
package.json  tsconfig.base.json  vitest.config.ts  eslint.config.js  .prettierrc.json  .gitignore
.github/workflows/ci.yml
packages/shared/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts            re-exporta todo
  src/constants.ts        DEFAULT_PORT, MDNS_SERVICE_TYPE, PAIRING_CODE_TTL_MS, textos por defecto
  src/normalize.ts        normalizeKey, albumId
  src/schemas.ts          esquemas zod + tipos inferidos (catálogo, API)
  src/syncPlan.ts         computeSyncPlan
  test/*.test.ts
apps/server/
  package.json  tsconfig.json  vitest.config.ts  README.md
  src/main.ts             arranque y cableado
  src/config.ts           loadConfig
  src/events.ts           EventBus tipado
  src/db/database.ts      openDatabase, migrate
  src/db/schema.ts        MIGRATIONS
  src/db/meta.ts          getMeta, setMeta, ensureServerId, getRevision
  src/library/revision.ts bumpRevision
  src/library/paths.ts    toRelPath, isUnderRelDir
  src/library/catalog.ts  buildCatalog
  src/library/playlists.ts
  src/library/roots.ts
  src/scan/fingerprint.ts
  src/scan/readTrack.ts
  src/scan/covers.ts
  src/scan/reconcile.ts   reconcile, refreshAlbums
  src/scan/scanner.ts     createScanner
  src/scan/watcher.ts     createWatcher
  src/pairing/pairing.ts  createPairing
  src/net/lanUrls.ts      getLanUrls
  src/net/discovery.ts    publishService
  src/http/app.ts         buildApp
  src/http/errors.ts      HttpError, errorHandler
  src/http/auth.ts        isLocalAddress, authHook
  src/http/range.ts       parseRange
  src/http/deviceRoutes.ts
  src/http/adminRoutes.ts
  test/helpers/mp3.ts     makeMp3 (generador de fixtures)
  test/helpers/fixtures.ts tmpDir, makeDb, makeLibrary
  test/**/*.test.ts
```

---

### Task 1: Monorepo, tooling, CI y normalización en `shared`

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/normalize.ts`
- Test: `packages/shared/test/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizeKey(s: string): string` — minúsculas (`toLocaleLowerCase('und')`), `NFC`, espacios colapsados y recortados.
  - `albumId(albumArtist: string, album: string): string` — `sha1hex(normalizeKey(albumArtist) + '\u0000' + normalizeKey(album)).slice(0, 16)`. Sin `node:crypto`, porque `shared` también corre en React Native: SHA-1 de `@noble/hashes` (dependencia de `@dsmn/shared`).
  - `constants.ts`: `DEFAULT_PORT = 4747`, `MDNS_SERVICE_TYPE = 'dontstopmenow'`, `PAIRING_CODE_TTL_MS = 300_000`, `UNKNOWN_ARTIST = 'Artista desconocido'`, `UNKNOWN_ALBUM = 'Sin álbum'`.
  - Scripts raíz: `test` (`vitest run`), `lint` (`eslint .`), `typecheck` (`npm run typecheck --workspaces --if-present`), `format:check` (`prettier --check .`).

- [ ] **Step 1: Crear el andamiaje.** Root `package.json` con `"private": true`, `"workspaces": ["packages/*", "apps/*"]`, scripts de arriba y devDependencies `typescript@~5.9.3 vitest@^5 eslint@^10 typescript-eslint@^8 prettier@^3 @types/node`. `vitest.config.ts` raíz con `test.projects: ['packages/*', 'apps/*']`. `.gitignore`: `node_modules/`, `coverage/`, `*.db`, `.dsmn-data/`. CI: `actions/checkout`, `actions/setup-node` (node 24, cache npm), `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/shared/test/normalize.test.ts
import { describe, expect, it } from 'vitest';
import { albumId, normalizeKey } from '../src/index.ts';

describe('normalizeKey', () => {
  it('pasa a minúsculas, colapsa y recorta espacios', () => {
    expect(normalizeKey('  The   Beatles ')).toBe('the beatles');
  });
  it('normaliza a NFC', () => {
    expect(normalizeKey('Cancio\u0301n')).toBe(normalizeKey('Canción'));
  });
});

describe('albumId', () => {
  it('es estable e insensible a mayúsculas/espacios', () => {
    expect(albumId('Queen', 'A Night at the Opera')).toBe(albumId(' queen ', 'a night  at the opera'));
  });
  it('tiene 16 caracteres hex', () => {
    expect(albumId('Queen', 'Jazz')).toMatch(/^[0-9a-f]{16}$/);
  });
  it('distingue artista de álbum', () => {
    expect(albumId('ab', 'c')).not.toBe(albumId('a', 'bc'));
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — `npm install && npx vitest run packages/shared` → FAIL (módulo inexistente).
- [ ] **Step 4: Implementar `normalize.ts`, `constants.ts` e `index.ts`.**
- [ ] **Step 5: Verificar** — `npm test && npm run lint && npm run typecheck && npm run format:check` → todo PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: monorepo, tooling, CI y normalización de claves en shared"`

---

### Task 2: Esquemas zod y tipos del catálogo/API

**Files:**
- Create: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/schemas.test.ts`

**Interfaces:**
- Produces (cada esquema `XSchema` exporta además `type X = z.infer<typeof XSchema>`):
  - `AudioFormat`: `'mp3' | 'flac' | 'm4a' | 'aac' | 'ogg' | 'opus' | 'wav'`
  - `Track`: `{ id, title, artist, albumId: string; trackNo, discNo: number | null; durationMs, size: number; format: AudioFormat; fingerprint: string; coverId: string | null; available: boolean }`
  - `Album`: `{ id, title, artist: string; year: number | null; coverId: string | null; trackIds: string[] }`
  - `Playlist`: `{ id, name: string; type: 'manual' | 'folder'; folder: { rootId: number; relPath: string } | null; trackIds: string[] }`
  - `Catalog`: `{ serverId: string; revision: number; tracks: Track[]; albums: Album[]; playlists: Playlist[] }`
  - `ApiError`: `{ error: { code: ErrorCode; message: string } }`, `ErrorCode` = los códigos de Global Constraints.
  - `PairRequest`: `{ code: string (1..32); deviceName: string (trim, 1..64) }`; `PairResponse`: `{ token, serverId, serverName: string }`
  - `QrPayload`: `{ v: 1; serverId: string; urls: string[] (url, ≥1); code: string }`
  - `PairingCodeResponse`: `{ code: string; expiresAt: number; qrPayload: string }` (`qrPayload` = `JSON.stringify(QrPayload)`)
  - `CreatePlaylistRequest`: unión discriminada por `type`: `{ type: 'manual'; name; trackIds?: string[] }` | `{ type: 'folder'; name; rootId: number (int); folderRelPath: string }`; `name` = string trim 1..100.
  - `UpdatePlaylistRequest`: `{ name?: string; trackIds?: string[] }`, con al menos una de las dos.
  - `Root`: `{ id: number; path: string; status: 'online' | 'offline' }`; `AddRootRequest`: `{ path: string (min 1) }`
  - `BrowseResponse`: `{ rootId: number; path: string; folders: string[] }`
  - `Device`: `{ id, name: string; createdAt: number; lastSeenAt: number | null }`
  - `ScanIssue`: `{ path: string; error: string; detectedAt: number }`
  - `ScanStatus`: `{ running: boolean; processed: number; total: number }`
  - Timestamps: ms desde epoch.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { CreatePlaylistRequestSchema, PairRequestSchema, QrPayloadSchema, UpdatePlaylistRequestSchema } from '../src/index.ts';

describe('schemas', () => {
  it('CreatePlaylistRequest discrimina por type', () => {
    expect(CreatePlaylistRequestSchema.parse({ type: 'manual', name: ' Gym ' })).toEqual({ type: 'manual', name: 'Gym' });
    expect(CreatePlaylistRequestSchema.safeParse({ type: 'folder', name: 'X' }).success).toBe(false);
    expect(CreatePlaylistRequestSchema.safeParse({ type: 'manual', name: '   ' }).success).toBe(false);
  });
  it('UpdatePlaylistRequest exige algún campo', () => {
    expect(UpdatePlaylistRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdatePlaylistRequestSchema.safeParse({ trackIds: [] }).success).toBe(true);
  });
  it('PairRequest recorta y limita deviceName', () => {
    expect(PairRequestSchema.parse({ code: 'ABC123', deviceName: ' Pixel ' }).deviceName).toBe('Pixel');
    expect(PairRequestSchema.safeParse({ code: 'A', deviceName: 'x'.repeat(65) }).success).toBe(false);
  });
  it('QrPayload exige v=1 y al menos una url', () => {
    expect(QrPayloadSchema.safeParse({ v: 1, serverId: 's', urls: [], code: 'c' }).success).toBe(false);
    expect(QrPayloadSchema.safeParse({ v: 1, serverId: 's', urls: ['http://192.168.0.2:4747'], code: 'c' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run packages/shared/test/schemas.test.ts` → FAIL.
- [ ] **Step 3: Implementar `schemas.ts`** (zod 4) y re-exportar.
- [ ] **Step 4: Run** → PASS; `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(shared): esquemas zod del catálogo y la API"` (incluye archivos nuevos con `git add`).

---

### Task 3: `computeSyncPlan`

**Files:**
- Create: `packages/shared/src/syncPlan.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/syncPlan.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `Track` (Task 2).
- Produces:
  - `type Selection = { kind: 'album' | 'playlist'; id: string }`
  - `type LocalDownload = { trackId: string; fingerprint: string }`
  - `computeSyncPlan(catalog: Pick<Catalog, 'tracks' | 'albums' | 'playlists'>, selection: Selection[], downloads: LocalDownload[]): { download: Track[]; delete: string[]; prunedSelection: Selection[] }` — reglas exactas del spec §6.2. `download` sin duplicados, en el orden de aparición en la selección; `delete` sin duplicados.

- [ ] **Step 1: Write the failing test** — catálogo de prueba: tracks `t1..t5` (`t5.available = false`), álbum `a1 = [t1, t2]`, lista `p1 = [t2, t3]`.

```ts
it('baja la unión de lo seleccionado una sola vez', () => {
  const plan = computeSyncPlan(cat, [{ kind: 'album', id: 'a1' }, { kind: 'playlist', id: 'p1' }], []);
  expect(plan.download.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  expect(plan.delete).toEqual([]);
});
it('borra lo bajado que ya no es deseado', () => {
  const plan = computeSyncPlan(cat, [{ kind: 'album', id: 'a1' }], [dl('t1'), dl('t3')]);
  expect(plan.download.map((t) => t.id)).toEqual(['t2']);
  expect(plan.delete).toEqual(['t3']);
});
it('rebaja si cambió la huella', () => {
  const plan = computeSyncPlan(cat, [{ kind: 'album', id: 'a1' }], [{ trackId: 't1', fingerprint: 'viejo' }, dl('t2')]);
  expect(plan.download.map((t) => t.id)).toEqual(['t1']);
});
it('poda selección inexistente y borra sus canciones', () => {
  const plan = computeSyncPlan(cat, [{ kind: 'playlist', id: 'borrada' }], [dl('t3')]);
  expect(plan.prunedSelection).toEqual([]);
  expect(plan.delete).toEqual(['t3']);
});
it('no baja ni borra canciones no disponibles que siguen seleccionadas', () => {
  const c = { ...cat, albums: [...cat.albums, { id: 'a2', title: 'X', artist: 'Y', year: null, coverId: null, trackIds: ['t5'] }] };
  expect(computeSyncPlan(c, [{ kind: 'album', id: 'a2' }], []).download).toEqual([]);
  expect(computeSyncPlan(c, [{ kind: 'album', id: 'a2' }], [dl('t5')]).delete).toEqual([]);
});
it('borra descargas de canciones que ya no existen en el catálogo', () => {
  expect(computeSyncPlan(cat, [], [{ trackId: 'fantasma', fingerprint: 'x' }]).delete).toEqual(['fantasma']);
});
```
(`dl(id)` devuelve `{ trackId: id, fingerprint: <huella del catálogo> }`.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(shared): computeSyncPlan`

---

### Task 4: Configuración, base de datos y meta

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`, `src/config.ts`, `src/events.ts`, `src/db/database.ts`, `src/db/schema.ts`, `src/db/meta.ts`, `src/library/revision.ts`, `src/http/errors.ts`, `test/helpers/fixtures.ts`
- Test: `test/config.test.ts`, `test/db.test.ts`

(Rutas relativas a `apps/server/` desde aquí.)

**Interfaces:**
- Produces:
  - `interface Config { dataDir: string; dbPath: string; coversDir: string; port: number }`; `loadConfig(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, homedir: string): Config`. Puerto inválido (no entero o fuera de 1..65535) → `throw new Error('DSMN_PORT inválido: …')`. Usa `path.win32.join` cuando `platform === 'win32'`.
  - `openDatabase(file: string): DatabaseSync` (`':memory:'` permitido) — `PRAGMA journal_mode = WAL` (salvo memoria), `PRAGMA foreign_keys = ON`, luego `migrate(db)`.
  - `migrate(db)` — aplica `MIGRATIONS[i]` para `i ≥ PRAGMA user_version` dentro de una transacción y actualiza `user_version`.
  - `MIGRATIONS[0]`: tablas del spec §4.2 con: `roots.path UNIQUE`; `tracks.root_id REFERENCES roots ON DELETE CASCADE`, `UNIQUE(root_id, rel_path)`, índices en `fingerprint` y `album_id`; `playlists.root_id REFERENCES roots ON DELETE CASCADE`; `playlist_tracks` con `PRIMARY KEY (playlist_id, position)`, ambas FKs `ON DELETE CASCADE`; `devices.token_hash UNIQUE`; `scan_issues.path PRIMARY KEY` (ruta absoluta); `meta(key PRIMARY KEY, value)`.
  - `getMeta(db, key): string | undefined`, `setMeta(db, key, value)`, `ensureServerId(db): string` (genera `crypto.randomUUID()` una vez), `getRevision(db): number` (0 si no existe).
  - `class EventBus` con `on/off/emit` tipados para `{ scan: ScanStatus; revision: { revision: number } }` (envoltorio de `EventEmitter`).
  - `bumpRevision(db, bus): number` — incrementa `library_revision`, emite `revision`, devuelve el nuevo valor.
  - `class HttpError extends Error { constructor(public status: number, public code: ErrorCode, message: string) }` en `src/http/errors.ts` (lo usan las unidades de `library` y `pairing`; el `errorHandler` se agrega en Task 11).
  - `test/helpers/fixtures.ts`: `tmpDir(): Promise<string>` (mkdtemp, borrado en `afterEach` registrado por el helper), `makeDb(): DatabaseSync` (memoria).

- [ ] **Step 1: Write the failing tests**

```ts
// test/config.test.ts
it('usa APPDATA en Windows', () => {
  const c = loadConfig({ APPDATA: 'C:\\Users\\cris\\AppData\\Roaming' }, 'win32', 'C:\\Users\\cris');
  expect(c.dataDir).toBe('C:\\Users\\cris\\AppData\\Roaming\\DontStopMeNow');
  expect(c.dbPath).toBe('C:\\Users\\cris\\AppData\\Roaming\\DontStopMeNow\\library.db');
  expect(c.port).toBe(4747);
});
it('usa ~/.local/share en Linux y respeta overrides', () => {
  expect(loadConfig({}, 'linux', '/home/c').dataDir).toBe('/home/c/.local/share/dontstopmenow');
  const c = loadConfig({ DSMN_DATA_DIR: '/data', DSMN_PORT: '8000' }, 'linux', '/home/c');
  expect([c.dataDir, c.coversDir, c.port]).toEqual(['/data', '/data/covers', 8000]);
});
it('rechaza puertos inválidos', () => {
  expect(() => loadConfig({ DSMN_PORT: 'abc' }, 'linux', '/h')).toThrow(/DSMN_PORT/);
  expect(() => loadConfig({ DSMN_PORT: '70000' }, 'linux', '/h')).toThrow(/DSMN_PORT/);
});

// test/db.test.ts
it('migra y es idempotente', () => {
  const db = makeDb();
  migrate(db);
  expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
});
it('serverId persiste', () => { const db = makeDb(); expect(ensureServerId(db)).toBe(ensureServerId(db)); });
it('bumpRevision incrementa y emite', () => {
  const db = makeDb(); const bus = new EventBus(); const seen: number[] = [];
  bus.on('revision', (e) => seen.push(e.revision));
  expect([bumpRevision(db, bus), bumpRevision(db, bus)]).toEqual([1, 2]);
  expect(seen).toEqual([1, 2]); expect(getRevision(db)).toBe(2);
});
it('borrar una raíz borra sus canciones y listas de carpeta en cascada', () => { /* insertar root, track, playlist folder; DELETE root; contar 0 */ });
```

- [ ] **Step 2: Run** `npx vitest run apps/server` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS, `npm run typecheck` PASS.
- [ ] **Step 5: Commit** — `feat(server): configuración, base SQLite, migraciones y revisión`

---

### Task 5: Generador de MP3 de prueba, lectura de metadata y huella

**Files:**
- Create: `test/helpers/mp3.ts`, `src/scan/readTrack.ts`, `src/scan/fingerprint.ts`
- Test: `test/scan/readTrack.test.ts`, `test/scan/fingerprint.test.ts`

**Interfaces:**
- Produces:
  - `makeMp3(tags: Partial<{ title; artist; albumArtist; album; track: string; disc: string; year: string }>, opts?: { seconds?: number; picture?: { mime: string; data: Uint8Array } }): Uint8Array`
  - `interface TrackMeta { title: string; artist: string; albumArtist: string | null; album: string; trackNo: number | null; discNo: number | null; year: number | null; durationMs: number; format: AudioFormat }`
  - `formatFromPath(p: string): AudioFormat | null` (extensiones de Global Constraints; `.oga`→`ogg`).
  - `readTrackFile(absPath: string): Promise<{ meta: TrackMeta; picture: { mime: string; data: Uint8Array } | null }>` — `parseFile` de music-metadata con `{ duration: true }`; fallbacks del spec; `durationMs = Math.round(format.duration * 1000)` o `0`. Lanza si music-metadata lanza o no detecta audio (`format.duration` indefinido y sin `format.container`).
  - `fingerprintFile(absPath: string, size: number): Promise<string>` — formato de Global Constraints, leyendo con `fs.promises.open` solo las dos ventanas.

`makeMp3` (el algoritmo no lo determina la firma):
```
ID3v2.4: "ID3" 0x04 0x00 0x00 + tamaño synchsafe(4) + frames.
Frame de texto: id(4: TIT2 TPE1 TPE2 TALB TRCK TPOS TDRC) + synchsafe(4) + 0x0000 + 0x03 (UTF-8) + bytes.
APIC: 0x03 + mime + 0x00 + 0x03 (portada) + 0x00 (descripción vacía) + datos.
Audio: round(seconds * 38.28) frames MPEG-1 Layer III 128 kbps 44.1 kHz:
  cabecera FF FB 90 00 + 413 bytes en cero (417 bytes por frame). seconds por defecto = 1.
```

- [ ] **Step 1: Write the failing tests**

```ts
it('lee tags completos', async () => {
  const f = await writeTmp('a.mp3', makeMp3({ title: 'Canción ñandú', artist: 'Björk', albumArtist: 'Varios', album: 'Homogenic', track: '3/10', disc: '1/2', year: '1997' }, { seconds: 2 }));
  const { meta, picture } = await readTrackFile(f);
  expect(meta).toMatchObject({ title: 'Canción ñandú', artist: 'Björk', albumArtist: 'Varios', album: 'Homogenic', trackNo: 3, discNo: 1, year: 1997, format: 'mp3' });
  expect(meta.durationMs).toBeGreaterThan(1500); expect(meta.durationMs).toBeLessThan(2500);
  expect(picture).toBeNull();
});
it('aplica valores por defecto sin tags', async () => {
  const { meta } = await readTrackFile(await writeTmp('Mi tema.mp3', makeMp3({})));
  expect(meta).toMatchObject({ title: 'Mi tema', artist: 'Artista desconocido', albumArtist: null, album: 'Sin álbum', trackNo: null });
});
it('devuelve la portada incrustada', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const { picture } = await readTrackFile(await writeTmp('c.mp3', makeMp3({}, { picture: { mime: 'image/png', data: png } })));
  expect(picture?.mime).toBe('image/png'); expect([...picture!.data]).toEqual([...png]);
});
it('lanza con un archivo que no es audio', async () => {
  await expect(readTrackFile(await writeTmp('x.mp3', new TextEncoder().encode('hola')))).rejects.toThrow();
});
it('formatFromPath', () => {
  expect(['a.MP3', 'b.oga', 'c.opus', 'd.txt'].map(formatFromPath)).toEqual(['mp3', 'ogg', 'opus', null]);
});
// fingerprint.test.ts
it('igual contenido → igual huella; un byte distinto al final → distinta', async () => { /* 300 KiB aleatorios; mutar último byte */ });
it('archivos chicos se hashean completos', async () => { /* 10 bytes: huella empieza con "10:" y cambia si cambia un byte del medio */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** (`npm i -w @dsmn/server music-metadata`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): lectura de metadata, huella y generador de MP3 de prueba`

---

### Task 6: Rutas relativas y portadas

**Files:**
- Create: `src/library/paths.ts`, `src/scan/covers.ts`
- Test: `test/library/paths.test.ts`, `test/scan/covers.test.ts`

**Interfaces:**
- Produces:
  - `toRelPath(rootPath: string, absPath: string, p?: path.PlatformPath): string` — `p.relative`, separadores → `/`. Lanza si `absPath` no está dentro de `rootPath`.
  - `isUnderRelDir(relPath: string, relDir: string): boolean` — `relDir === ''` o `relPath === relDir` o `relPath.startsWith(relDir + '/')`.
  - `findFolderCover(dirAbs: string): Promise<{ mime: string; data: Uint8Array } | null>` — busca, sin distinguir mayúsculas, `cover.jpg`, `cover.png`, `folder.jpg`, `folder.png` en ese orden.
  - `saveCover(db, coversDir: string, pic: { mime; data }): string` — `id = sha1hex(data).slice(0, 20)`; escribe `coversDir/<id>` si no existe; `INSERT OR IGNORE INTO covers`. Devuelve `id`.

- [ ] **Step 1: Write the failing tests**

```ts
it('convierte rutas de Windows a rel_path con /', () => {
  expect(toRelPath('D:\\Música', 'D:\\Música\\Rock\\Queen\\a.mp3', path.win32)).toBe('Rock/Queen/a.mp3');
});
it('rechaza rutas fuera de la raíz', () => {
  expect(() => toRelPath('/m', '/otra/a.mp3', path.posix)).toThrow();
});
it('isUnderRelDir no confunde prefijos', () => {
  expect(isUnderRelDir('Rock/a.mp3', 'Rock')).toBe(true);
  expect(isUnderRelDir('Rockabilly/a.mp3', 'Rock')).toBe(false);
  expect(isUnderRelDir('x.mp3', '')).toBe(true);
});
it('findFolderCover encuentra Folder.JPG', async () => { /* crear Folder.JPG; mime image/jpeg */ });
it('saveCover deduplica por contenido', () => { /* dos llamadas mismo data → mismo id, un archivo, una fila */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): rutas relativas y caché de portadas`

---

### Task 7: Reconciliación (altas, cambios, movimientos, bajas) y álbumes

**Files:**
- Create: `src/scan/reconcile.ts`
- Test: `test/scan/reconcile.test.ts`

**Interfaces:**
- Consumes: `albumId`, `UNKNOWN_*` (Task 1), `TrackMeta` (Task 5).
- Produces:
  - `interface ScannedFile { rootId: number; relPath: string; size: number; mtimeMs: number; fingerprint: string; meta: TrackMeta; coverId: string | null }`
  - `reconcile(db, input: { scanned: ScannedFile[]; missingTrackIds: string[] }): { added: number; updated: number; moved: number; removed: number }` — en una transacción, para cada `scanned`:
    1. existe fila con `(root_id, rel_path)` → actualizar metadata/huella/size/mtime, conservar `id` (`updated`);
    2. si no, primera fila de `missingTrackIds` aún no reclamada con la misma huella → actualizar ruta y metadata, conservar `id` (`moved`);
    3. si no → insertar con `crypto.randomUUID()` (`added`).
    Luego borra las filas de `missingTrackIds` no reclamadas (`removed`) y llama `refreshAlbums(db)`. `tracks.album_id = albumId(meta.albumArtist ?? meta.artist, meta.album)`.
  - `refreshAlbums(db): void` — reconstruye `albums` desde `tracks`: `title` y `artist` de la primera canción por `(disc_no, track_no, title)`, `year` = máximo, `cover_id` = primera canción con portada en ese orden.

- [ ] **Step 1: Write the failing tests** (helper `sf(relPath, fp, meta?)` arma un `ScannedFile` en la raíz 1)

```ts
it('inserta, y al reescanear la misma ruta conserva el id', () => {
  reconcile(db, { scanned: [sf('a.mp3', 'f1')], missingTrackIds: [] });
  const id = trackId('a.mp3');
  expect(reconcile(db, { scanned: [sf('a.mp3', 'f2', { title: 'Nuevo' })], missingTrackIds: [] }).updated).toBe(1);
  expect(trackId('a.mp3')).toBe(id);
});
it('detecta un movimiento y conserva las listas', () => {
  reconcile(db, { scanned: [sf('Viejo/a.mp3', 'f1')], missingTrackIds: [] });
  const id = trackId('Viejo/a.mp3'); addToManualPlaylist(id);
  const r = reconcile(db, { scanned: [sf('Nuevo/a.mp3', 'f1')], missingTrackIds: [id] });
  expect(r).toMatchObject({ moved: 1, added: 0, removed: 0 });
  expect(trackId('Nuevo/a.mp3')).toBe(id); expect(playlistTrackIds()).toEqual([id]);
});
it('dos copias idénticas presentes son dos canciones', () => {
  const r = reconcile(db, { scanned: [sf('A/x.mp3', 'f1'), sf('B/x.mp3', 'f1')], missingTrackIds: [] });
  expect(r.added).toBe(2);
});
it('borra faltantes no reclamados y los saca de las listas', () => { /* removed 1, playlist vacía */ });
it('arma álbumes por artista del álbum', () => {
  reconcile(db, { scanned: [
    sf('1.mp3', 'a', { artist: 'Queen', albumArtist: null, album: 'Jazz', trackNo: 2 }),
    sf('2.mp3', 'b', { artist: 'Invitado', albumArtist: 'Queen', album: 'jazz', trackNo: 1 }),
  ], missingTrackIds: [] });
  const albums = db.prepare('SELECT * FROM albums').all();
  expect(albums).toHaveLength(1); expect(albums[0]).toMatchObject({ title: 'jazz', artist: 'Queen' });
});
it('elimina álbumes que quedaron vacíos', () => { /* */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): reconciliación de canciones con detección de movimientos`

---

### Task 8: Scanner

**Files:**
- Create: `src/scan/scanner.ts`, `test/helpers/fixtures.ts` (agregar `makeLibrary`)
- Test: `test/scan/scanner.test.ts`

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces:
  - `type Scope = { rootId: number; relDir: string }`
  - `interface ScanSummary { added: number; updated: number; moved: number; removed: number; issues: number }`
  - `interface Scanner { scanAll(): Promise<ScanSummary>; scanScopes(scopes: Scope[]): Promise<ScanSummary>; status(): ScanStatus }`
  - `createScanner(deps: { db: DatabaseSync; bus: EventBus; coversDir: string }): Scanner`
  - `makeLibrary(files: Record<string, Uint8Array>): Promise<string>` (crea carpeta temporal con esos archivos; claves con `/`).

Comportamiento:
- Todas las llamadas se encadenan en una cola (una promesa a la vez); `scanAll()` = `scanScopes` con `{ rootId, relDir: '' }` de cada raíz.
- Por cada scope: si la carpeta de la raíz no existe o no es directorio → raíz `offline` (si cambió, cuenta como cambio) y se saltea **sin** tocar sus canciones. Si existe y estaba `offline` → `online`.
- Recorre `join(root, relDir)` recursivamente; ignora entradas que empiezan con `.` y extensiones no soportadas.
- Filas del scope (`isUnderRelDir`) con igual `size` y `mtimeMs` → sin cambios (no se leen). Nuevas o cambiadas → `readTrackFile` + `fingerprintFile` + portada (`picture` o `findFolderCover` del directorio, guardada con `saveCover`). Si falla la lectura → `INSERT OR REPLACE` en `scan_issues` (ruta absoluta, mensaje) y la fila existente, si la hay, queda intacta (no cuenta como faltante). Si la lectura funciona → se borra su issue.
- Filas del scope cuyos archivos ya no están → `missingTrackIds`. Se llama **una** vez a `reconcile` con todo lo de todos los scopes de la llamada.
- Si hubo algún cambio (conteos > 0 o cambio de estado de raíz) → `bumpRevision`.
- Emite `scan` con `{ running: true, processed, total }` cada 50 archivos y `{ running: false, processed, total }` al final.

- [ ] **Step 1: Write the failing tests**

```ts
it('escanea una biblioteca y es idempotente', async () => {
  const dir = await makeLibrary({ 'Queen/Jazz/01.mp3': makeMp3({ artist: 'Queen', album: 'Jazz' }), 'notas.txt': enc('x'), '.oculto.mp3': makeMp3({}) });
  const root = addRootRow(db, dir);
  expect(await scanner.scanAll()).toMatchObject({ added: 1, issues: 0 });
  expect(getRevision(db)).toBe(1);
  expect(await scanner.scanAll()).toMatchObject({ added: 0, updated: 0, removed: 0 });
  expect(getRevision(db)).toBe(1);
});
it('guarda títulos y rutas Unicode', async () => { /* 'Música/Canción ñandú.mp3' con artist 'Björk' → fila con rel_path y artist exactos */ });
it('detecta un movimiento entre carpetas', async () => { /* scanAll, fs.rename a otra carpeta, scanAll → moved 1, mismo id */ });
it('raíz desconectada: no borra y la marca offline; al volver, online', async () => {
  /* scanAll; fs.rename(dir, dir + '-x'); scanAll → removed 0, status offline, revisión sube;
     fs.rename de vuelta; scanAll → online */
});
it('archivo truncado va a issues y se limpia al completarse', async () => {
  const full = makeMp3({ title: 'Grande' }, { seconds: 3 });
  await writeFile(join(dir, 'g.mp3'), full.slice(0, 5));
  expect((await scanner.scanAll()).issues).toBe(1);
  await writeFile(join(dir, 'g.mp3'), full);
  expect(await scanner.scanAll()).toMatchObject({ added: 1, issues: 0 });
  expect(db.prepare('SELECT COUNT(*) n FROM scan_issues').get()).toEqual({ n: 0 });
});
it('scanScopes solo mira el subárbol pedido', async () => { /* borrar archivo en A y en B; scanScopes([{rootId, relDir:'A'}]) → removed 1 */ });
it('usa folder.jpg cuando no hay portada incrustada', async () => { /* track.cover_id no nulo */ });
it('serializa llamadas concurrentes', async () => {
  const [a, b] = await Promise.all([scanner.scanAll(), scanner.scanAll()]);
  expect(a.added + b.added).toBe(1);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): scanner con escaneos parciales, raíces offline e issues`

---

### Task 9: Catálogo y listas

**Files:**
- Create: `src/library/catalog.ts`, `src/library/playlists.ts`
- Test: `test/library/catalog.test.ts`, `test/library/playlists.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `CreatePlaylistRequest`, `UpdatePlaylistRequest` (Task 2); `bumpRevision` (Task 4); `isUnderRelDir` (Task 6).
- Produces:
  - `buildCatalog(db, serverId: string): Catalog` — `available = raíz online`; álbumes ordenados por `(artist, title)` con `trackIds` por `(disc_no, track_no, title)`; listas ordenadas por `name`; manual por `position`; de carpeta = canciones de esa raíz con `isUnderRelDir(rel_path, folder_rel_path)` ordenadas por `rel_path`; `tracks` ordenadas por `(artist, album, disc_no, track_no)`.
  - En `playlists.ts` (errores con `HttpError` de Task 4):
    - `createPlaylist(db, bus, req: CreatePlaylistRequest): Playlist` — manual: `trackIds` desconocidos → `400 bad_request`; folder: raíz inexistente → `400`; `folderRelPath` normalizado (sin `/` inicial/final, `\`→`/`), con `..` → `400`, carpeta inexistente en disco → `400`.
    - `updatePlaylist(db, bus, id, req: UpdatePlaylistRequest): Playlist` — `404` si no existe; `trackIds` en lista de carpeta → `409 conflict`; reemplaza posiciones `0..n-1`.
    - `deletePlaylist(db, bus, id): void` — `404` si no existe.
    - Cada operación exitosa llama `bumpRevision`. Devuelven el `Playlist` tal como sale en `buildCatalog`.

- [ ] **Step 1: Write the failing tests**

```ts
it('lista de carpeta incluye subcarpetas y se actualiza sola', async () => {
  /* biblioteca con 'Chill/a.mp3', 'Chill/Más/b.mp3', 'Otros/c.mp3'; scanAll;
     createPlaylist folder 'Chill' → trackIds [a, b];
     agregar 'Chill/d.mp3' + scanAll → buildCatalog la incluye */
});
it('marca no disponibles las canciones de raíces offline', () => { /* UPDATE roots SET status='offline' → available false */ });
it('crear/editar/borrar lista manual sube la revisión', () => { /* revisiones 1,2,3; orden de trackIds respetado */ });
it('rechaza trackIds desconocidos y carpetas con ..', () => {
  expect(() => createPlaylist(db, bus, { type: 'manual', name: 'X', trackIds: ['nope'] })).toThrow(expect.objectContaining({ status: 400 }));
  expect(() => createPlaylist(db, bus, { type: 'folder', name: 'X', rootId: 1, folderRelPath: '../afuera' })).toThrow(expect.objectContaining({ status: 400 }));
});
it('no permite fijar trackIds en una lista de carpeta', () => { /* 409 */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): catálogo y gestión de listas`

---

### Task 10: Raíces, explorador de carpetas y vinculación

**Files:**
- Create: `src/library/roots.ts`, `src/pairing/pairing.ts`, `src/net/lanUrls.ts`
- Test: `test/library/roots.test.ts`, `test/pairing/pairing.test.ts`, `test/net/lanUrls.test.ts`

**Interfaces:**
- Produces:
  - `listRoots(db): Root[]`; `addRoot(db, bus, absPath: string): Root` — no absoluta / no existe / no es carpeta → `400`; duplicada, o dentro de / contenedora de otra raíz → `409`. Crea con estado `online` y llama `bumpRevision`. (El escaneo lo dispara la ruta HTTP.)
  - `removeRoot(db, bus, id): void` — `404` si no existe; `DELETE` (cascada), `refreshAlbums`, `bumpRevision`.
  - `browse(db, rootId, relPath: string): BrowseResponse` — subcarpetas inmediatas (sin las que empiezan con `.`) ordenadas con `localeCompare`; `..`, absoluta o fuera de la raíz → `400`; raíz inexistente → `404`; raíz offline → `409`.
  - `interface Pairing { createCode(now?: number): { code: string; expiresAt: number }; redeem(code: string, deviceName: string, now?: number): { token: string; deviceId: string } | null; verifyToken(token: string): Device | null; listDevices(): Device[]; revokeDevice(id: string): boolean }`
  - `createPairing(db): Pairing` — código de 6 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, guardado en memoria, un solo uso, vence a los `PAIRING_CODE_TTL_MS`; token = 32 bytes `base64url`; se guarda `sha256hex(token)`; `verifyToken` actualiza `last_seen_at`.
  - `getLanUrls(port: number, ifaces?: ReturnType<typeof os.networkInterfaces>): string[]` — IPv4 no internas en `10/8`, `172.16/12`, `192.168/16`, como `http://<ip>:<port>`.

- [ ] **Step 1: Write the failing tests**

```ts
it('addRoot valida y rechaza raíces anidadas', async () => {
  const dir = await tmpDir(); await mkdir(join(dir, 'sub'));
  expect(addRoot(db, bus, dir).status).toBe('online');
  expect(() => addRoot(db, bus, dir)).toThrow(expect.objectContaining({ status: 409 }));
  expect(() => addRoot(db, bus, join(dir, 'sub'))).toThrow(expect.objectContaining({ status: 409 }));
  expect(() => addRoot(db, bus, 'relativa')).toThrow(expect.objectContaining({ status: 400 }));
  expect(() => addRoot(db, bus, join(dir, 'no-existe'))).toThrow(expect.objectContaining({ status: 400 }));
});
it('browse lista subcarpetas y bloquea escapes', async () => { /* carpetas B, a, .git → ['a','B']; '../' → 400 */ });
it('removeRoot borra canciones, álbumes y listas de carpeta', async () => { /* */ });

it('el código se canjea una sola vez', () => {
  const p = createPairing(db); const { code } = p.createCode(0);
  const r = p.redeem(code, 'Pixel', 1000); expect(r).not.toBeNull();
  expect(p.redeem(code, 'Otro', 1000)).toBeNull();
  expect(p.verifyToken(r!.token)?.name).toBe('Pixel');
});
it('el código vence a los 5 minutos', () => {
  const p = createPairing(db); const { code } = p.createCode(0);
  expect(p.redeem(code, 'Pixel', 300_001)).toBeNull();
});
it('revocar invalida el token y no se guarda el token en claro', () => {
  /* revokeDevice → verifyToken null; SELECT token_hash != token */
});
it('getLanUrls filtra IPs privadas IPv4', () => {
  expect(getLanUrls(4747, {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as any],
    eth: [{ address: '192.168.1.20', family: 'IPv4', internal: false } as any, { address: 'fe80::1', family: 'IPv6', internal: false } as any],
    vpn: [{ address: '100.64.0.2', family: 'IPv4', internal: false } as any],
  })).toEqual(['http://192.168.1.20:4747']);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): raíces, explorador de carpetas y vinculación de dispositivos`

---

### Task 11: App HTTP, autenticación y rutas de dispositivo

**Files:**
- Create: `src/http/app.ts`, `src/http/auth.ts`, `src/http/range.ts`, `src/http/deviceRoutes.ts`; completar `src/http/errors.ts`
- Test: `test/http/range.test.ts`, `test/http/device.test.ts`

**Interfaces:**
- Consumes: Tasks 4–10.
- Produces:
  - `interface AppDeps { db: DatabaseSync; bus: EventBus; scanner: Scanner; pairing: Pairing; config: Config; serverId: string; serverName: string; lanUrls: () => string[]; onRootsChanged?: () => void }`
  - `buildApp(deps: AppDeps): FastifyInstance` (`trustProxy: false`, `logger` desactivado en tests).
  - `isLocalAddress(ip: string): boolean` — `127.0.0.1`, `::1`, `::ffff:127.0.0.1`.
  - Cada ruta declara `config: { access: 'public' | 'device' | 'admin' }`. Hook `onRequest`: local → permitido; remoto + `admin` → `403 forbidden`; remoto + `device` sin `Bearer` válido → `401 unauthorized`.
  - `errorHandler`: `HttpError` → su status/código; error de validación zod → `400 bad_request`; el resto → `500 internal` (mensaje genérico).
  - Validación: helper `parseBody(schema, body)` que lanza `HttpError(400)` con el primer mensaje de zod.
  - `parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null` — `null` sin header; soporta `bytes=N-` y `bytes=N-M` (un solo rango; `M` se recorta a `size-1`); `N >= size`, `N > M` o sintaxis distinta → `'invalid'`.
  - Rutas: `POST /api/pair` (public; código inválido, usado o vencido → `401 unauthorized`), `GET /api/catalog` (device; `ETag: "<revision>"`; `If-None-Match` igual → `304`), `GET /api/tracks/:id/file` (device; `404` id desconocido; `409` raíz offline o archivo inexistente; `200` completo o `206` con `Content-Range`; `416` con `Content-Range: bytes */<size>`; siempre `Accept-Ranges: bytes`; `Content-Type` por formato: mp3 `audio/mpeg`, flac `audio/flac`, m4a `audio/mp4`, aac `audio/aac`, ogg/opus `audio/ogg`, wav `audio/wav`), `GET /api/covers/:id` (device; `Cache-Control: public, max-age=31536000, immutable`; `404` si no existe).

- [ ] **Step 1: Write the failing tests** (`app.inject`; red remota con `remoteAddress: '192.168.1.50'`)

```ts
// range.test.ts
it.each([
  [undefined, 100, null], ['bytes=0-', 100, { start: 0, end: 99 }], ['bytes=10-19', 100, { start: 10, end: 19 }],
  ['bytes=90-500', 100, { start: 90, end: 99 }], ['bytes=100-', 100, 'invalid'], ['bytes=5-2', 100, 'invalid'],
  ['bytes=0-1,5-6', 100, 'invalid'], ['items=0-1', 100, 'invalid'],
])('parseRange(%s, %i)', (h, size, exp) => expect(parseRange(h, size)).toEqual(exp));

// device.test.ts
it('desde la red: catálogo requiere token y admin está prohibido', async () => {
  expect((await app.inject({ url: '/api/catalog', remoteAddress: REMOTE })).statusCode).toBe(401);
  expect((await app.inject({ url: '/api/admin/devices', remoteAddress: REMOTE })).statusCode).toBe(403);
});
it('vinculación completa y catálogo con ETag', async () => {
  const { code } = deps.pairing.createCode();
  const pair = await app.inject({ method: 'POST', url: '/api/pair', remoteAddress: REMOTE, payload: { code, deviceName: 'Pixel' } });
  expect(pair.statusCode).toBe(200);
  const auth = { authorization: `Bearer ${pair.json().token}` };
  const cat = await app.inject({ url: '/api/catalog', remoteAddress: REMOTE, headers: auth });
  expect(cat.statusCode).toBe(200); expect(cat.json().serverId).toBe(deps.serverId);
  const again = await app.inject({ url: '/api/catalog', remoteAddress: REMOTE, headers: { ...auth, 'if-none-match': cat.headers.etag as string } });
  expect(again.statusCode).toBe(304);
});
it('código inválido → 401 con formato de error', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/pair', remoteAddress: REMOTE, payload: { code: 'NOPE', deviceName: 'x' } });
  expect(r.statusCode).toBe(401); expect(r.json()).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
});
it('sirve el archivo completo y por rangos', async () => {
  /* track de la biblioteca de prueba: 200 con content-length = size y content-type audio/mpeg;
     Range bytes=10-19 → 206, body 10 bytes, content-range 'bytes 10-19/<size>' */
});
it('retomar una descarga completa → 416', async () => {
  const r = await app.inject({ url: `/api/tracks/${id}/file`, headers: { range: `bytes=${size}-` } });
  expect(r.statusCode).toBe(416); expect(r.headers['content-range']).toBe(`bytes */${size}`);
});
it('archivo de raíz offline → 409', async () => { /* */ });
it('sirve archivos con nombres Unicode', async () => { /* 'Canción ñandú.mp3' → 200 */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** (`npm i -w @dsmn/server fastify`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): app HTTP, autenticación y rutas de dispositivo`

---

### Task 12: Rutas de gestión y eventos en vivo

**Files:**
- Create: `src/http/adminRoutes.ts`
- Modify: `src/http/app.ts` (registrar rutas)
- Test: `test/http/admin.test.ts`

**Interfaces:**
- Consumes: Tasks 9–11.
- Produces (todas `access: 'admin'`, cuerpos validados con los esquemas de Task 2):
  - `GET /api/admin/roots` → `Root[]`; `POST` → `201 Root` y dispara `scanner.scanScopes([{ rootId, relDir: '' }])` sin esperar; `DELETE /api/admin/roots/:id` → `204`. Tras agregar o quitar una raíz se llama `deps.onRootsChanged?.()`.
  - `GET /api/admin/browse?rootId=&path=` → `BrowseResponse` (`path` por defecto `''`).
  - `POST /api/admin/scan` → `202 { started: true }` (lanza `scanAll()` sin esperar).
  - `GET /api/admin/issues` → `ScanIssue[]` ordenados por `path`.
  - `POST /api/admin/playlists` → `201 Playlist`; `PATCH /api/admin/playlists/:id` → `200 Playlist`; `DELETE` → `204`.
  - `POST /api/admin/pairing-code` → `PairingCodeResponse` con `qrPayload = JSON.stringify({ v: 1, serverId, urls: lanUrls(), code })`.
  - `GET /api/admin/devices` → `Device[]`; `DELETE /api/admin/devices/:id` → `204` o `404`.
  - `GET /api/admin/events` → `text/event-stream`; al conectar envía `event: scan` con `scanner.status()` y `event: revision` con la revisión actual; luego reenvía los eventos del `bus`; comentario `: ping` cada 25 s; al cerrarse la conexión se quitan los listeners.

- [ ] **Step 1: Write the failing tests**

```ts
it('flujo de raíz: agregar escanea y aparece en el catálogo', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/admin/roots', payload: { path: libDir } });
  expect(r.statusCode).toBe(201);
  await vi.waitFor(async () => expect((await app.inject({ url: '/api/catalog' })).json().tracks).toHaveLength(2));
});
it('cuerpo inválido → 400', async () => {
  expect((await app.inject({ method: 'POST', url: '/api/admin/playlists', payload: { type: 'manual' } })).statusCode).toBe(400);
});
it('CRUD de listas', async () => { /* 201 → PATCH reordena → DELETE 204 → PATCH 404 */ });
it('pairing-code devuelve un QR válido', async () => {
  const r = (await app.inject({ method: 'POST', url: '/api/admin/pairing-code' })).json();
  expect(QrPayloadSchema.parse(JSON.parse(r.qrPayload))).toMatchObject({ v: 1, serverId: deps.serverId, code: r.code });
});
it('revocar dispositivo', async () => { /* redeem, DELETE 204, GET devices vacío, DELETE de nuevo 404 */ });
it('SSE envía estado inicial y cambios de revisión', async () => {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const res = await fetch(`http://127.0.0.1:${port}/api/admin/events`);
  const reader = res.body!.getReader();
  const first = await readUntil(reader, 'event: revision');
  expect(first).toContain('event: scan');
  bumpRevision(deps.db, deps.bus);
  expect(await readUntil(reader, 'event: revision')).toMatch(/"revision":1/);
  await reader.cancel();
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(server): rutas de gestión y eventos SSE`

---

### Task 13: Vigilante, mDNS, arranque y README

**Files:**
- Create: `src/scan/watcher.ts`, `src/net/discovery.ts`, `src/main.ts`, `apps/server/README.md`
- Modify: `apps/server/package.json` (scripts `start`, `dev`: `tsx watch src/main.ts`)
- Test: `test/scan/watcher.test.ts`, `test/net/discovery.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `createWatcher(deps: { db; scanner: Scanner; debounceMs?: number /* 2000 */; offlinePollMs?: number /* 60_000 */ }): { sync(): Promise<void>; close(): Promise<void> }` — `sync()` (re)crea un watcher de chokidar (`ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: 2000 }`) por cada raíz online. Cada evento `add | change | unlink` aporta el directorio del archivo; `addDir | unlinkDir` aporta el propio directorio; se convierten a `Scope` con `toRelPath`. Tras `debounceMs` sin eventos se llama `scanner.scanScopes` con los scopes deduplicados (si un scope está dentro de otro, queda el de arriba). Cada `offlinePollMs` revisa raíces offline cuya ruta volvió a existir: llama `scanScopes([{ rootId, relDir: '' }])` y luego `sync()`.
  - `publishService(opts: { bonjour: { publish(o: object): { stop?(cb?: () => void): void } }; serverId: string; serverName: string; port: number }): { stop(): void }` — publica `{ name: 'DontStopMeNow (' + serverName + ')', type: MDNS_SERVICE_TYPE, port, txt: { id: serverId, v: '1' } }`.
  - `main.ts`: `loadConfig(process.env, process.platform, os.homedir())` → `mkdir` de `dataDir` y `coversDir` → `openDatabase` → `ensureServerId` → `createScanner` → `createPairing` → `buildApp` → `listen({ host: '0.0.0.0', port })` → `scanAll()` en segundo plano → `createWatcher().sync()` (y `onRootsChanged: () => void watcher.sync()` en `AppDeps`) → `publishService` con `new Bonjour()`. Imprime las URLs de `getLanUrls`. En `SIGINT`/`SIGTERM`: cerrar watcher, `stop()` de mDNS, `app.close()`, `db.close()`.
  - README: requisitos (Node ≥ 22.22), `npm install`, `npm start -w @dsmn/server`, variables `DSMN_PORT`/`DSMN_DATA_DIR`, cómo agregar una carpeta (`curl -X POST localhost:4747/api/admin/roots -H 'content-type: application/json' -d '{"path":"D:\\\\Música"}'`; la web llega en la etapa 2), y la nota del firewall de Windows (permitir en redes privadas).

- [ ] **Step 1: Write the failing tests**

```ts
it('agrupa eventos y escanea el directorio afectado', async () => {
  const scanned: Scope[][] = [];
  const fakeScanner = { scanScopes: async (s: Scope[]) => { scanned.push(s); return EMPTY; }, scanAll: async () => EMPTY, status: () => IDLE };
  const w = createWatcher({ db, scanner: fakeScanner, debounceMs: 100 });
  await w.sync();
  await mkdir(join(libDir, 'Nuevo'));
  await writeFile(join(libDir, 'Nuevo', 'a.mp3'), makeMp3({}));
  await writeFile(join(libDir, 'Nuevo', 'b.mp3'), makeMp3({}));
  await vi.waitFor(() => expect(scanned).toHaveLength(1), { timeout: 6000 });
  expect(scanned[0]).toEqual([{ rootId, relDir: 'Nuevo' }]);
  await w.close();
});
it('publishService anuncia tipo, puerto e id', () => {
  const calls: object[] = [];
  publishService({ bonjour: { publish: (o) => (calls.push(o), {}) }, serverId: 'abc', serverName: 'PC', port: 4747 });
  expect(calls[0]).toEqual({ name: 'DontStopMeNow (PC)', type: 'dontstopmenow', port: 4747, txt: { id: 'abc', v: '1' } });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar** (`npm i -w @dsmn/server chokidar bonjour-service` y `tsx` como devDependency).
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck` → PASS.
- [ ] **Step 5: Prueba de humo manual**

```bash
DSMN_DATA_DIR=$(mktemp -d) DSMN_PORT=4799 npm start -w @dsmn/server &
# crear una carpeta con un mp3 de prueba y agregarla:
curl -s -X POST localhost:4799/api/admin/roots -H 'content-type: application/json' -d "{\"path\":\"$LIB\"}"
sleep 2; curl -s localhost:4799/api/catalog | head -c 300   # debe listar la canción
curl -s -X POST localhost:4799/api/admin/pairing-code        # debe traer code y qrPayload
kill %1
```
Expected: catálogo con la canción; código de 6 caracteres; el proceso termina limpio.

- [ ] **Step 6: Commit** — `feat(server): vigilante de archivos, anuncio mDNS y arranque`
