# Rediseño web, fase 2 — Escuchar música en la web: plan de implementación

**Goal:** Que la web de gestión también reproduzca: barra de reproducción abajo en todas las páginas,
pantalla "Reproduciendo" con la portada como disco animado y la cola a la derecha, y botones de
reproducir en álbumes, canciones y listas.

**Diseño de referencia:** lienzo "DontStopMeNow — rediseño web", artboards Reproduciendo y la barra de abajo
de los demás. El disco: en pausa queda quieto; sonando, quieto ~3 s, dos vueltas rápidas en ~2 s y repite.

**Architecture:** El servidor no cambia: ya sirve cada archivo en `/api/tracks/:id/file` con rangos (para
adelantar) y la compu no necesita token. La lógica de cola del celular
(`apps/mobile/src/core/player/queue.ts`, funciones puras) pasa a `@dsmn/shared` para que la usen la app y la
web, y se le suman reordenar, quitar y limpiar. En la web, un `Player` (clase sin React, testeable con un
`<audio>` falso) maneja el audio, la cola, el volumen, la velocidad, el temporizador, la Media Session
(teclas multimedia y controles del sistema) y guarda el estado en `localStorage`. React lo lee con
`useSyncExternalStore` desde un `PlayerProvider`.

**Tech Stack:** el de la fase 1; `HTMLAudioElement`, Media Session API, dnd-kit (ya instalado) para reordenar
la cola.

## Global Constraints

- Mismas reglas que la fase 1 (español rioplatense, CSS propio, un solo `<nav>`, 44 px, contraste 4.5:1).
- El `Player` no importa React ni toca el DOM salvo el `<audio>` y `navigator.mediaSession` que recibe:
  así se prueba con dobles.
- Las canciones no disponibles (`available: false`) no entran a la cola.
- La animación del disco respeta `prefers-reduced-motion` (queda quieto).
- Recargar la página recupera la cola, la canción y el segundo, **en pausa** (el navegador no deja arrancar
  audio sin un clic).

## Review Focus

1. **Fin de la cola:** sin repetir, al terminar la última canción queda en pausa al principio de esa canción;
   con "repetir todo" vuelve a la primera; con "repetir una" repite la misma.
2. **Anterior:** pasados 3 s vuelve al principio de la canción actual; antes, va a la anterior.
3. **Cola y aleatorio:** quitar o mover canciones con el aleatorio prendido y después apagarlo no pierde ni
   duplica canciones; tests en la tarea 1.
4. **Catálogo que cambia:** si una canción de la cola se borra de la biblioteca, sale de la cola; si era la
   que sonaba, pasa a la siguiente sin romperse (usa `removeMissing`).
5. **Temporizador:** "Al terminar la canción" pausa en el `ended` en lugar de avanzar; los minutos pausan
   al vencer aunque la página esté en otra ruta.

---

## Estructura de archivos

```
packages/shared/src/queue.ts               (mover desde apps/mobile/src/core/player/queue.ts + 3 funciones)
packages/shared/src/index.ts               (modificar) exporta queue
packages/shared/test/queue.test.ts         (mover desde apps/mobile/test/queue.test.ts + tests nuevos)
apps/mobile/src/core/player/controller.ts  (modificar) importa la cola de @dsmn/shared
apps/mobile/src/core/store.ts              (modificar) ídem
apps/web/src/player/player.ts              (crear) Player: audio, cola, ajustes, persistencia, Media Session
apps/web/src/player/PlayerContext.tsx      (crear) PlayerProvider + usePlayer
apps/web/src/player/Disc.tsx               (crear) portada recortada como disco
apps/web/src/player/PlayerBar.tsx          (crear) barra de abajo
apps/web/src/player/QueuePanel.tsx         (crear) pestañas Cola / Ajustes
apps/web/src/pages/NowPlayingPage.tsx      (crear) /reproduciendo
apps/web/src/App.tsx                       (modificar) ruta /reproduciendo
apps/web/src/main.tsx                      (modificar) PlayerProvider
apps/web/src/components/Layout.tsx         (modificar) barra de reproducción
apps/web/src/components/Icon.tsx           (modificar) íconos del reproductor
apps/web/src/components/TrackTable.tsx     (modificar) botón reproducir por fila + canción actual
apps/web/src/pages/AlbumPage.tsx           (modificar) Reproducir / Aleatorio
apps/web/src/pages/AlbumsPage.tsx          (modificar) play sobre la portada
apps/web/src/pages/SongsPage.tsx           (modificar) reproducir desde la búsqueda
apps/web/src/pages/PlaylistPage.tsx        (modificar) Reproducir / Aleatorio + play por fila
apps/web/src/styles.css                    (modificar) barra, disco, panel
apps/web/test/player.test.ts               (crear)
apps/web/test/playback.test.tsx            (crear)
```

## Tareas

### Tarea 1 — Cola compartida

- [ ] Mover `queue.ts` y su test a `packages/shared`; la app importa de `@dsmn/shared`. Los tests del celular
      siguen pasando.
- [ ] Agregar `removeAt(q, index)`, `moveItem(q, from, to)` y `clearUpcoming(q)`, que mantienen `index`
      apuntando a la misma canción, ajustan `nextCount` y mantienen `original` coherente para apagar el
      aleatorio. Tests de cada una, con y sin aleatorio.

### Tarea 2 — Player

- [ ] `Player` con `subscribe`/`getSnapshot` (cola, canción, sonando, posición, duración, volumen, velocidad,
      temporizador) y las acciones `playList`, `toggle`, `next`, `previous`, `seek`, `jumpTo`, `setShuffle`,
      `setRepeat`, `playNext`, `addToQueue`, `removeAt`, `move`, `clearUpcoming`, `setVolume`, `setRate`,
      `setSleep`, `syncCatalog`.
- [ ] Persistencia en `localStorage` (`dsmn.player`) al pausar, al cambiar de canción o de ajustes y cada
      5 s sonando; al arrancar se restaura en pausa. Errores de `localStorage` se ignoran.
- [ ] Media Session: título, artista, álbum, portada y acciones (play, pausa, anterior, siguiente, ir a).
- [ ] Tests con un `<audio>` falso: avanza al terminar, repetir una/todo, fin de la cola, anterior,
      temporizador al terminar la canción y por minutos, restaurar en pausa, catálogo que borra la actual.

### Tarea 3 — Barra y pantalla Reproduciendo

- [ ] `PlayerBar`: disco chico, título y artista (link a /reproduciendo), anterior, play/pausa, siguiente,
      aleatorio, repetir, progreso que se puede arrastrar, volumen y botón a la cola. Solo aparece con algo
      en la cola.
- [ ] `/reproduciendo`: disco grande (`Disc`), título, artista y álbum, progreso, controles grandes, volumen;
      a la derecha `QueuePanel` con pestañas **Cola** (sonando, a continuación reordenable, quitar, limpiar,
      clic para saltar) y **Ajustes** (repetir, aleatorio, velocidad 0.75×–1.5×, temporizador: apagado,
      15 min, 30 min, 1 h, al terminar la canción).

### Tarea 4 — Reproducir desde las páginas

- [ ] Álbum y lista: botones **Reproducir** y **Aleatorio**; cada fila de canción con botón de reproducir
      (empieza la cola desde esa canción) y la que suena resaltada.
- [ ] Canciones: reproducir una fila arma la cola con el resultado de la búsqueda.
- [ ] Álbumes: botón de play sobre la portada al pasar el mouse.

### Tarea 5 — Verificación

- [ ] `npm test`, typecheck, lint y Prettier.
- [ ] En el navegador: reproducir un álbum, saltar, adelantar, repetir, aleatorio, reordenar la cola,
      recargar y ver que vuelve en pausa en el mismo segundo, teclas multimedia.

## Fuera de esta fase

Fundido entre canciones y normalizar volumen (necesitan procesar el audio); favoritas (fase 3);
"Agregar a la cola" y "Reproducir a continuación" desde los menús de cada canción (fase 4; el `Player` ya
los trae); sincronizar la cola de la web con el celular.

## Commit sugerido

`feat(web): reproducción con barra, pantalla reproduciendo y cola compartida con la app`
