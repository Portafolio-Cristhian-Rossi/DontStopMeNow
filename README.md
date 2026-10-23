# DontStopMeNow

Tu propio ecosistema de música: un servidor en la compu que organiza tu biblioteca a partir de la metadata
de los archivos, y una app Android (en desarrollo) que sincroniza los álbumes y listas que elijas para
escucharlos sin conexión.

## Cómo se usa

Requisitos: Node.js 22.22 o superior (recomendado: 24 LTS).

```bash
npm install
npm start
```

`npm start` compila la interfaz web y arranca el servidor. Abrí **http://localhost:4747** en el navegador
de la misma compu:

1. **Ajustes:** agregá tu carpeta de música (por ejemplo `D:\Música`) con "Examinar…" o pegando la ruta. El
   servidor la escanea y después vigila los cambios.
2. **Biblioteca:** álbumes, artistas y canciones armados desde la metadata.
3. **Listas:** listas manuales (agregás canciones desde la biblioteca) o de carpeta (todo lo que haya en
   una carpeta, se actualiza sola).
4. **Descargar:** bajá música de YouTube con [yt-dlp](https://github.com/yt-dlp/yt-dlp) y
   [ffmpeg](https://ffmpeg.org/) (instalalos aparte). Una vez:
   en **Ajustes → Descargas con yt-dlp** indicá dónde está `yt-dlp.exe` (si está en tu carpeta de música, ya
   aparece sugerido). Después, en **Descargar**: pegá el link de una playlist o un video, revisá la lista (las
   repetidas, las que ya tenés y los videos no disponibles vienen desmarcados; las versiones distintas se
   agrupan), elegí la carpeta y agregalo a la cola. Baja de a una canción en MP3 con metadata y portada, en
   `Carpeta\Playlist\NN - Título.mp3`, y crea una lista de carpeta con el nombre de la playlist. En "Tus
   playlists de YouTube", **Buscar nuevas** trae solo lo que se agregó después.
5. **Dispositivos:** el código QR para vincular el celular.

En Windows, la primera vez que arranca, aceptá el permiso de red para **redes privadas**.

## Estructura

| Carpeta            | Qué es                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| `packages/shared`  | Tipos, esquemas y lógica compartida                                         |
| `apps/server`      | Servidor (Node + Fastify + SQLite) — ver [su README](apps/server/README.md) |
| `apps/web`         | Interfaz de gestión (React)                                                 |
| `docs/superpowers` | Diseño y planes de implementación                                           |

## Desarrollo

```bash
npm start -w @dsmn/server      # servidor en :4747
npm run dev -w @dsmn/web       # web con recarga en caliente en :5173 (usa el servidor de :4747)
npm test                       # todos los tests
npm run lint && npm run typecheck && npm run format:check
```
