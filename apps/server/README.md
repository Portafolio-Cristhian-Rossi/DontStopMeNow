# Servidor de DontStopMeNow

Corre en la compu: indexa tu música a partir de la metadata, gestiona listas y le sirve el catálogo y los
archivos a la app del celular.

> Para **instalar** el servidor sin Node (ejecutable de Windows o Docker), mirá la sección
> [Instalación del README principal](../../README.md#instalación). Lo que sigue es para correrlo desde el código.

## Requisitos

- Node.js 22.22 o superior (recomendado: 24 LTS).

## Puesta en marcha

Desde la raíz del repo:

```bash
npm install
npm start -w @dsmn/server
```

Al arrancar muestra las direcciones de la red local por las que el celular puede conectarse.

### Variables de entorno

| Variable        | Por defecto                                                                   | Para qué                                                                                  |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DSMN_PORT`     | `4747`                                                                        | Puerto HTTP                                                                               |
| `DSMN_DATA_DIR` | `%APPDATA%\DontStopMeNow` en Windows, `~/.local/share/dontstopmenow` en Linux | Base de datos (`library.db`), caché de portadas y `yt-tmp/` (temporales de las descargas) |

## Agregar tu carpeta de música

Lo más simple es la interfaz web: abrí **http://localhost:4747/ajustes** y usá "Agregar carpeta". Si la web
no está compilada, el servidor te indica cómo hacerlo (`npm run build -w @dsmn/web`, o `npm start` desde la
raíz del repo, que compila y arranca todo).

También se puede hacer por la API, desde la misma compu:

```bash
# Windows (PowerShell)
Invoke-RestMethod -Method Post -Uri http://localhost:4747/api/admin/roots `
  -ContentType 'application/json; charset=utf-8' -Body '{"path":"D:\\Música"}'

# Linux / macOS
curl -X POST localhost:4747/api/admin/roots -H 'content-type: application/json' -d '{"path":"/home/yo/Música"}'
```

El servidor escanea la carpeta enseguida y después vigila los cambios (archivos nuevos, borrados o movidos).

Otras rutas útiles: `GET /api/catalog` (biblioteca completa), `GET /api/admin/issues` (archivos que no se
pudieron leer), `POST /api/admin/scan` (reescanear todo).

## Descargas desde YouTube

El servidor usa tu `yt-dlp` (la ruta se guarda desde la web, en Ajustes) y el `ffmpeg` del `PATH`. Baja de a una
canción, con 5 s de pausa entre canciones, y retoma lo pendiente al reiniciar. Cada canción se baja primero en
`<datos>/yt-tmp/` y solo el `.mp3` terminado llega a la carpeta de música. Si YouTube empieza a limitar (3 errores
429 seguidos), el trabajo se pausa solo.

Rutas (solo desde la compu):

| Ruta                                                           | Qué hace                                                |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| `GET/PUT /api/admin/ytdlp`, `POST /api/admin/ytdlp/update`     | Ruta y versión de yt-dlp, ffmpeg; `yt-dlp -U`           |
| `POST /api/admin/downloads/preview` `{ url }`                  | Lista los videos del link con los duplicados marcados   |
| `GET/POST /api/admin/downloads/jobs`                           | Cola; encolar las canciones elegidas                    |
| `POST /api/admin/downloads/jobs/:id/{cancel,resume,retry}`     | Cancelar, reanudar uno pausado, reintentar las fallidas |
| `DELETE /api/admin/downloads/jobs/:id`                         | Quitar de la cola (no borra archivos)                   |
| `GET /api/admin/downloads/sources`, `POST …/sources/:id/check` | Playlists guardadas; buscar lo nuevo                    |
| `DELETE /api/admin/downloads/sources/:id`                      | Olvidar una playlist (no borra archivos ni la lista)    |

El progreso llega en vivo por `GET /api/admin/events` (evento `download`).

## Firewall de Windows

La primera vez que arranca, Windows pregunta si permitís que Node acceda a la red. Aceptá para **redes
privadas**; si no, el celular no va a encontrar el servidor. Si lo rechazaste, habilitalo en
_Firewall de Windows Defender → Permitir una aplicación a través del firewall → Node.js_.

## Seguridad

- La interfaz web y las rutas de gestión (`/api/admin/*`) solo responden desde la propia compu, y solo si
  el navegador usa `localhost` / `127.0.0.1` (protege contra ataques de DNS rebinding).
- El celular se vincula con un código de un solo uso que vence a los 5 minutos y recibe un token propio, que
  se puede revocar.

## Desarrollo

```bash
npm run dev -w @dsmn/server   # reinicia al guardar
npm test                      # todos los tests del monorepo
npm run lint && npm run typecheck
```
