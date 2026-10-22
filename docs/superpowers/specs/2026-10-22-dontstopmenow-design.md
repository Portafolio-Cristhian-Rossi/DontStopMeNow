# DontStopMeNow — Diseño

**Fecha:** 2026-10-22
**Estado:** borrador para revisión

## 1. Objetivo

Un ecosistema de música personal y cerrado en dos partes:

- **Servidor (compu):** corre en Windows (y en Linux sin cambios), indexa la música
  local a partir de su metadata y permite gestionarla desde una interfaz web.
- **App Android:** se vincula al servidor por el WiFi de casa, permite elegir qué
  álbumes y listas bajar, los sincroniza al teléfono y los reproduce sin conexión
  con su propio reproductor.

### Criterios de éxito

1. Apuntar el servidor a una o más carpetas de música y ver la biblioteca
   (álbumes, artistas, canciones, portadas) armada desde la metadata, sin importar
   cómo estén organizadas las carpetas.
2. Crear listas manuales y listas de carpeta desde la web.
3. Vincular el celular escaneando un QR.
4. Elegir álbumes/listas en el celular, sincronizar y que solo quede en el teléfono
   lo elegido (lo desmarcado se borra).
5. Una sincronización interrumpida (WiFi cortado, app cerrada) se retoma sin
   archivos corruptos.
6. Reproducir sin conexión con pantalla apagada, controles en la pantalla de
   bloqueo/notificación, cola, aleatorio, repetir, y retomar donde se dejó.

### Fuera de alcance (por ahora)

Acceso desde fuera de la red local, varios usuarios, editar metadata desde la app,
streaming sin descargar, sincronización en segundo plano, tarjeta SD, ecualizador,
letras, estadísticas, transcodificación, cliente iOS.

## 2. Decisiones tomadas

| Tema              | Decisión                                                            | Motivo                                                                                                    |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Modelo            | Sincronización (descarga) + reproducción offline                    | Escuchar fuera de casa                                                                                    |
| Plataforma móvil  | Android                                                             | Teléfono del usuario                                                                                      |
| Lenguaje          | TypeScript en las tres partes                                       | Objetivo de aprender Node/React; tipos compartidos                                                        |
| Servidor          | Node 24 LTS + Fastify, nativo (sin Docker)                          | Docker Desktop en Windows rompe la detección de cambios en archivos y el mDNS; Node ya es multiplataforma |
| Base del servidor | SQLite vía `node:sqlite`                                            | Un solo archivo, sin instalar nada                                                                        |
| Web de gestión    | React + Vite, servida por el propio servidor                        | Sin app de escritorio aparte                                                                              |
| App móvil         | Expo (React Native) + `react-native-track-player`                   | Un solo lenguaje; reproductor con soporte de segundo plano sobre Media3/ExoPlayer                         |
| Organización      | Biblioteca por metadata; carpetas ignoradas salvo listas de carpeta | Así organiza el usuario                                                                                   |
| Docker            | `Dockerfile` opcional para Linux, en la etapa de empaquetado        | Portabilidad sin depender de Docker en Windows                                                            |

## 3. Arquitectura

```
DontStopMeNow/                (monorepo, npm workspaces)
├── packages/shared/          tipos, esquemas zod, contrato de API, lógica pura compartida
├── apps/server/              servidor Node (Fastify)
├── apps/web/                 interfaz de gestión (React + Vite)
└── apps/mobile/              app Android (Expo)
```

```
[Archivos de música] → Escáner / Vigilante → SQLite → API HTTP ← Web (localhost, gestión)
                                                              ← App Android (token: catálogo + descargas)
                                     Anunciador mDNS ───────────→ App Android (descubrimiento)
```

### 3.1 Unidades del servidor

| Unidad      | Responsabilidad                                                                                                                 | Depende de                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `scanner`   | Recorre carpetas raíz, lee metadata (`music-metadata`), calcula huellas, detecta movimientos, actualiza la base                 | `db`, `covers`             |
| `watcher`   | Observa las raíces con `chokidar`, agrupa eventos (debounce ~2 s) y pide al `scanner` un escaneo parcial de las rutas afectadas | `scanner`                  |
| `covers`    | Extrae portada incrustada o `cover.jpg`/`folder.jpg`, la guarda en caché por hash                                               | sistema de archivos        |
| `db`        | Acceso a SQLite, migraciones, consultas                                                                                         | `node:sqlite`              |
| `library`   | Arma el catálogo (álbumes, artistas, listas, canciones) y calcula listas de carpeta                                             | `db`                       |
| `api`       | Rutas HTTP, autenticación, validación con zod                                                                                   | `library`, `db`, `pairing` |
| `pairing`   | Códigos de vinculación de un solo uso, tokens de dispositivos                                                                   | `db`                       |
| `discovery` | Anuncia el servicio por mDNS (`bonjour-service`)                                                                                | —                          |

### 3.2 Configuración y datos del servidor

- Carpeta de datos: `%APPDATA%\DontStopMeNow` en Windows, `~/.local/share/dontstopmenow`
  en Linux; se puede cambiar con la variable `DSMN_DATA_DIR`. Contiene `library.db` y
  `covers/`.
- Puerto por defecto `4747` (`DSMN_PORT`).
- Al primer arranque se genera un `serverId` (UUID) persistente.

## 4. Biblioteca y listas

### 4.1 Formatos

mp3, flac, m4a/aac, ogg, opus, wav. Se entregan tal cual (sin transcodificar).

### 4.2 Modelo de datos (servidor)

```
roots          (id, path, status: 'online'|'offline', created_at)
tracks         (id UUID, root_id, rel_path, size, mtime, fingerprint,
                title, artist, album_artist, album, track_no, disc_no, year,
                duration_ms, format, album_id, cover_id, updated_at)
albums         (id, title, artist, cover_id, year)
covers         (id = hash del contenido, mime)
playlists      (id UUID, name, type: 'manual'|'folder', root_id NULL, folder_rel_path NULL,
                created_at, updated_at)
playlist_tracks(playlist_id, track_id, position)       -- solo listas manuales
devices        (id UUID, name, token_hash, created_at, last_seen_at)
scan_issues    (path, error, detected_at)
meta           (key, value)                            -- serverId, library_revision
```

Los artistas se derivan de `albums.artist` y `tracks.artist` por consulta.

### 4.3 Reglas de armado

- **Valores faltantes:** sin título → nombre de archivo sin extensión; sin artista →
  "Artista desconocido"; sin álbum → "Sin álbum".
- **Álbum:** clave = `normalizar(album_artist ?? artist) + normalizar(album)`
  (minúsculas, sin espacios repetidos ni espacios en los extremos). `album.id` = hash
  de esa clave, así es **estable** entre escaneos y el celular puede guardar la
  selección por ID. Las canciones del álbum se ordenan por disco y número de pista.
- **Portada del álbum:** la de la primera canción que tenga portada.

### 4.4 Identidad de canciones y movimientos

- `fingerprint` = `size` + SHA-1 de los primeros 64 KB y los últimos 64 KB del archivo.
- Al terminar un escaneo (completo o parcial), si una ruta desapareció y apareció una
  nueva con la misma huella, se trata como **movimiento**: se actualiza `root_id`/`rel_path`
  y se conserva el `id` (y por lo tanto su lugar en las listas manuales).
- Si la huella de una ruta existente cambia (archivo editado), se conserva el `id` y se
  actualizan la metadata y la huella.
- Una canción que desaparece sin coincidir con nada se borra de `tracks` y de
  `playlist_tracks`.

### 4.5 Carpetas raíz desconectadas

Si la ruta de una raíz no existe al escanear (disco externo desenchufado), la raíz pasa a
`offline` y **no se borra ninguna de sus canciones**. En el catálogo esas canciones
aparecen con `available: false`. Al volver la ruta, la raíz vuelve a `online` y se
reescanea.

### 4.6 Listas

- **Manual:** lista ordenada de `track_id`. Una canción puede estar en varias listas.
- **De carpeta:** `root_id` + `folder_rel_path`; contiene todas las canciones cuya
  ruta está dentro de esa carpeta (con subcarpetas), ordenadas por ruta. Se calcula
  al pedir el catálogo; no guarda canciones.

### 4.7 Revisión de la biblioteca

`library_revision` (entero) se incrementa con cada cambio que afecte el catálogo
(escaneo con cambios, alta/baja/edición de listas, cambio de estado de una raíz).

## 5. API HTTP

Formato de error común: `{ "error": { "code": string, "message": string } }`.
Todos los cuerpos se validan con los esquemas zod de `packages/shared`.

### 5.1 Autenticación

- **Pedidos desde `localhost`** (127.0.0.1 / ::1): acceso total (los usa la web).
- **Pedidos desde la red:** solo `/api/pair` sin token; el resto requiere
  `Authorization: Bearer <token>` de un dispositivo vinculado y **solo** puede usar las
  rutas de dispositivo (5.2). Las rutas `/api/admin/*` responden 403 desde la red.
- Los tokens se guardan hasheados (SHA-256). Revocar un dispositivo borra su fila.

### 5.2 Rutas de dispositivo

| Método y ruta              | Descripción                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/pair`           | `{ code, deviceName }` → `{ token, serverId, serverName }`. El código es de un solo uso y vence a los 5 min |
| `GET /api/catalog`         | Catálogo completo (ver 5.4). Soporta `ETag` = revisión → `304` si no cambió                                 |
| `GET /api/tracks/:id/file` | Archivo de audio original; soporta `Range` (para retomar descargas). `409` si la raíz está offline          |
| `GET /api/covers/:id`      | Imagen de portada                                                                                           |

### 5.3 Rutas de gestión (`/api/admin`, solo localhost)

| Método y ruta                                              | Descripción                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET/POST/DELETE /api/admin/roots`                         | Listar, agregar (`{ path }`) y quitar carpetas raíz                                         |
| `GET /api/admin/browse?rootId=&path=`                      | Subcarpetas de una ruta dentro de una raíz (para elegir listas de carpeta)                  |
| `POST /api/admin/scan`                                     | Iniciar escaneo completo                                                                    |
| `GET /api/admin/events`                                    | Server-Sent Events: progreso del escaneo y cambios de revisión                              |
| `GET /api/admin/issues`                                    | Archivos con problemas                                                                      |
| `POST /api/admin/playlists`                                | Crear lista manual (`{ name, trackIds? }`) o de carpeta (`{ name, rootId, folderRelPath }`) |
| `PATCH /api/admin/playlists/:id`                           | Renombrar y/o reemplazar `trackIds` (orden)                                                 |
| `DELETE /api/admin/playlists/:id`                          | Borrar lista                                                                                |
| `POST /api/admin/pairing-code`                             | Nuevo código → `{ code, expiresAt, qrPayload }`                                             |
| `GET /api/admin/devices` / `DELETE /api/admin/devices/:id` | Listar / revocar dispositivos                                                               |

La web también usa `GET /api/catalog` (desde localhost no necesita token).

### 5.4 Forma del catálogo

```ts
interface Catalog {
  serverId: string;
  revision: number;
  tracks: Track[]; // id, title, artist, albumId, trackNo, discNo, durationMs,
  // format, size, fingerprint, coverId, available
  albums: Album[]; // id, title, artist, year, coverId, trackIds (ordenados)
  playlists: Playlist[]; // id, name, type, trackIds (ordenados; calculados si es de carpeta)
}
```

Los artistas no viajan aparte: la web y el celular los derivan de `albums` y `tracks`.

### 5.5 QR de vinculación

El QR contiene JSON: `{ "v": 1, "serverId", "urls": ["http://192.168.x.y:4747", ...], "code" }`
con todas las IPv4 privadas de la compu. El celular prueba las URLs en orden.

## 6. Sincronización

### 6.1 Estado local del celular (expo-sqlite)

```
server       (server_id, name, last_url, token)
catalog_*    copia del último catálogo recibido (tracks, albums, playlists, revision)
selection    (kind: 'album'|'playlist', id)
downloads    (track_id, fingerprint, local_path, size)
player_state (queue, index, position_ms, repeat, shuffle)
```

### 6.2 Plan de sincronización (función pura en `packages/shared`)

`computeSyncPlan(catalog, selection, downloads) → { download, delete, prunedSelection }`

1. `prunedSelection` = selección sin los álbumes/listas que ya no existen en el catálogo.
2. `desired` = unión de los `trackIds` de los elementos de `prunedSelection`.
3. `download` = canciones de `desired` con `available: true` que no están en `downloads`
   o cuya `fingerprint` local difiere de la del catálogo.
4. `delete` = canciones de `downloads` que no están en `desired`.
   (Las canciones de raíces offline siguen en el catálogo, así que si están
   seleccionadas permanecen en `desired` y no se borran.)

### 6.3 Ejecución

- Antes de empezar: si `suma(download.size)` > espacio libre − 200 MB de margen, se
  avisa cuánto falta y no se empieza.
- Se aplican primero los borrados (excepto la canción que está sonando, que queda para
  la próxima sincronización) y después las descargas.
- Descargas: 2 en paralelo. Cada una escribe en `<id>.part`; si ya existe, retoma con
  `Range: bytes=<tamaño>-`. Al terminar, verifica el tamaño, renombra a `<id>.<ext>` y
  registra en `downloads`.
- Error de red o 5xx: hasta 3 reintentos con espera creciente (2 s, 4 s, 8 s). Si sigue
  fallando, se marca la canción como fallida y se continúa; al final se muestra el resumen.
- Si se pierde la conexión con el servidor, se detiene; lo ya bajado queda.
- Archivos en el almacenamiento privado de la app (`documentDirectory/music/`).

### 6.4 Cuándo

Al abrir la app si el servidor responde, y con el botón "Sincronizar".

## 7. App del celular

### 7.1 Pantallas (expo-router)

1. **Vinculación:** escanear QR (expo-camera), elegir un servidor encontrado por mDNS
   (react-native-zeroconf) o escribir la dirección.
2. **Biblioteca:** pestañas Álbumes / Artistas / Listas / Canciones + buscador. Solo
   contenido descargado.
3. **Detalle de álbum/lista:** portada, canciones, reproducir, aleatorio.
4. **Descargas:** catálogo completo con interruptores, tamaños, espacio
   seleccionado/libre, botón Sincronizar y progreso.
5. **Reproductor:** portada, barra de progreso, anterior/siguiente, aleatorio,
   repetir (no/todo/una), cola. Mini reproductor persistente en las demás pantallas.
6. **Ajustes:** servidor, desvincular, espacio usado, borrar descargas.

### 7.2 Reconexión

Se guarda `serverId` y la última URL. Si la URL no responde, se busca por mDNS un
servicio `_dontstopmenow._tcp` con ese `serverId` y se actualiza la URL.

### 7.3 Reproductor (react-native-track-player)

- Reproducción en segundo plano; controles en notificación y pantalla de bloqueo.
- Botones de auriculares/Bluetooth.
- Foco de audio: pausa en llamadas, baja el volumen con notificaciones.
- Pausa al desconectar auriculares.
- Cola: reproducir álbum/lista reemplaza la cola; "Reproducir a continuación" y
  "Agregar a la cola".
- Se guarda `player_state` al cambiar de canción, al pausar y cada 10 s; al abrir se
  restaura la cola y la posición (en pausa).

### 7.4 Errores

- Servidor inalcanzable: la app funciona offline y lo indica en Descargas.
- `401`: se pide volver a vincular; no se borran descargas.

## 8. Interfaz web

- **Biblioteca:** grilla de álbumes, artistas, tabla de canciones con buscador;
  "Agregar a lista…" desde canción, álbum o selección múltiple.
- **Listas:** crear manuales y reordenar arrastrando (dnd-kit); crear de carpeta con
  el explorador de `/api/admin/browse`.
- **Ajustes:** carpetas raíz y su estado, Reescanear, progreso en vivo (SSE),
  archivos con problemas.
- **Dispositivos:** QR de vinculación (se regenera al vencer), lista y revocación.

Datos con TanStack Query; navegación con React Router.

## 9. Manejo de errores (servidor)

- Archivo ilegible o corrupto: va a `scan_issues`, el escaneo continúa.
- Raíz inexistente: `offline` (ver 4.5).
- Ruta agregada que no existe o no es carpeta: `400` con mensaje claro.
- Permiso de red en Windows: documentado en el README (aceptar en redes privadas).

## 10. Pruebas

- **`packages/shared`:** Vitest. `computeSyncPlan`, normalización y clave de álbum,
  esquemas.
- **`apps/server`:** Vitest.
  - Unitarias: huella, detección de movimientos, valores faltantes, listas de carpeta.
  - Integración: API con `fastify.inject`, carpeta temporal con archivos de audio de
    prueba de menos de 1 s generados en los fixtures, base SQLite temporal. Incluye
    auth (localhost vs red), `Range`, `ETag`/`304`, vinculación.
- **`apps/web`:** Vitest + Testing Library en editor de listas y ajustes de carpetas.
- **`apps/mobile`:** Jest para la lógica (gestor de descargas con red simulada,
  restauración de estado). Reproductor y descargas reales: lista de verificación
  manual en el dispositivo.
- **CI (GitHub Actions):** lint, typecheck y tests en cada push.

## 11. Etapas de implementación

El proyecto es grande, así que se implementa en etapas; cada una tiene su propio plan y
termina con algo que funciona y se puede probar.

1. **Base y servidor:** monorepo, `shared`, servidor completo (escaneo, vigilante,
   biblioteca, listas, API, vinculación, mDNS), CI.
2. **Web de gestión.**
3. **App móvil — sincronización:** vinculación, catálogo, pantalla de descargas,
   gestor de descargas, biblioteca offline.
4. **App móvil — reproductor.**
5. **Empaquetado:** ejecutable para Windows (Node SEA), `Dockerfile` opcional para
   Linux, README de instalación.
