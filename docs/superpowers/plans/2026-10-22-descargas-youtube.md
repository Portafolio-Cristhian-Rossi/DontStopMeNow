# Descargas desde YouTube — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bajar música de YouTube desde la web de gestión con la receta de yt-dlp del usuario: previsualizar el link con
los duplicados marcados, elegir canciones, encolar, ver el progreso en vivo y "Buscar nuevas" en playlists ya bajadas.

**Architecture:** Módulo `apps/server/src/downloads/` con un adaptador que es el único que ejecuta yt-dlp (un proceso
por canción, sin shell), una cola persistida en SQLite que baja de a una canción y emite eventos por el SSE existente, y
rutas en `/api/admin`. La detección de duplicados es una función pura en `packages/shared`. La web suma la pestaña
"Descargar" y una sección en Ajustes.

**Tech Stack:** Node `node:child_process` + `node:sqlite`, Fastify 5, zod, React 19 + TanStack Query 5, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-22-descargas-youtube-design.md`

## Global Constraints

- Mismas reglas que las etapas anteriores: ESM, TypeScript `~5.9.3` estricto con `noUncheckedIndexedAccess`, Prettier,
  ESLint; `npm test && npm run lint && npm run typecheck && npm run format:check` en verde al final de cada task.
- En este clon de Windows (`core.autocrlf=true`) el worktree tiene CRLF y `npm run format:check` marca ~118 archivos
  ajenos; localmente se chequea el formato solo de lo tocado (`npx prettier --check <archivos>`). El CI (Linux) corre
  el chequeo completo.
- Textos de la interfaz, comentarios y nombres de dominio en español rioplatense, como el resto del repo.
- yt-dlp se lanza **sin shell**, con los argumentos como lista y el link después de `--`. Nunca se arma un comando como
  string.
- Una sola descarga a la vez; **5 s** de espera después de cada canción `done`.
- Receta (§3 de la spec): `-x --audio-format mp3 --add-metadata --embed-thumbnail --convert-thumbnails jpg
--sleep-requests 2 --postprocessor-args "ffmpeg:-id3v2_version 3" --no-playlist --newline --progress --no-warnings`.
- Nada de lo nuevo es accesible desde la red: todas las rutas van bajo `/api/admin`.
- La migración nueva **solo crea tablas**; no modifica las existentes.
- Tests de servidor sin red ni yt-dlp real: usan el yt-dlp falso de la Task 3.
- **Commits:** los hace Cristhian. Cada task termina proponiendo el mensaje; el implementador no ejecuta `git commit`.

## Review Focus

1. **Link con `&list=` dentro de un video** (`watch?v=X&list=Y`): yt-dlp lo trata como playlist; la previsualización
   debe mostrarla como playlist con `ytPlaylistId = Y`; test en Task 3.
2. **Título de playlist con caracteres prohibidos en Windows** (`AC/DC: Hits?`): la subcarpeta se sanea a `AC_DC_ Hits_`
   antes de crearla, en el servidor y en el valor por defecto de la web; tests en Tasks 1 y 5.
3. **Ruta de yt-dlp con espacios** (`C:\Program Files\yt-dlp\yt-dlp.exe`) y títulos con comillas o `&`: funcionan
   porque no hay shell; test en Task 3 (el yt-dlp falso vive en una carpeta con espacios y recibe un título con `"&`).
4. **Video privado o borrado dentro de la playlist** (`[Private video]`, duración `null`, canal `null`): llega como
   `unavailable`, desmarcado y sin casilla activa; nunca se encola; tests en Tasks 2 y 3.
5. **Quitar la raíz de destino con un trabajo en espera**: los trabajos y fuentes de esa raíz desaparecen en cascada y
   la cola no se rompe al buscar el siguiente; test en Task 6.

---

## Estructura de archivos

```
packages/shared/src/schemas.ts            (modificar) esquemas de yt-dlp, previsualización, trabajos, fuentes, eventos
packages/shared/src/normalize.ts          (modificar) sanitizeFolderName
packages/shared/src/dedupe.ts             (nuevo) parseSongTitle, analyzeEntries
packages/shared/src/index.ts              (modificar) export de dedupe
apps/server/src/db/schema.ts              (modificar) migración 2: yt_sources, yt_jobs, yt_items
apps/server/src/events.ts                 (modificar) evento 'download'
apps/server/src/downloads/recipe.ts       (nuevo) buildDownloadArgs, outputTemplate, PREVIEW_ARGS
apps/server/src/downloads/ytdlp.ts        (nuevo) createYtDlp: version, update, preview, downloadOne
apps/server/src/downloads/settings.ts     (nuevo) ruta en meta, detección, ffmpeg
apps/server/src/downloads/store.ts        (nuevo) acceso a yt_sources / yt_jobs / yt_items
apps/server/src/downloads/queue.ts        (nuevo) createDownloadQueue
apps/server/src/downloads/routes.ts       (nuevo) /api/admin/ytdlp*, /api/admin/downloads/*
apps/server/src/http/app.ts               (modificar) AppDeps.downloads, registra rutas
apps/server/src/http/adminRoutes.ts       (modificar) SSE emite 'download'
apps/server/src/main.ts                   (modificar) crea ytdlp/settings/cola, arranca y apaga la cola
apps/server/test/helpers/fakeYtDlp.mjs    (nuevo) yt-dlp falso
apps/server/test/helpers/app.ts           (modificar) makeApp con downloads y yt-dlp falso
apps/web/src/api/client.ts                (modificar) api.ytdlp*, api.downloads*
apps/web/src/api/queries.ts               (modificar) claves y hooks nuevos
apps/web/src/api/events.ts                (modificar) progreso de descargas
apps/web/src/components/Layout.tsx        (modificar) pestaña "Descargar"
apps/web/src/App.tsx                      (modificar) ruta /descargar
apps/web/src/pages/DownloadPage.tsx       (nuevo) link, previsualización, cola, playlists
apps/web/src/components/PreviewTable.tsx  (nuevo)
apps/web/src/components/DownloadQueue.tsx (nuevo)
apps/web/src/components/YtSources.tsx     (nuevo)
apps/web/src/components/YtDlpSettings.tsx (nuevo) sección de Ajustes
apps/web/src/pages/SettingsPage.tsx       (modificar) incluye YtDlpSettings
README.md, apps/server/README.md          (modificar)
```

---

### Task 1: Contrato compartido — esquemas y `sanitizeFolderName`

**Files:**

- Modify: `packages/shared/src/schemas.ts`, `packages/shared/src/normalize.ts`
- Test: `packages/shared/test/schemas.test.ts`, `packages/shared/test/normalize.test.ts`

**Interfaces:**

- Produces (todos exportados con su `type X = z.infer<...>`):
  - `YtDlpStatusSchema`: `{ path: string | null; version: string | null; ffmpeg: boolean; suggestedPath: string | null; error: string | null }`
  - `SetYtDlpPathRequestSchema`: `{ path: string (min 1) }`
  - `YtDlpUpdateResponseSchema`: `{ version: string; output: string }`
  - `PreviewRequestSchema`: `{ url: string }` — `refine` a `http:`/`https:` con mensaje `"El link tiene que empezar con http:// o https://"`
  - `PreviewEntrySchema`: `{ videoId; url; title; channel: string | null; durationSec: number | null; position: number | null; unavailable: boolean }`
  - `AnalyzedEntrySchema`: `PreviewEntry` + `{ duplicateOf: string | null; inLibrary: string | null; versionGroup: string | null; versionTags: string[]; alreadyDownloaded: boolean; selected: boolean }`
  - `PreviewSchema`: `{ kind: 'playlist' | 'video'; ytPlaylistId: string | null; title; url; playlistSize: number; sourceId: number | null; destination: { rootId: number; folder: string } | null; entries: AnalyzedEntry[] }`
  - `EnqueueRequestSchema`: `{ url; title; kind: 'playlist' | 'video'; ytPlaylistId: string | null; playlistSize: number (int ≥ 1); rootId: number; folder: string; items: { videoId; position: number | null; title }[] (min 1) }`
  - `DownloadJobStatusSchema`: `'pending' | 'running' | 'paused' | 'done' | 'cancelled'`
  - `DownloadItemStatusSchema`: `'pending' | 'downloading' | 'done' | 'failed' | 'cancelled'`
  - `DownloadItemSchema`: `{ videoId; position: number | null; title; status; error: string | null; filePath: string | null }`
  - `DownloadJobSchema`: `{ id: number; sourceId: number | null; url; title; rootId; folder; status; pauseReason: string | null; createdAt; finishedAt: number | null; items: DownloadItem[] }`
  - `YtSourceSchema`: `{ id; url; ytPlaylistId; title; rootId; folder; playlistId: string | null; downloaded: number; createdAt; lastCheckedAt: number | null }`
  - `DownloadEventSchema`: `{ jobId; status: DownloadJobStatus; done; failed; total; current: { videoId; title; stage: 'download' | 'convert'; percent: number | null } | null }`
  - `sanitizeFolderName(name: string): string` en `normalize.ts`: reemplaza `< > : " / \ | ? *` y caracteres de control por `_`, quita puntos y espacios del final, colapsa espacios; si queda vacío o es `.`/`..` devuelve `'Descargas'`.

- [ ] **Step 1: Write the failing tests**

```ts
// normalize.test.ts
it('sanitizeFolderName deja nombres válidos en Windows', () => {
  expect(sanitizeFolderName('AC/DC: Hits?')).toBe('AC_DC_ Hits_');
  expect(sanitizeFolderName('  Mix  de   verano. ')).toBe('Mix de verano');
  expect(sanitizeFolderName('..')).toBe('Descargas');
  expect(sanitizeFolderName('Persona 3-4-5 Best Tracks')).toBe('Persona 3-4-5 Best Tracks');
});
// schemas.test.ts
it('PreviewRequest solo acepta http(s)', () => {
  expect(PreviewRequestSchema.safeParse({ url: 'https://www.youtube.com/playlist?list=PL1' }).success).toBe(
    true,
  );
  expect(PreviewRequestSchema.safeParse({ url: '--exec calc' }).success).toBe(false);
  expect(PreviewRequestSchema.safeParse({ url: 'file:///C:/x' }).success).toBe(false);
});
it('EnqueueRequest exige al menos una canción', () => {
  const base = {
    url: 'https://y/p',
    title: 'P',
    kind: 'playlist',
    ytPlaylistId: 'PL1',
    playlistSize: 3,
    rootId: 1,
    folder: 'P',
  };
  expect(EnqueueRequestSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  expect(
    EnqueueRequestSchema.safeParse({ ...base, items: [{ videoId: 'a', position: 1, title: 'A' }] }).success,
  ).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run packages/shared` → los nuevos FAIL.
- [ ] **Step 3: Implementar** los esquemas al final de `schemas.ts` y `sanitizeFolderName` en `normalize.ts`.
- [ ] **Step 4: Run** `npx vitest run packages/shared && npm run typecheck` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat: contrato compartido de las descargas desde youtube`

---

### Task 2: Duplicados — `dedupe.ts`

**Files:**

- Create: `packages/shared/src/dedupe.ts`; Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/dedupe.test.ts`

**Interfaces:**

- Consumes: `PreviewEntry`, `AnalyzedEntry` (Task 1), `normalizeKey` (existente).
- Produces:
  - `parseSongTitle(title: string, channel: string | null): { artist: string | null; artistFromTitle: boolean; base: string; tags: string[] }` —
    `base` y `artist` ya normalizados (sin tildes, minúsculas, sin signos, espacios colapsados); `tags` en forma
    canónica y ordenadas alfabéticamente.
  - `analyzeEntries(entries: PreviewEntry[], library: { id: string; title: string; artist: string }[], downloaded?: ReadonlySet<string>): AnalyzedEntry[]` — mismo orden que `entries`.

Reglas (spec §6):

- Artista/título: separadores `-`, `–`, `—` con espacios alrededor (`"A - B"`); si no hay, artista = canal sin
  ` - Topic`, `VEVO`, `Official` (y `null` si no hay canal).
- Ruido entre `()` o `[]`: `official video`, `official audio`, `official music video`, `music video`, `lyrics`,
  `lyric video`, `letra`, `video oficial`, `audio`, `visualizer`, `hd`, `4k`, `remaster`, `remastered`; además
  `ft.`/`feat.`/`featuring` y lo que sigue hasta el cierre o el final.
- Etiquetas canónicas: `live` (en vivo, live), `remix`, `acoustic` (acústico, acustico, acoustic), `extended`,
  `sped up`, `slowed`, `nightcore`, `instrumental`, `cover`, `karaoke`, `demo`, `radio edit`, `unplugged`. Se detectan
  en cualquier parte del título y se quitan de `base`.
- Clave = `base` + `tags.join('|')`. `duplicateOf` = `videoId` de la primera entrada anterior con la misma clave cuyos
  artistas no se contradigan. Contradicen solo si **los dos** salen del título (`artistFromTitle`) y difieren: el
  artista sacado del canal no alcanza para contradecir, porque las subidas de fans tienen el nombre del fan. `inLibrary` = `id` de una canción de la
  biblioteca con la misma clave (aplicando `parseSongTitle(track.title, null)`) y `normalize(track.artist)` igual al
  artista de la entrada; si la entrada no tiene artista, `null`. `versionGroup` = `base` cuando hay al menos otra
  entrada con el mismo `base` y distinto conjunto de etiquetas.
- `selected` = `!unavailable && !duplicateOf && !inLibrary && !alreadyDownloaded`.

- [ ] **Step 1: Write the failing tests**

```ts
const e = (videoId: string, title: string, channel: string | null = 'Canal', extra = {}) => ({
  videoId,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  title,
  channel,
  durationSec: 200,
  position: null,
  unavailable: false,
  ...extra,
});

it('parseSongTitle separa artista, limpia ruido y detecta versiones', () => {
  expect(parseSongTitle('Atlus - Mass Destruction (Official Video)', 'X')).toEqual({
    artist: 'atlus',
    artistFromTitle: true,
    base: 'mass destruction',
    tags: [],
  });
  expect(parseSongTitle('Burn My Dread [Lyrics]', 'Atlus - Topic')).toEqual({
    artist: 'atlus',
    artistFromTitle: false,
    base: 'burn my dread',
    tags: [],
  });
  expect(parseSongTitle('Canción feat. Otro (En Vivo)', 'ArtistaVEVO')).toEqual({
    artist: 'artista',
    artistFromTitle: false,
    base: 'cancion',
    tags: ['live'],
  });
  expect(parseSongTitle('Song (Sped Up) [Remix]', null).tags).toEqual(['remix', 'sped up']);
});

it('marca repetidas dentro del link (aunque las suba un fan) y deja la primera', () => {
  const r = analyzeEntries(
    [
      e('a', 'Atlus - Mass Destruction'),
      e('b', 'Mass Destruction (Lyrics)', 'Fan123'),
      e('c', 'Atlus - Mass Destruction [Audio]'),
    ],
    [],
  );
  expect(r.map((x) => [x.duplicateOf, x.selected])).toEqual([
    [null, true],
    ['a', false],
    ['a', false],
  ]);
});
it('sin artista no contradice', () => {
  const r = analyzeEntries(
    [e('a', 'Atlus - Mass Destruction'), e('b', 'Mass Destruction (Lyrics)', null)],
    [],
  );
  expect(r[1]!.duplicateOf).toBe('a');
});
it('mismo título y distinto artista no son repetidas', () => {
  const r = analyzeEntries([e('a', 'Queen - Home'), e('b', 'Ed Sheeran - Home')], []);
  expect(r[1]!.duplicateOf).toBeNull();
});
it('agrupa versiones sin desmarcarlas', () => {
  const r = analyzeEntries([e('a', 'Atlus - Wake Up'), e('b', 'Atlus - Wake Up (Live)')], []);
  expect(r.map((x) => [x.versionGroup, x.selected])).toEqual([
    ['wake up', true],
    ['wake up', true],
  ]);
  expect(r[1]!.versionTags).toEqual(['live']);
});
it('detecta lo que ya está en la biblioteca solo con artista', () => {
  const lib = [
    { id: 't1', title: 'Life Will Change', artist: 'Atlus' },
    { id: 't2', title: 'Home', artist: 'Queen' },
  ];
  const r = analyzeEntries([e('a', 'Atlus - Life Will Change (Official Audio)'), e('b', 'Home', null)], lib);
  expect(r.map((x) => [x.inLibrary, x.selected])).toEqual([
    ['t1', false],
    [null, true],
  ]);
});
it('no disponibles y ya bajados vienen desmarcados', () => {
  const r = analyzeEntries(
    [e('a', '[Private video]', null, { unavailable: true }), e('b', 'X - Y')],
    [],
    new Set(['b']),
  );
  expect(r.map((x) => [x.alreadyDownloaded, x.selected])).toEqual([
    [false, false],
    [true, false],
  ]);
});
```

- [ ] **Step 2: Run** `npx vitest run packages/shared/test/dedupe.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `parseSongTitle` y `analyzeEntries`; exportar desde `index.ts`.
- [ ] **Step 4: Run** `npx vitest run packages/shared && npm run typecheck` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat: detección de duplicados en las descargas`

---

### Task 3: Servidor — receta y adaptador de yt-dlp (con yt-dlp falso)

**Files:**

- Create: `apps/server/src/downloads/recipe.ts`, `apps/server/src/downloads/ytdlp.ts`,
  `apps/server/test/helpers/fakeYtDlp.mjs`
- Test: `apps/server/test/downloads/recipe.test.ts`, `apps/server/test/downloads/ytdlp.test.ts`

**Interfaces:**

- Consumes: `PreviewEntry` (Task 1).
- Produces:
  - `recipe.ts`:
    - `PREVIEW_ARGS = ['--flat-playlist', '-J', '--no-warnings']`
    - `numberWidthFor(playlistSize: number): 2 | 3` → `3` si `playlistSize > 99`, si no `2`.
    - `outputTemplate(position: number | null, numberWidth: number): string` → `'07 - %(title)s.%(ext)s'` con ancho 2,
      `'007 - …'` con ancho 3, `'%(title)s.%(ext)s'` si `position` es `null`.
    - `buildDownloadArgs(o: { videoUrl: string; destDir: string; tempDir: string; position: number | null; numberWidth: number }): string[]`
      — la receta de Global Constraints + `-P home:<destDir>`, `-P temp:<tempDir>`, `-o <outputTemplate>`,
      `--progress-template 'download:dsmn-progress %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s'`,
      `--print 'after_move:dsmn-file %(filepath)s'`, y al final `'--', videoUrl`.
  - `ytdlp.ts`:
    - `interface YtDlp { version(): Promise<string>; update(): Promise<{ version: string; output: string }>; preview(url: string): Promise<{ kind: 'playlist' | 'video'; ytPlaylistId: string | null; title: string; url: string; entries: PreviewEntry[] }>; downloadOne(args: string[], onProgress: (p: { stage: 'download' | 'convert'; percent: number | null }) => void, signal: AbortSignal): Promise<{ filePath: string | null }> }`
      — `filePath` es `null` si yt-dlp terminó bien sin imprimir `dsmn-file` (el archivo ya existía); cuenta como `done`.
    - `class YtDlpError extends Error` (mensaje = última línea `ERROR:` sin el prefijo, o `"yt-dlp terminó con código N"`).
    - `createYtDlp(o: { command: string; prefixArgs?: string[]; stallMs?: number }): YtDlp` — `spawn(command, [...prefixArgs, ...args], { shell: false, windowsHide: true })`.
    - Progreso: líneas `dsmn-progress d t e` → `stage 'download'`, `percent = d / (t ?? e) * 100` (null si ambos son `NA`);
      cualquier línea `[ExtractAudio]`, `[EmbedThumbnail]`, `[Metadata]` → `stage 'convert', percent: null`; `dsmn-file <ruta>` → archivo final.
    - `preview`: `JSON.parse` de stdout. `_type === 'playlist'` → `kind 'playlist'`, `ytPlaylistId = id`, entradas con
      `position = i + 1`, `url = entry.url` si empieza con `http`, si no `https://www.youtube.com/watch?v=<id>`,
      `unavailable = duration == null && /^\[(private|deleted)/i.test(title)`. Si no, `kind 'video'`, una entrada con
      `position: null`.
    - Abort o `stallMs` (default `300_000`) sin salida: mata el proceso (en `win32` con
      `execFile('taskkill', ['/pid', String(pid), '/T', '/F'])`, si no `child.kill()`) y rechaza con `YtDlpError`
      (`"Cancelada"` o `"No respondió"`).
- `fakeYtDlp.mjs`: script de Node que imita yt-dlp según los argumentos:
  - `--version` → `2026.03.17`; `-U` → `Updated yt-dlp to 2026.09.01` y deja `--version` respondiendo eso (estado en un
    archivo junto al script).
  - Con `--flat-playlist -J <url>`: si la url contiene `list=` responde la playlist de `FAKE_PLAYLIST` (3 entradas, la
    segunda `[Private video]` con `duration: null`), si contiene `bad` escribe `ERROR: [youtube] bad: Video unavailable`
    en stderr y sale con 1, si no responde un video.
  - Descarga: el id del video (último argumento, `v=<id>`) decide: `ok*` imprime progreso 0/50/100, `[ExtractAudio]`,
    escribe `<home>/<plantilla>` con `%(title)s` = `Canción <id>` y `%(ext)s` = `mp3`, e imprime `dsmn-file <ruta>`; `fail*` → `ERROR: [youtube] fail: Video
unavailable`; `limit*` → `ERROR: unable to download video data: HTTP Error 429: Too Many Requests`; `hang*` no
    imprime nada y espera; `exists*` imprime `[download] … has already been downloaded` y sale con 0 sin `dsmn-file`.
  - `preview` también pasa el link después de `--` (como `downloadOne`).
  - Guarda los argumentos recibidos de cada llamada en `<dir del script>/calls.jsonl` para que los tests los lean.

- [ ] **Step 1: Write the failing tests**

```ts
// recipe.test.ts
it('arma la receta para una canción de playlist', () => {
  const args = buildDownloadArgs({
    videoUrl: 'https://www.youtube.com/watch?v=abc',
    destDir: 'D:\\Music\\P',
    tempDir: 'T',
    position: 7,
    numberWidth: 2,
  });
  expect(args.slice(0, 11)).toEqual([
    '-x',
    '--audio-format',
    'mp3',
    '--add-metadata',
    '--embed-thumbnail',
    '--convert-thumbnails',
    'jpg',
    '--sleep-requests',
    '2',
    '--postprocessor-args',
    'ffmpeg:-id3v2_version 3',
  ]);
  expect(args).toContain('--no-playlist');
  expect(args).toContain('--progress');
  expect(args.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=abc']);
  expect(args[args.indexOf('-o') + 1]).toBe('07 - %(title)s.%(ext)s');
  expect(args).not.toContain('--embed-subs');
});
it('numeración de 3 dígitos y video suelto', () => {
  expect([numberWidthFor(99), numberWidthFor(120)]).toEqual([2, 3]);
  expect(outputTemplate(7, 3)).toBe('007 - %(title)s.%(ext)s');
  expect(outputTemplate(null, 2)).toBe('%(title)s.%(ext)s');
});
// ytdlp.test.ts — el yt-dlp falso se copia a una carpeta temporal **con espacios** ("yt dlp test")
it('preview de playlist con un video privado', async () => {
  const p = await yt.preview('https://www.youtube.com/watch?v=x&list=PL1');
  expect(p).toMatchObject({ kind: 'playlist', ytPlaylistId: 'PL1', title: 'Fake Playlist' });
  expect(p.entries[1]).toMatchObject({ position: 2, unavailable: true, channel: null });
});
it('preview con link inválido rechaza con el ERROR de yt-dlp', async () => {
  await expect(yt.preview('https://www.youtube.com/watch?v=bad')).rejects.toThrow(
    '[youtube] bad: Video unavailable',
  );
});
it('downloadOne informa progreso y devuelve el archivo', async () => {
  const stages: string[] = [];
  const r = await yt.downloadOne(
    buildDownloadArgs({
      videoUrl: 'https://www.youtube.com/watch?v=ok1',
      destDir: dest,
      tempDir: tmp,
      position: 1,
      numberWidth: 2,
    }),
    (p) => stages.push(`${p.stage}:${p.percent}`),
    new AbortController().signal,
  );
  expect(stages).toEqual(['download:0', 'download:50', 'download:100', 'convert:null']);
  expect(existsSync(r.filePath!)).toBe(true);
});
it('un link con & y comillas llega intacto como un solo argumento (sin shell)', async () => {
  const url = 'https://www.youtube.com/watch?v=x&list=PL1&x="a b"';
  await yt.preview(url);
  expect(lastCall().at(-1)).toBe(url);
  expect(lastCall().at(-2)).toBe('--');
});
it('archivo que ya existía: termina bien sin dsmn-file → filePath null', async () => {
  expect(await yt.downloadOne(argsFor('exists1'), () => {}, new AbortController().signal)).toEqual({
    filePath: null,
  });
});
it('cancelar y colgarse matan el proceso', async () => {
  const ac = new AbortController();
  const p = yt.downloadOne(argsFor('hang1'), () => {}, ac.signal);
  ac.abort();
  await expect(p).rejects.toThrow('Cancelada');
  const slow = createYtDlp({ command: process.execPath, prefixArgs: [fake], stallMs: 200 });
  await expect(slow.downloadOne(argsFor('hang2'), () => {}, new AbortController().signal)).rejects.toThrow(
    'No respondió',
  );
});
it('version y update', async () => {
  expect(await yt.version()).toBe('2026.03.17');
  expect((await yt.update()).version).toBe('2026.09.01');
});
```

- [ ] **Step 2: Run** `npx vitest run apps/server/test/downloads` → FAIL.
- [ ] **Step 3: Implementar** `recipe.ts`, `ytdlp.ts` y `fakeYtDlp.mjs`.
- [ ] **Step 4: Run** `npx vitest run apps/server/test/downloads && npm run lint && npm run typecheck` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat(server): receta y adaptador de yt-dlp`

---

### Task 4: Servidor — migración, almacenamiento y ajustes de yt-dlp

**Files:**

- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/events.ts`
- Create: `apps/server/src/downloads/store.ts`, `apps/server/src/downloads/settings.ts`
- Test: `apps/server/test/db.test.ts`, `apps/server/test/downloads/store.test.ts`, `apps/server/test/downloads/settings.test.ts`

**Interfaces:**

- Consumes: tipos de Task 1, `YtDlp` (Task 3), `getMeta`/`setMeta`, `listRoots`.
- Produces:
  - Migración 2 en `MIGRATIONS` con las tablas de la spec §5, más `number_width INTEGER NOT NULL DEFAULT 2` en
    `yt_jobs` (ancho de numeración elegido al encolar). Índices: `yt_items(job_id)`, `yt_jobs(status)`.
  - `BusEvents.download: DownloadEvent`.
  - `store.ts` (funciones sobre `DatabaseSync`):
    - `findSourceByPlaylistId(db, ytPlaylistId): YtSource | undefined`, `getSource(db, id)`, `listSources(db): YtSource[]`
      (con `downloaded` = canciones `done` de sus trabajos), `createSource(db, s): YtSource`,
      `setSourcePlaylist(db, sourceId, playlistId)`, `touchSourceChecked(db, sourceId, now)`, `deleteSource(db, id)`.
    - `downloadedVideoIds(db, sourceId): Set<string>`.
    - `insertJob(db, j: { sourceId; url; title; rootId; folder; numberWidth; items }): DownloadJob` (estado `pending`,
      canciones `pending`), `getJob(db, id)`, `listJobs(db): DownloadJob[]` (activos + últimos 20 terminados, por
      `id`), `nextRunnableJob(db): DownloadJob | undefined` (primer `pending` por `id`), `setJobStatus(db, id, status,
pauseReason?: string | null)`, `setItem(db, jobId, videoId, patch: Partial<Pick<DownloadItem, 'status' | 'error' | 'filePath'>>)`,
      `deleteJob(db, id)`, `resetInterrupted(db)` (`running`→`pending`, `downloading`→`pending`).
  - `settings.ts`:
    - `createYtDlpSettings(o: { db; roots: () => Root[]; findOnPath: (name: string) => string | null; exists: (p: string) => boolean; makeYtDlp: (command: string) => YtDlp })`
      con `status(): Promise<YtDlpStatus>`, `setPath(path: string): Promise<YtDlpStatus>` (valida con `version()`; si
      falla lanza `HttpError(400, 'bad_request', 'No se pudo ejecutar yt-dlp: <motivo>')` y no guarda),
      `current(): YtDlp | null` (según la ruta guardada en `meta.ytdlp_path`).
    - `suggestedPath`: `findOnPath('yt-dlp')`, si no la primera raíz con `yt-dlp.exe` (`win32`) o `yt-dlp` que exista.
    - `ffmpeg = findOnPath('ffmpeg') !== null`.
    - `findOnPath` real (en `main.ts`): recorre `PATH` (y `PATHEXT` en Windows) con `existsSync`; se exporta como
      `findOnPath(name, env = process.env, platform = process.platform)` desde `settings.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// db.test.ts
it('la migración 2 crea las tablas de descargas sin tocar las existentes', () => {
  const db = makeDb();
  expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(2);
  for (const t of ['yt_sources', 'yt_jobs', 'yt_items'])
    expect(db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(t)).toBeTruthy();
});
// store.test.ts
it('insertJob, nextRunnableJob y resetInterrupted', () => {
  /* inserta 2 trabajos; next = el primero; lo marca running con un item downloading; resetInterrupted → ambos vuelven a pending */
});
it('downloadedVideoIds y listSources cuentan solo canciones done de esa fuente', () => {
  /* */
});
it('quitar la raíz borra fuentes y trabajos en cascada', () => {
  /* addRootRow; createSource + insertJob; DELETE FROM roots; listJobs() y listSources() vacíos */
});
// settings.test.ts
it('sugiere el yt-dlp de una carpeta de música y detecta ffmpeg', async () => {
  const s = createYtDlpSettings({
    db,
    roots: () => [{ id: 1, path: 'D:\\Music', status: 'online' }],
    findOnPath: (n) => (n === 'ffmpeg' ? 'C:\\ff\\ffmpeg.exe' : null),
    exists: (p) => p === path.join('D:\\Music', exeName),
    makeYtDlp: fakeFactory,
  });
  expect(await s.status()).toMatchObject({
    path: null,
    suggestedPath: path.join('D:\\Music', exeName),
    ffmpeg: true,
  });
});
it('setPath valida con --version y no guarda si falla', async () => {
  /* makeYtDlp que rechaza → 400 y status().path sigue null; con uno que responde → path y version guardados */
});
it('findOnPath respeta PATHEXT en Windows', () => {
  /* carpeta temporal con yt-dlp.exe; findOnPath('yt-dlp', { PATH: dir, PATHEXT: '.EXE' }, 'win32') */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/server` → los nuevos FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck` → PASS (los tests existentes de `db.test.ts` que
      esperen `user_version = 1` se actualizan a 2).
- [ ] **Step 5: Commit (Cristhian)** — `feat(server): tablas de descargas y ajustes de yt-dlp`

---

### Task 5: Servidor — cola: encolar, bajar y terminar

**Files:**

- Create: `apps/server/src/downloads/queue.ts`
- Test: `apps/server/test/downloads/queue.test.ts`

**Interfaces:**

- Consumes: `store.ts`, `buildDownloadArgs` (Task 3/4), `YtDlp`, `resolveRelDir`, `sanitizeFolderName`,
  `createPlaylist`, `Scanner.scanScopes`, `EventBus`.
- Produces:
  - `createDownloadQueue(o: { db; bus; scanner: Pick<Scanner, 'scanScopes'>; ytdlp: () => YtDlp | null; ffmpeg: () => boolean; tempRoot: string; wait?: (ms: number) => Promise<void>; log?: (err: unknown, msg: string) => void }): DownloadQueue`
  - `interface DownloadQueue { enqueue(req: EnqueueRequest): DownloadJob; start(): void; stop(): Promise<void>; cancel(jobId: number): void; resume(jobId: number): void; retry(jobId: number): void; remove(jobId: number): void; busy(): boolean; idle(): Promise<void> }`
    (`idle()` resuelve cuando no queda trabajo ejecutable; lo usan los tests).
  - `enqueue`:
    - `409 conflict` si `ytdlp()` es `null` (`"Configurá yt-dlp en Ajustes"`) o `!ffmpeg()` (`"No se encontró ffmpeg"`).
    - Raíz inexistente → `404`; `folder` se sanea con `sanitizeFolderName` por segmento y se valida con `resolveRelDir`
      (`400` si queda fuera).
    - `kind 'playlist'`: busca la fuente por `ytPlaylistId`; si existe y `rootId`/`folder` difieren → `409`
      (`"Esta playlist ya se baja en <ruta>"`); si no existe la crea.
    - `numberWidth = numberWidthFor(playlistSize)`. Despierta el bucle.
  - Bucle (uno solo, secuencial): toma `nextRunnableJob`, lo pone `running`, crea `destDir` (`mkdir -p`) y
    `<tempRoot>/<jobId>`, y por cada canción `pending` en orden de posición: `downloading` → `downloadOne` →
    `done` con `filePath` o `failed` con `error.message`; tras cada `done`, `wait(5000)`. Al final, si hubo al menos una
    `done`: `scanner.scanScopes([{ rootId, relDir: folder }])` y, si la fuente no tiene lista, `createPlaylist` tipo
    `folder` con el título de la fuente (errores → `log`, el trabajo igual termina). Estado final `done`; borra
    `<tempRoot>/<jobId>`.
  - Eventos `download` (spec §7): al cambiar de estado y en cada progreso, a lo sumo uno cada 250 ms por trabajo
    (los cambios de estado siempre se emiten).

- [ ] **Step 1: Write the failing tests** (yt-dlp falso de la Task 3, raíz en carpeta temporal, `wait` espía)

```ts
it('baja de a una, en orden, con 5 s entre canciones y crea la lista de carpeta', async () => {
  const job = q.enqueue(req({ items: [item('ok2', 2), item('ok1', 1)] }));
  await q.idle();
  expect(callsTo('download').map((c) => c.videoId)).toEqual(['ok1', 'ok2']);
  expect(wait.mock.calls).toEqual([[5000], [5000]]);
  expect(getJob(db, job.id)).toMatchObject({
    status: 'done',
    items: [{ status: 'done' }, { status: 'done' }],
  });
  expect(readdirSync(join(root, 'Fake Playlist'))).toEqual(['01 - Canción ok1.mp3', '02 - Canción ok2.mp3']);
  const source = listSources(db)[0]!;
  expect(source.playlistId).not.toBeNull();
  expect(scanScopes).toHaveBeenCalledWith([{ rootId, relDir: 'Fake Playlist' }]);
});
it('una canción que falla no frena las demás', async () => {
  /* items fail1, ok1 → fail1 failed con 'Video unavailable', ok1 done, job done */
});
it('sanea la subcarpeta', async () => {
  /* folder 'AC/DC: Hits?' → existe join(root, 'AC_DC_ Hits_') */
});
it('sin yt-dlp o sin ffmpeg no encola', () => {
  /* ytdlp: () => null → toThrow(status 409) */
});
it('la misma playlist en otro destino → 409', () => {
  /* enqueue dos veces con folder distinto */
});
it('emite eventos download con el avance', async () => {
  /* bus.on('download') junta eventos; el último tiene status 'done', done 2, total 2 */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/server/test/downloads/queue.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `queue.ts` (esta task: enqueue + bucle + final; `cancel/resume/retry/remove` y la
      recuperación quedan para la Task 6, se pueden dejar como `throw new Error('pendiente')` mientras tanto).
- [ ] **Step 4: Run** `npx vitest run apps/server && npm run lint && npm run typecheck` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat(server): cola de descargas`

---

### Task 6: Servidor — cola: cancelar, pausas, reintentar y recuperación

**Files:**

- Modify: `apps/server/src/downloads/queue.ts`
- Test: `apps/server/test/downloads/queue.test.ts`

**Interfaces:**

- Produces (completa `DownloadQueue` de la Task 5):
  - `cancel(jobId)`: si está bajando, aborta el `AbortController` de la canción en curso; las canciones `pending` y la
    `downloading` pasan a `cancelled`; trabajo `cancelled` con `finishedAt`; borra `<tempRoot>/<jobId>`. En un trabajo
    `pending`/`paused` hace lo mismo sin proceso. `404` si no existe.
  - Pausa por límite: 3 fallas **seguidas** cuyo mensaje coincide con `/HTTP Error 429|Sign in to confirm/` → la canción
    que disparó la tercera vuelve a `pending`, trabajo `paused` con `"YouTube está limitando las descargas: esperá un
rato o actualizá yt-dlp"`, y el bucle pasa al siguiente trabajo.
  - Raíz offline: antes de cada canción, si la raíz está `offline` → `paused` con `"La carpeta de destino no está
conectada"`.
  - `resume(jobId)`: `paused` → `pending` y despierta el bucle; `409` si no está pausado.
  - `retry(jobId)`: canciones `failed`/`cancelled` → `pending`, trabajo → `pending` (limpia `finishedAt` y
    `pauseReason`).
  - `remove(jobId)`: solo `pending`, `done` o `cancelled` (`409` si está `running`); borra la fila (no archivos).
  - `start()`: `resetInterrupted(db)`, borra `tempRoot` entero y arranca el bucle. `stop()`: aborta la canción en curso
    **sin** marcarla cancelada (queda `downloading` para que `resetInterrupted` la retome) y espera que el bucle salga.
  - `busy()`: `true` si hay una canción bajando.

- [ ] **Step 1: Write the failing tests**

```ts
it('cancelar mata la canción en curso y deja el resto cancelado', async () => {
  const job = q.enqueue(req({ items: [item('hang1', 1), item('ok1', 2)] }));
  await vi.waitFor(() => expect(getJob(db, job.id)!.items[0]!.status).toBe('downloading'));
  q.cancel(job.id);
  await q.idle();
  expect(getJob(db, job.id)).toMatchObject({
    status: 'cancelled',
    items: [{ status: 'cancelled' }, { status: 'cancelled' }],
  });
  expect(existsSync(join(tempRoot, String(job.id)))).toBe(false);
});
it('3 fallas seguidas por límite pausan el trabajo y siguen con el próximo', async () => {
  const a = q.enqueue(
    req({ items: [item('limit1', 1), item('limit2', 2), item('limit3', 3), item('ok4', 4)] }),
  );
  const b = q.enqueue(req({ kind: 'video', ytPlaylistId: null, items: [item('ok9', null)] }));
  await q.idle();
  expect(getJob(db, a.id)).toMatchObject({
    status: 'paused',
    pauseReason: expect.stringContaining('YouTube está limitando'),
  });
  expect(getJob(db, a.id)!.items.map((i) => i.status)).toEqual(['failed', 'failed', 'pending', 'pending']);
  expect(getJob(db, b.id)!.status).toBe('done');
});
it('raíz desconectada pausa y resume retoma', async () => {
  /* UPDATE roots SET status='offline'; enqueue; idle → paused; volver a online; resume; idle → done */
});
it('retry vuelve a la espera solo las fallidas', async () => {
  /* fail1 + ok1 → retry → fail1 pending y job pending; ok1 sigue done */
});
it('al arrancar retoma lo interrumpido', async () => {
  /* insertJob y marcar running + item downloading a mano; crear tempRoot/x; start(); idle → done; tempRoot/x no existe */
});
it('remove no deja quitar un trabajo en curso', async () => {
  /* hang1 → remove → 409; cancel; remove → ok */
});
it('quitar la raíz con un trabajo en espera no rompe la cola', async () => {
  /* q.stop(); enqueue en raíz A y en raíz B; DELETE FROM roots WHERE id = A; q.start(); idle → el de B termina done y listJobs() no tiene el de A */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/server/test/downloads/queue.test.ts` → los nuevos FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** `npx vitest run apps/server && npm run lint && npm run typecheck` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat(server): cancelar, pausar, reintentar y retomar descargas`

---

### Task 7: Servidor — rutas, eventos en vivo y arranque

**Files:**

- Create: `apps/server/src/downloads/routes.ts`
- Modify: `apps/server/src/http/app.ts`, `apps/server/src/http/adminRoutes.ts`, `apps/server/src/main.ts`,
  `apps/server/test/helpers/app.ts`
- Test: `apps/server/test/http/downloads.test.ts`

**Interfaces:**

- Consumes: `DownloadQueue`, `createYtDlpSettings`, `store.ts`, `analyzeEntries`, catálogo (`tracks` con `title` y
  `artist`).
- Produces:
  - `AppDeps.downloads?: { settings: YtDlpSettings; queue: DownloadQueue }` (opcional para no tocar los tests que no lo
    usan); `buildApp` registra `downloadRoutes(app, deps)` si está.
  - Rutas exactamente como la tabla de la spec §7. Detalles:
    - `GET /api/admin/ytdlp` → `settings.status()`; `PUT` → `settings.setPath`; `POST /update` → `409` si
      `queue.busy()` (`"Hay una descarga en curso"`), `409` si no hay yt-dlp configurado.
    - `POST /downloads/preview` → valida con `PreviewRequestSchema`; `409` sin yt-dlp; `ytdlp.preview(url)`; errores
      `YtDlpError` → `400` con su mensaje. Si `ytPlaylistId` corresponde a una fuente: `sourceId`, `destination` y
      `downloaded = downloadedVideoIds`. `entries = analyzeEntries(entries, tracks, downloaded)`.
      `playlistSize = entries.length`.
    - `POST /downloads/sources/:id/check` → igual que preview sobre `source.url` + `touchSourceChecked`.
    - `POST /downloads/jobs` → `201` con el trabajo.
    - `cancel`/`resume`/`retry` → `200` con el trabajo actualizado; `DELETE` → `204`.
  - SSE: `/api/admin/events` también reenvía `bus` `'download'` como `event: download`.
  - `main.ts`: `tempRoot = path.join(config.dataDir, 'yt-tmp')`; `makeYtDlp = (command) => createYtDlp({ command })`;
    `queue.start()` después de `app.listen`; `await queue.stop()` en `shutdown` antes de `app.close()`.
  - `makeApp({ downloads: true })` arma `downloads` con el yt-dlp falso ya configurado en `meta` (y `ffmpeg: () => true`).

- [ ] **Step 1: Write the failing tests**

```ts
it('preview marca duplicados contra la biblioteca y ya bajados', async () => {
  const { app } = await makeApp({ downloads: true });
  const r = await app.inject({
    method: 'POST',
    url: '/api/admin/downloads/preview',
    payload: { url: 'https://www.youtube.com/playlist?list=PL1' },
  });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ kind: 'playlist', ytPlaylistId: 'PL1', playlistSize: 3, sourceId: null });
  expect(r.json().entries[1]).toMatchObject({ unavailable: true, selected: false });
});
it('preview: link no http → 400 sin ejecutar yt-dlp; ERROR de yt-dlp → 400 con el mensaje', async () => {
  /* */
});
it('flujo completo: encolar, eventos download por SSE, fuente guardada y buscar nuevas', async () => {
  /* POST jobs con ok1 → 201; esperar status done; GET sources → 1 con downloaded 1;
     POST sources/:id/check → entrada ok1 con alreadyDownloaded true y selected false */
});
it('update con una descarga en curso → 409', async () => {
  /* encolar hang1; POST /api/admin/ytdlp/update → 409 */
});
it('las rutas nuevas no responden desde la red', async () => {
  const { app } = await makeApp({ downloads: true });
  expect((await app.inject({ url: '/api/admin/downloads/jobs', remoteAddress: REMOTE })).statusCode).toBe(
    403,
  );
});
```

- [ ] **Step 2: Run** `npx vitest run apps/server/test/http/downloads.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck` → PASS. Arrancar `npm start -w @dsmn/server` contra
      una carpeta de datos de prueba (`DSMN_DATA_DIR` temporal) y verificar que levanta y que `user_version` es 2.
- [ ] **Step 5: Commit (Cristhian)** — `feat(server): rutas de descargas y eventos en vivo`

---

### Task 8: Web — cliente, eventos y Ajustes de yt-dlp

**Files:**

- Modify: `apps/web/src/api/client.ts`, `apps/web/src/api/queries.ts`, `apps/web/src/api/events.ts`,
  `apps/web/src/pages/SettingsPage.tsx`
- Create: `apps/web/src/components/YtDlpSettings.tsx`
- Test: `apps/web/test/ytdlpSettings.test.tsx`, `apps/web/test/client.test.ts`

**Interfaces:**

- Produces:
  - `api.ytdlpStatus()`, `api.setYtdlpPath(path)`, `api.updateYtdlp()`, `api.preview(url)`, `api.enqueue(req)`,
    `api.downloadJobs()`, `api.cancelJob(id)`, `api.resumeJob(id)`, `api.retryJob(id)`, `api.removeJob(id)`,
    `api.ytSources()`, `api.checkSource(id)`, `api.forgetSource(id)`.
  - `queryKeys.ytdlp = ['ytdlp']`, `queryKeys.downloadJobs = ['download-jobs']`, `queryKeys.ytSources = ['yt-sources']`;
    hooks `useYtDlp()`, `useDownloadJobs()`, `useYtSources()`.
  - `events.ts`: `useServerEvents()` además escucha `download`, guarda el último `DownloadEvent` por `jobId` y, cuando
    cambia el `status` de un trabajo, invalida `downloadJobs` y `ytSources`. Expone `DownloadProgressContext`
    (`Record<number, DownloadEvent>`) y `useDownloadProgress()`. `useServerEvents` devuelve
    `{ scan: ScanStatus; downloads: Record<number, DownloadEvent> }` y `Layout` provee los dos contextos.
  - `YtDlpSettings`: sección "Descargas con yt-dlp": campo `Ruta de yt-dlp` (precargado con `path ?? suggestedPath`),
    botón "Guardar", texto `Versión 2026.03.17` o `"yt-dlp no está configurado"`, `ffmpeg: encontrado` /
    `ffmpeg: no encontrado (instalalo y reiniciá el servidor)`, botón "Actualizar" (muestra `output` al terminar y el
    error tal cual si es 409).

- [ ] **Step 1: Write the failing tests**

```ts
it('propone la ruta sugerida, guarda y muestra la versión', async () => {
  /* fakeServer: GET /api/admin/ytdlp → { path: null, suggestedPath: 'D:\\Music\\yt-dlp.exe', version: null, ffmpeg: true, error: null };
     input "Ruta de yt-dlp" tiene 'D:\\Music\\yt-dlp.exe'; click Guardar → PUT con { path: 'D:\\Music\\yt-dlp.exe' }; luego "Versión 2026.03.17" */
});
it('muestra el error de actualizar', async () => {
  /* POST update → 409 'Hay una descarga en curso' → texto visible */
});
it('sin ffmpeg lo avisa', async () => {
  /* ffmpeg: false → 'ffmpeg: no encontrado (instalalo y reiniciá el servidor)' */
});
it('un evento download con cambio de estado refresca la lista de trabajos', async () => {
  /* FakeEventSource.last.emit('download', {...status: 'done'}) → nueva llamada a GET /api/admin/downloads/jobs */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/web` → los nuevos FAIL.
- [ ] **Step 3: Implementar.** Ajustar `layout.test.tsx` si depende de la forma vieja de `useServerEvents`.
- [ ] **Step 4: Run** `npx vitest run apps/web && npm run lint && npm run typecheck` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat(web): ajustes de yt-dlp y eventos de descargas`

---

### Task 9: Web — pestaña "Descargar": previsualizar y encolar

**Files:**

- Create: `apps/web/src/pages/DownloadPage.tsx`, `apps/web/src/components/PreviewTable.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/styles.css`
- Test: `apps/web/test/download.test.tsx`

**Interfaces:**

- Consumes: `api.preview`, `api.enqueue`, `useYtDlp`, `useRoots` (Task 8), `sanitizeFolderName` (Task 1).
- Produces:
  - Pestaña `{ to: '/descargar', label: 'Descargar', prefix: '/descargar' }` entre Listas y Ajustes; ruta `descargar`.
  - `DownloadPage`: formulario con input `Link de YouTube` (placeholder `"Pegá un link de YouTube (playlist o video)"`)
    y botón "Ver"; mientras carga, "Leyendo el link…"; error del servidor tal cual. Si `useYtDlp` dice que falta yt-dlp
    o ffmpeg: aviso `"Para descargar, configurá yt-dlp en Ajustes"` con link a `/ajustes` y "Agregar a la cola"
    deshabilitado.
  - `PreviewTable({ preview, onEnqueued })`:
    - Encabezado: título, `"<N> videos"`, contador `"X de Y elegidas"` (Y = disponibles).
    - Destino: `select` "Carpeta de música" (raíces online) + input "Subcarpeta" con `sanitizeFolderName(title)` por
      defecto (vacío si `kind === 'video'`); con `preview.destination` los dos van fijos (`disabled`) y se muestra
      `"Se guarda en la misma carpeta que la vez anterior"`.
    - Filas: casilla (deshabilitada si `unavailable`), `#` (posición con 2 dígitos), título, canal, duración
      (`formatDuration`), y marcas: `"Repetida de #NN"`, `"Ya en tu biblioteca"`, `"Versión: <tags>"` cuando hay
      `versionGroup`, `"No disponible"`. Las `alreadyDownloaded` van dentro de un `<details>` con resumen
      `"<N> ya descargadas"`.
    - Botones "Todas" (marca todas las disponibles que no están ya descargadas), "Ninguna" y "Agregar a la cola"
      (deshabilitado con 0 elegidas). Envía `EnqueueRequest` con `playlistSize` del preview y los ítems elegidos en orden;
      al confirmar limpia la previsualización.

- [ ] **Step 1: Write the failing tests**

```ts
it('ver un link muestra la previsualización con las casillas por defecto', async () => {
  /* fakeServer preview con 4 entradas: normal, repetida de #01, ya en biblioteca, no disponible
     → 'Repetida de #01', 'Ya en tu biblioteca', 'No disponible' visibles; '1 de 3 elegidas';
     la casilla de 'No disponible' está deshabilitada */
});
it('Todas, Ninguna y encolar mandan lo elegido con la subcarpeta saneada', async () => {
  /* título 'AC/DC: Hits?' → input Subcarpeta 'AC_DC_ Hits_'; Todas → '3 de 3 elegidas'; Agregar a la cola
     → POST /api/admin/downloads/jobs con folder 'AC_DC_ Hits_', playlistSize 4 y 3 items en orden */
});
it('playlist guardada: destino fijo y ya descargadas plegadas', async () => {
  /* preview con destination y 2 alreadyDownloaded → selects disabled, texto 'Se guarda en la misma carpeta que la vez anterior', '2 ya descargadas' */
});
it('sin yt-dlp avisa y no deja encolar', async () => {
  /* GET ytdlp path null → aviso con link a Ajustes */
});
it('muestra el error del link tal cual', async () => {
  /* preview 400 '[youtube] bad: Video unavailable' */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/web/test/download.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** `npx vitest run apps/web && npm run lint && npm run typecheck && npm run format:check` → PASS.
- [ ] **Step 5: Commit (Cristhian)** — `feat(web): previsualizar y encolar descargas`

---

### Task 10: Web — cola, playlists guardadas, README y prueba real

**Files:**

- Create: `apps/web/src/components/DownloadQueue.tsx`, `apps/web/src/components/YtSources.tsx`
- Modify: `apps/web/src/pages/DownloadPage.tsx`, `apps/web/src/styles.css`, `README.md`, `apps/server/README.md`
- Test: `apps/web/test/downloadQueue.test.tsx`

**Interfaces:**

- Consumes: `useDownloadJobs`, `useYtSources`, `useDownloadProgress`, acciones de `api` (Task 8), `PreviewTable` (Task 9).
- Produces:
  - `DownloadQueue`: sección "Cola". Por trabajo: título, estado (`"En espera"`, `"Bajando"`, `"Pausado: <motivo>"`,
    `"Terminado"`, `"Cancelado"`), `"<done>/<total>"`, y si está bajando `"<título actual> <percent>%"` o
    `"Convirtiendo…"` (del contexto de progreso). Botones según estado: Cancelar (`pending`/`running`/`paused`),
    Reanudar (`paused`), Reintentar fallidas (hay `failed`/`cancelled`), Quitar (`pending`/`done`/`cancelled`).
    `<details>` "Ver canciones" con cada canción y su estado (`"falló: <error>"`).
  - `YtSources`: sección "Tus playlists de YouTube" con título, ruta (`displayPath`), `"<downloaded> canciones"`,
    `"revisada <fecha>"` y botones "Buscar nuevas" (llama `api.checkSource` y muestra el resultado en `PreviewTable`
    de la página) y "Olvidar" (con `confirm`: `"Se deja de seguir <título>. Los archivos y la lista no se borran."`).
  - README raíz: en "Cómo se usa", paso **Descargar** (configurar yt-dlp en Ajustes, pegar link, revisar, encolar);
    README del servidor: rutas nuevas y `yt-tmp/` en la carpeta de datos.

- [ ] **Step 1: Write the failing tests**

```ts
it('muestra el progreso en vivo del trabajo en curso', async () => {
  /* GET jobs con uno running; emit('download', { jobId: 1, status: 'running', done: 1, failed: 0, total: 3, current: { title: 'Burn My Dread', stage: 'download', percent: 43 } })
     → '1/3' y 'Burn My Dread 43%' */
});
it('botones según el estado llaman a la API', async () => {
  /* paused → Reanudar → POST resume; failed → Reintentar fallidas → POST retry */
});
it('Buscar nuevas abre la previsualización de esa playlist', async () => {
  /* POST sources/1/check → PreviewTable con destino fijo */
});
it('Olvidar pide confirmación', async () => {
  /* confirm false → sin DELETE; true → DELETE sources/1 */
});
```

- [ ] **Step 2: Run** `npx vitest run apps/web/test/downloadQueue.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** componentes y README.
- [ ] **Step 4: Run** `npm test && npm run lint && npm run typecheck && npm run format:check` → PASS.
- [ ] **Step 5: Prueba real (con Cristhian):** `npm start`; en Ajustes configurar `D:\Music\yt-dlp.exe`; en Descargar
      pegar una playlist pública corta (3–5 videos), verificar marcas, desmarcar una, encolar; comprobar en
      `D:\Music\<playlist>`: nombres `NN - Título.mp3`, etiquetas ID3v2.3 y portada (propiedades del archivo en el
      Explorador), que aparecen en Biblioteca y en la lista de carpeta nueva; "Buscar nuevas" muestra todo como ya
      descargado; reiniciar el servidor a mitad de una descarga y ver que retoma.
- [ ] **Step 6: Commit (Cristhian)** — `feat(web): cola de descargas y playlists de youtube`
