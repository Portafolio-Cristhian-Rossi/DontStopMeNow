# Rediseño web, fase 4 — Cola y listas desde cada canción: plan de implementación

**Goal:** Desde cualquier canción, sin salir de la página: **Reproducir a continuación**, **Agregar a la
cola**, **Agregar a lista…** e **Ir al álbum**. Y desde el reproductor, agregar a una lista la canción que
está sonando.

**Architecture:** Todo es web; el servidor y el `Player` no cambian (el `Player` ya tiene `playNext` y
`addToQueue` desde la fase 2, y la API de listas ya existe). Se suman:

- `TrackMenu`: botón "⋯" por fila que abre un menú (`role="menu"`) con las cuatro acciones. Se cierra con
  Escape, con un clic afuera o al elegir; al abrir, el foco va a la primera opción y las flechas recorren
  el menú.
- Un **pedido global** de "Agregar a lista" (`requestAddToPlaylist(trackIds)`) que atiende un
  `AddToPlaylistHost` en el `Layout`, para poder abrir el diálogo desde una fila, la barra o Reproduciendo
  sin meter un `<dialog>` dentro de la tabla. El diálogo existente pasa a verse como modal (centrado, con
  fondo oscuro) y el resultado se avisa con el `Toast` de la fase 3.

## Global Constraints

- Mismas reglas de interfaz que las fases anteriores (español rioplatense, 44 px, foco visible, contraste).
- Las columnas de las tablas no se reordenan: el menú va en una columna nueva al final, así la celda 1
  sigue siendo el título (lo usan los tests).
- Con la cola vacía, "Reproducir a continuación" y "Agregar a la cola" empiezan a sonar esa canción
  (comportamiento del `Player`).
- Una canción no disponible no se puede encolar (las opciones de cola quedan deshabilitadas).

## Review Focus

1. **Varios "a continuación" seguidos** quedan en el orden en que se eligieron (lo garantiza `playNext` de
   la cola compartida).
2. **Menú y teclado:** Escape devuelve el foco al botón "⋯"; Tab fuera del menú lo cierra.
3. **Menú en la última fila:** no queda cortado por el borde de la página (se abre hacia arriba si no
   entra abajo).

---

## Estructura de archivos

```
apps/web/src/components/TrackMenu.tsx            (crear) botón ⋯ + menú
apps/web/src/components/addToPlaylist.ts         (crear) requestAddToPlaylist + suscripción
apps/web/src/components/AddToPlaylistHost.tsx    (crear) abre el diálogo pedido desde cualquier lado
apps/web/src/components/AddToPlaylistDialog.tsx  (modificar) modal con fondo
apps/web/src/components/TrackTable.tsx           (modificar) columna del menú
apps/web/src/components/Layout.tsx               (modificar) AddToPlaylistHost
apps/web/src/components/Icon.tsx                 (modificar) íconos "más" y "lista"
apps/web/src/pages/PlaylistPage.tsx              (modificar) menú en las filas de listas manuales
apps/web/src/pages/NowPlayingPage.tsx            (modificar) "Agregar a lista" de la que suena
apps/web/src/styles.css                          (modificar) menú y modal
apps/web/test/trackMenu.test.tsx                 (crear)
```

## Tareas

### Tarea 1 — Menú de cada canción

- [ ] `TrackMenu` con: Reproducir a continuación, Agregar a la cola, Agregar a lista…, Ir al álbum (se oculta
      en la página de ese mismo álbum). Avisos: "Suena a continuación: X", "Agregada a la cola: X".
- [ ] Columna del menú en `TrackTable` y en las filas de las listas manuales.

### Tarea 2 — Agregar a lista desde cualquier lado

- [ ] `requestAddToPlaylist` + `AddToPlaylistHost` en el `Layout`; el diálogo como modal.
- [ ] Botón "Agregar a lista" en Reproduciendo, para la canción que suena.

### Tarea 3 — Verificación

- [ ] Tests: a continuación y a la cola aparecen en la cola de Reproduciendo en el orden correcto; agregar a
      lista desde el menú llama al servidor; Escape cierra el menú y devuelve el foco; Ir al álbum navega.
- [ ] `npm test`, typecheck, lint y Prettier; prueba en el navegador.

## Fuera de esta fase

Selección múltiple para encolar varias canciones; menú contextual con clic derecho; favoritas y listas en la
app Android.

## Commit sugerido

`feat(web): menú por canción para encolar, agregar a listas e ir al álbum`
