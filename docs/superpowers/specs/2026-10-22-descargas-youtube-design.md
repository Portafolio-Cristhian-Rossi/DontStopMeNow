# DontStopMeNow — Descargas desde YouTube (diseño)

**Fecha:** 2026-10-22
**Estado:** borrador para revisión
**Relación:** se suma al [diseño general](2026-10-22-dontstopmenow-design.md); no cambia la sincronización
ni la app del celular.

## 1. Objetivo

Hoy la música nueva se baja a mano con `yt-dlp` y una receta fija (`D:\Music\Descargar Playlist.txt`):
MP3 con metadata y portada, carpeta por playlist, archivos `NN - Título.mp3` y pausas para que YouTube no
bloquee. El objetivo es hacer lo mismo desde la web de gestión, con las ventajas de una interfaz:

1. **Pegar el link y listo:** sin editar comandos.
2. **Previsualizar y filtrar:** ver qué canciones trae el link antes de bajar, con los duplicados ya
   marcados, y elegir cuáles bajar.
3. **Ver el progreso:** canción actual, cuántas van, cuáles fallaron y por qué.
4. **Cola:** varios links, uno detrás del otro, aunque se cierre el navegador.
5. **Actualizar playlists:** recordar las playlists bajadas y traer solo lo nuevo.

Lo bajado cae en una carpeta de música ya agregada, así que el vigilante lo escanea, aparece en la
biblioteca y puede sincronizarse al celular como cualquier otra canción.

### Criterios de éxito

1. Pegar el link de una playlist, ver la lista en pocos segundos, desmarcar algunas y que se bajen solo
   las marcadas, en `Destino\Título de la playlist\NN - Título.mp3`, con metadata y portada.
2. Los videos repetidos del mismo link y las canciones que ya están en la biblioteca vienen desmarcados;
   las versiones (en vivo, remix…) se muestran agrupadas.
3. Ver el progreso en vivo; una canción que falla no frena las demás y se puede reintentar.
4. Encolar un segundo link mientras se baja el primero.
5. Reiniciar el servidor a mitad de una descarga y que siga desde la canción que quedó a medias.
6. Al terminar una playlist existe una lista de carpeta con su nombre; "Buscar nuevas" baja solo los videos
   agregados después y aparecen en esa lista.
7. Ver la versión de yt-dlp y actualizarlo desde Ajustes.

### Fuera de alcance

Otros formatos (M4A, Opus) o calidades, argumentos extra de yt-dlp, cookies o cuentas, descargas en
paralelo, buscar en YouTube desde la app, revisar playlists automáticamente, editar etiquetas, borrar
archivos al desmarcar, gestionar ffmpeg. Otros sitios que soporta yt-dlp no se bloquean, pero solo se
prueba YouTube y la detección de duplicados está pensada para sus títulos.

## 2. Decisiones tomadas

| Tema                 | Decisión                                                                  | Motivo                                                                     |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Quién ejecuta yt-dlp | El servidor; la web solo lo maneja                                        | Ya corre en la compu, tiene ffmpeg a mano y sigue aunque se cierre la web  |
| Cómo se ejecuta      | Un proceso de yt-dlp por canción, en una cola propia, de a uno            | Progreso exacto, fallas aisladas, cancelar entre canciones, "nuevas" fácil |
| Previsualización     | `yt-dlp --flat-playlist -J`                                               | Rápido y sin bajar nada                                                    |
| Opciones             | Receta fija (la del `.txt`); solo se elige destino y subcarpeta           | Simple y sin errores                                                       |
| Binario de yt-dlp    | El del usuario, con la ruta en Ajustes y botón "Actualizar" (`yt-dlp -U`) | No bajar ejecutables por cuenta propia                                     |
| ffmpeg               | El del `PATH`                                                             | Ya está instalado (winget)                                                 |
| Duplicados           | Función pura en `packages/shared`                                         | Testeable sin yt-dlp ni base                                               |
| Al terminar          | Se crea una lista de carpeta con el nombre de la playlist                 | Lo nuevo aparece solo en la lista y llega al celular                       |

## 3. Receta

La receta del usuario, traducida a la ejecución por canción:

```
yt-dlp -x --audio-format mp3 --add-metadata --embed-thumbnail --convert-thumbnails jpg
       --sleep-requests 2 --postprocessor-args "ffmpeg:-id3v2_version 3"
       --no-playlist --newline --progress --no-warnings
       -P "home:<carpeta destino>" -P "temp:<datos>/yt-tmp/<jobId>"
       -o "<NN> - %(title)s.%(ext)s"
       --progress-template "download:dsmn-progress %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s"
       --print "after_move:dsmn-file %(filepath)s"
       -- <url del video>
```

- `NN` es la **posición original en la playlist**, con dos dígitos (tres si la playlist tiene más de 99).
  Un video suelto usa `%(title)s.%(ext)s`, sin número.
- Cambios respecto al `.txt`: sale `--embed-subs` (no hace nada en MP3) y `--sleep-interval 5` lo
  reemplaza la cola, que espera **5 s** después de cada canción descargada.
- `--print` implica `--quiet`, que oculta el progreso; por eso va `--progress` explícito.
- La carpeta temporal está en los datos del servidor: en el destino solo aparece el `.mp3` terminado, así
  el vigilante nunca ve `.webm`, `.part` ni portadas sueltas.
- El proceso se lanza **sin shell** y con los argumentos como lista; el link va después de `--`.

## 4. Arquitectura

Módulo nuevo `apps/server/src/downloads/`:

| Unidad        | Responsabilidad                                                                                                                                                                      | Depende de                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `ytdlp.ts`    | Único lugar que ejecuta yt-dlp: `version()`, `update()`, `preview(url)`, `downloadOne(opts, onProgress, signal)`. Interpreta las líneas `dsmn-progress` / `dsmn-file` y los `ERROR:` | `node:child_process`            |
| `recipe.ts`   | Arma los argumentos de la sección 3 (función pura)                                                                                                                                   | —                               |
| `settings.ts` | Ruta de yt-dlp en `meta`, detección automática, estado de ffmpeg                                                                                                                     | `db`, `ytdlp`                   |
| `queue.ts`    | Cola de trabajos: un trabajo y una canción a la vez, estados en la base, eventos de progreso, cancelar, pausar, reanudar, reintentar, recuperación al arrancar                       | `db`, `ytdlp`, `bus`, `library` |
| `routes.ts`   | Rutas `/api/admin/downloads/*` y `/api/admin/ytdlp*`                                                                                                                                 | lo anterior                     |

`packages/shared/src/dedupe.ts`: análisis de duplicados (sección 6). `packages/shared/src/schemas.ts`:
esquemas zod de las rutas nuevas.

Web: página `DownloadPage` en `/descargar` (pestaña "Descargar" entre Listas y Ajustes) y sección
"Descargas con yt-dlp" en Ajustes.

### 4.1 Detección de yt-dlp y ffmpeg

- Si no hay ruta guardada, se propone la primera que exista: `yt-dlp` en el `PATH` y después
  `<raíz>\yt-dlp.exe` (en Linux `<raíz>/yt-dlp`) de cada carpeta de música. Con `D:\Music` como raíz
  encuentra `D:\Music\yt-dlp.exe`.
- Guardar una ruta la valida corriendo `--version`; si falla, no se guarda y se muestra el error.
- ffmpeg: se busca en el `PATH` (`ffmpeg -version`). Sin ffmpeg no se puede encolar.
- "Actualizar" corre `yt-dlp -U` y muestra la versión nueva y la salida. No se permite con una descarga en
  curso.

## 5. Datos

Migración nueva, **solo crea tablas**:

```sql
CREATE TABLE yt_sources (           -- playlists guardadas
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  yt_playlist_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  folder_rel_path TEXT NOT NULL,     -- relativa a la raíz, separador '/'
  playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL,  -- lista de carpeta creada
  created_at INTEGER NOT NULL,
  last_checked_at INTEGER
);
CREATE TABLE yt_jobs (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES yt_sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  folder_rel_path TEXT NOT NULL,
  status TEXT NOT NULL,              -- pending | running | paused | done | cancelled
  pause_reason TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE yt_items (
  job_id INTEGER NOT NULL REFERENCES yt_jobs(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  position INTEGER,                  -- NULL en un video suelto
  title TEXT NOT NULL,
  status TEXT NOT NULL,              -- pending | downloading | done | failed | cancelled
  error TEXT,
  file_path TEXT,
  PRIMARY KEY (job_id, video_id)
);
```

- La ruta de yt-dlp se guarda en `meta` (clave `ytdlp_path`).
- "Ya bajado de esta playlist" = algún `yt_items.status = 'done'` de un trabajo con ese `source_id`.
- Quitar una raíz borra en cascada sus fuentes y trabajos (no los archivos, que ya los saca de la
  biblioteca `removeRoot`).

## 6. Duplicados (`dedupe.ts`)

Entrada: las entradas de la previsualización y, de la biblioteca, `{ id, title, artists }` de cada
canción. Para cada entrada:

1. **Artista y título:** si el título es `Artista - Canción` (separadores `-`, `–`, `—`), se usa eso; si
   no, artista = canal sin ` - Topic`, `VEVO` ni `Official`, y título = título del video.
2. **Limpieza:** se quitan entre paréntesis o corchetes `Official Video/Audio`, `Music Video`, `Lyrics`,
   `Lyric Video`, `Letra`, `Video Oficial`, `Audio`, `Visualizer`, `HD`, `4K`, `Remaster(ed)`; también
   `ft./feat. …`. Después: sin tildes, minúsculas, sin signos, espacios colapsados (sobre `normalizeKey`).
3. **Etiquetas de versión** (en cualquier parte del título): en vivo/live, remix, acústico/acoustic,
   extended, sped up, slowed, nightcore, instrumental, cover, karaoke, demo, radio edit, unplugged. Se
   quitan del título limpio y se guardan como conjunto.

Clave de canción = título limpio + etiquetas. Resultado por entrada:

| Marca               | Regla                                                                                                                  | Casilla por defecto  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `duplicateOf`       | Misma clave que una entrada anterior del link, y los artistas no se contradicen (si los dos tienen artista, coinciden) | desmarcada           |
| `inLibrary`         | Misma clave y mismo artista que una canción de la biblioteca (sin artista no se compara)                               | desmarcada           |
| `versionGroup`      | Mismo título limpio que otra entrada pero con etiquetas distintas                                                      | sin cambio           |
| `alreadyDownloaded` | (solo en "Buscar nuevas") el video ya se bajó de esa playlist                                                          | desmarcada, plegada  |
| `unavailable`       | yt-dlp lo marca privado o borrado                                                                                      | desmarcada, inactiva |

El resto viene marcado. El usuario puede cambiar cualquier casilla salvo las de videos no disponibles.

## 7. API

Todas en `/api/admin` (solo localhost), errores con el formato común.

| Ruta                                          | Qué hace                                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/ytdlp`                        | `{ path, version, ffmpeg, suggestedPath }`                                                                                                                                                                |
| `PUT /api/admin/ytdlp` `{ path }`             | Valida con `--version` y guarda                                                                                                                                                                           |
| `POST /api/admin/ytdlp/update`                | `yt-dlp -U`; `409` si hay una descarga en curso                                                                                                                                                           |
| `POST /api/admin/downloads/preview` `{ url }` | `{ kind: 'playlist' \| 'video', ytPlaylistId?, title, url, sourceId?, entries: [...] }` con el análisis de la sección 6. Si el link es de una playlist guardada, incluye `sourceId` y `alreadyDownloaded` |
| `POST /api/admin/downloads/jobs`              | Encola `{ url, title, rootId, folder, ytPlaylistId?, items: [{ videoId, position, title }] }`; crea o reutiliza la fuente; si ya existe, `rootId`/`folder` deben coincidir con los suyos (`409` si no)    |
| `GET /api/admin/downloads/jobs`               | Trabajos con sus canciones (los terminados, últimos 20)                                                                                                                                                   |
| `POST /api/admin/downloads/jobs/:id/cancel`   | Cancela (mata el proceso si está bajando)                                                                                                                                                                 |
| `POST /api/admin/downloads/jobs/:id/resume`   | Reanuda uno pausado                                                                                                                                                                                       |
| `POST /api/admin/downloads/jobs/:id/retry`    | Vuelve a la espera las canciones fallidas o canceladas                                                                                                                                                    |
| `DELETE /api/admin/downloads/jobs/:id`        | Quita un trabajo en espera o terminado de la lista (no borra archivos)                                                                                                                                    |
| `GET /api/admin/downloads/sources`            | Playlists guardadas con cantidad bajada y última revisión                                                                                                                                                 |
| `POST /api/admin/downloads/sources/:id/check` | Igual que `preview` sobre esa playlist; actualiza `last_checked_at`                                                                                                                                       |
| `DELETE /api/admin/downloads/sources/:id`     | Olvida la playlist (no borra archivos ni la lista)                                                                                                                                                        |

Eventos en vivo (el `/api/admin/events` existente): evento `download` con
`{ jobId, status, done, failed, total, current?: { videoId, title, stage: 'download' | 'convert', percent } }`,
a lo sumo 4 por segundo. La web refresca la lista de trabajos cuando cambia `status`.

## 8. Cola

- **Orden:** trabajos por orden de llegada; dentro de un trabajo, canciones por posición.
- **Destino:** `resolveRelDir(raíz, folder)`. La subcarpeta se sanea: sin `< > : " / \ | ? *`, sin
  puntos ni espacios al final, sin `..`. Se crea si no existe.
- **Por canción:** `downloadOne` → `done` con `file_path`, o `failed` con la última línea `ERROR:`. Si el
  archivo final ya existía, yt-dlp no lo vuelve a bajar y cuenta como `done`. Después de cada `done`,
  espera 5 s.
- **Al terminar un trabajo** con al menos una canción `done`: pide un escaneo parcial de la subcarpeta y,
  si la fuente no tiene lista, crea una lista de carpeta (`createPlaylist` tipo `folder`) con el título de
  la playlist. Si falla, se registra en el log y el trabajo igual termina.
- **Límite de YouTube:** 3 fallas seguidas con `HTTP Error 429` o `Sign in to confirm` → el trabajo pasa a
  `paused` con el motivo "YouTube está limitando las descargas: esperá un rato o actualizá yt-dlp".
- **Raíz desconectada:** antes de cada canción; si está offline, `paused` con "La carpeta de destino no
  está conectada".
- **Cancelar:** mata el proceso (en Windows con `taskkill /T /F` para cerrar también ffmpeg), borra la
  carpeta temporal del trabajo y deja las canciones pendientes como `cancelled`.
- **Al arrancar:** `running` → `pending`, `downloading` → `pending`, se borra `yt-tmp/` y la cola sigue.
- **Sin yt-dlp o sin ffmpeg:** no se encola (`409` con el motivo).

## 9. Interfaz web

- **Descargar:** campo de link + "Ver"; previsualización con título, cantidad, destino (raíz + subcarpeta
  editable, por defecto el título de la playlist; vacía para un video suelto; **fijo y no editable** si el
  link es de una playlist guardada, para que su lista de carpeta siga apuntando al mismo lugar), tabla con casilla, número,
  título, canal, duración y las marcas de la sección 6 ("Repetida de #N", "Ya en tu biblioteca",
  "Versiones"), contador "X de Y elegidas", botones "Todas", "Ninguna" y "Agregar a la cola".
  Debajo, **Cola** (trabajo actual con progreso, en espera, terminados; detalle por canción; Cancelar,
  Reanudar, Reintentar fallidas, Quitar) y **Tus playlists de YouTube** (Buscar nuevas, Olvidar).
- Si falta yt-dlp o ffmpeg: aviso arriba con link a Ajustes; "Agregar a la cola" deshabilitado.
- **Ajustes → Descargas con yt-dlp:** campo de ruta (con la sugerida), Guardar, versión, estado de
  ffmpeg y "Actualizar".

## 10. Manejo de errores

| Situación                             | Comportamiento                                                              |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Link inválido, privado o no soportado | `preview` responde `400` con la línea `ERROR:` de yt-dlp                    |
| Link que no es `http(s)`              | `400` sin ejecutar yt-dlp                                                   |
| Canción no disponible / bloqueada     | `failed` con el motivo; el trabajo sigue                                    |
| Límite de YouTube                     | Pausa con aviso (sección 8)                                                 |
| Raíz desconectada                     | Pausa con aviso                                                             |
| yt-dlp se cuelga                      | Sin salida por 5 min → se mata y la canción queda `failed` ("No respondió") |
| Servidor reiniciado                   | Retoma (sección 8)                                                          |

## 11. Pruebas

- **`dedupe.ts`:** casos con títulos reales: "Artista - Canción (Official Video)" vs "(Lyrics)" vs
  "[Audio]"; canal " - Topic"; "feat."; versiones en vivo/remix/sped up; mismo título con distinto
  artista; comparación con la biblioteca con y sin artista.
- **`recipe.ts`:** argumentos para playlist, video suelto y numeración de 3 dígitos.
- **`ytdlp.ts` y `queue.ts`:** con un **yt-dlp falso** (script de Node invocado como binario) que según el
  video imprime progreso y escribe el archivo, falla con un `ERROR:`, simula un 429 o se cuelga. Se
  prueba: orden de a uno, pausa entre canciones (con temporizadores falsos), cancelar, reintentar,
  pausa por límite, raíz offline, recuperación al arrancar, lista de carpeta al terminar y "Buscar nuevas".
- **Rutas:** `app.inject` como en `admin.test.ts`.
- **Web:** previsualización (casillas por defecto, Todas/Ninguna, contador), cola con eventos falsos,
  sección de Ajustes.
- **Manual:** bajar una playlist pública corta con el yt-dlp real, verificar nombres, etiquetas y portada,
  ver que aparece en la biblioteca y en su lista, y probar "Buscar nuevas".
