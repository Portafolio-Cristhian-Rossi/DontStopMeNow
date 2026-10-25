# Rediseño de la app Android, fase D — Biblioteca, Álbum y Listas: plan de implementación

**Goal:** Las pantallas de escuchar del diseño: Biblioteca (álbumes en grilla, artistas y canciones, con
búsqueda), Álbum y Listas con **Favoritas** primero, y un menú propio para cada canción (en lugar del
`Alert` de Android).

**Diseño de referencia:** lienzo, página **App Android**, artboards "2 · Biblioteca sin conexión", "3 · Álbum"
y "7 · Listas y Favoritas".

**Architecture:**

- **`libraryView`** suma `favorites`: las canciones descargadas marcadas con el corazón (el catálogo ya trae
  `favoritedAt` desde la fase 3 de la web), la última marcada primero y una sola vez por huella. Con tests.
- **`TrackActions`** (hoja que sube desde abajo, `Modal`): Reproducir a continuación, Agregar a la cola e Ir
  al álbum (no aparece dentro del mismo álbum). Se abre con el botón "⋯" de cada fila o manteniendo apretada
  la fila. "Agregar a una lista" llega en la fase F, cuando el celular pueda editar listas.
- **`TrackRow`** nuevo: número, portada chica o ecualizador si suena; título y artista; corazón si es
  favorita (solo para mirar hasta la fase F); botón "⋯".
- **Biblioteca** (`app/(tabs)/index.tsx`): encabezado propio (título grande + "N álbumes · M canciones · se
  escuchan sin conexión"), búsqueda con botón para borrar, pestañas Álbumes / Artistas / Canciones, grilla de
  álbumes de 2 columnas, artistas con iniciales (tocar filtra los álbumes) y estado vacío con "Ir a Descargas".
- **Álbum** (`app/album/[id].tsx`): portada grande, "Álbum", título, detalles, Reproducir / Aleatorio y las
  canciones.
- **Listas** (`app/(tabs)/listas.tsx`): tarjeta **Favoritas** (corazón, cantidad) y "Tus listas"; la
  pantalla de una lista (`app/lista/[id].tsx`) también muestra Favoritas con el id `favoritas`.

## Global Constraints

- Sin dependencias nuevas; reglas de interfaz de la fase A.
- Solo lo descargado (la Biblioteca del celular es para escuchar sin conexión).
- Las pestañas Biblioteca y Listas usan encabezado propio (sin el nativo); Descargas y Ajustes se rediseñan en
  la fase E.

## Review Focus

1. **Favoritas sin conexión:** si una favorita no está descargada, no aparece (y la cantidad lo refleja).
2. **Búsqueda:** sin tildes ni mayúsculas (`searchKey` de `@dsmn/shared`, como hoy).
3. **Listas largas:** las filas siguen en `FlatList` y la grilla de álbumes también.

---

## Estructura de archivos

```
apps/mobile/src/core/library.ts             (modificar) favorites
apps/mobile/test/library.test.ts            (modificar) tests
apps/mobile/src/components/TrackActions.tsx (crear) menú de una canción
apps/mobile/src/components/TrackRow.tsx     (reescribir) fila nueva
apps/mobile/src/components/ScreenHeader.tsx (crear) título grande + subtítulo con el espacio de arriba
apps/mobile/app/(tabs)/_layout.tsx          (modificar) sin encabezado nativo en Biblioteca y Listas
apps/mobile/app/(tabs)/index.tsx            (reescribir) Biblioteca
apps/mobile/app/(tabs)/listas.tsx           (reescribir) Listas con Favoritas
apps/mobile/app/album/[id].tsx              (reescribir) Álbum
apps/mobile/app/lista/[id].tsx              (reescribir) Lista y Favoritas
```

## Tareas

- [ ] **Tarea 1:** `favorites` en `libraryView` con tests.
- [ ] **Tarea 2:** `TrackActions` y `TrackRow`.
- [ ] **Tarea 3:** Biblioteca y Álbum.
- [ ] **Tarea 4:** Listas y la pantalla de lista.
- [ ] **Tarea 5:** `npm test`, typecheck, lint, Prettier, armado de Android y prueba en el celular.

## Fuera de esta fase

Marcar favoritas, crear listas y agregar canciones a listas desde el celular (fase F); Descargas y Ajustes
(fase E).

## Commit sugerido

`feat(mobile): biblioteca, álbum y listas con favoritas y menú por canción`
