# Rediseño de la app Android, fase F — Favoritas y listas desde el celular: plan de implementación

**Goal:** Marcar favoritas, crear listas y agregar o quitar canciones desde el celular, también sin conexión: los
cambios se ven al instante en la app y se mandan a la compu en cuanto la encuentra (y la web los muestra solos).

**Diseño de referencia:** lienzo, página **App Android**: corazón del reproductor (artboard "2 · Reproductor"),
menú de canción y pantalla de lista (artboard "3 · Listas").

**Architecture:**

- **Servidor — rutas para el celular** (`access: 'device'`, mismo token que el catálogo), en `deviceRoutes.ts`,
  reutilizando `favorites.ts` y `playlists.ts`:
  - `PUT /api/favorites/:id` y `DELETE /api/favorites/:id`.
  - `POST /api/playlists` `{ id, name, trackIds }`: solo listas manuales. **El id lo genera el celular**
    (UUID), así una lista creada sin conexión ya tiene su id definitivo y un reintento no la duplica (si ya existe
    con ese id, responde la existente).
  - `PATCH /api/playlists/:id` `{ name }` (renombrar), `DELETE /api/playlists/:id`.
  - `POST /api/playlists/:id/tracks` `{ trackIds }` agrega al final las que no estén;
    `DELETE /api/playlists/:id/tracks/:trackId` saca una. Son **operaciones**, no "reemplazar la lista entera":
    si en la web agregaste otra canción mientras el celular estaba afuera, no se pisa.
  - Todas son idempotentes (repetirlas no cambia nada) y suben la revisión solo si algo cambió. Las listas de
    carpeta no se editan desde el celular (409).
- **Celular — cambios pendientes:** tabla `pending_changes` en la base local (orden de llegada, JSON del cambio).
  - `applyPending(catalog, changes)` (función pura en `src/core/pending.ts`): el catálogo que ve la app es el
    guardado con los cambios pendientes aplicados encima, así el corazón o la lista nueva aparecen al instante.
  - `flushPending(client, store)`: manda los cambios en orden. Si uno responde 404 (la canción o la lista ya no
    existe en la compu) se descarta; si no hay conexión, se frena y quedan para la próxima. Corre al principio de
    cada sincronización (antes de pedir el catálogo, así el catálogo nuevo ya los trae) y, si la compu está a
    mano, enseguida después de cada cambio.
  - Cambios redundantes se compactan (marcar y desmarcar la misma favorita se anulan).
- **Interfaz:**
  - **Corazón** en el reproductor (hoy solo muestra) y "Agregar a / Quitar de Favoritas" en el menú de canción.
  - **Agregar a lista…** en el menú de canción: hoja con las listas manuales y "Nueva lista".
  - **Listas:** botón "Nueva lista" (nombre); en una lista manual, menú con Renombrar y Borrar (con
    confirmación) y "Quitar de esta lista" en el menú de cada canción.
  - Una lista creada en el celular queda **marcada para bajar**, así sus canciones no se borran al desmarcar el
    álbum de donde salieron.
  - En la tarjeta del servidor de Descargas: "N cambios sin enviar" cuando hay pendientes.
- **(Opcional, a confirmar) Favoritas para bajar:** nueva selección `{ kind: 'favorites' }` en `syncPlan`
  (shared): todas las favoritas quedan en el celular. Aparece como fila fija arriba en Descargas.

## Global Constraints

- Sin dependencias nativas nuevas; sin migración de la base del servidor (las tablas ya existen).
- La web no cambia (ya escucha la revisión por SSE).
- Un cambio hecho sin conexión nunca se pierde por cerrar la app; uno que el servidor rechaza por datos que ya
  no existen se descarta sin trabar los demás.
- Reglas de interfaz de la fase A.

## Review Focus

1. **Orden e idempotencia:** crear lista → agregar canciones → renombrar, todo sin conexión, llega igual; un
   reintento tras una respuesta perdida no duplica nada.
2. **Conflictos con la web:** agregar desde el celular y desde la web a la misma lista conserva las dos.
3. **Revocado** (401) a mitad del envío: se frena y los pendientes quedan.
4. Tests del servidor (rutas nuevas) y del celular (`applyPending`, `flushPending`, compactación).

---

## Estructura de archivos

```
packages/shared/src/schemas.ts               (modificar) requests de las rutas del celular
apps/server/src/library/playlists.ts         (modificar) addTracks, removeTrack, create con id
apps/server/src/http/deviceRoutes.ts         (modificar) rutas nuevas
apps/server/test/deviceEdits.test.ts         (crear)
apps/mobile/src/core/pending.ts              (crear) tipos, applyPending, compactar, flushPending
apps/mobile/src/core/store.ts                (modificar) pending_changes
apps/mobile/src/core/http.ts                 (modificar) cliente: favoritas y listas
apps/mobile/src/core/syncEngine.ts           (modificar) envía pendientes antes del catálogo
apps/mobile/src/state/AppContext.tsx         (modificar) catálogo con pendientes, acciones
apps/mobile/src/components/TrackActions.tsx  (modificar) favorita, agregar a lista, quitar de lista
apps/mobile/src/components/AddToList.tsx     (crear) hoja de listas + nueva lista
apps/mobile/src/components/NameDialog.tsx    (crear) nombre de lista nueva / renombrar
apps/mobile/app/reproductor.tsx              (modificar) corazón tocable
apps/mobile/app/(tabs)/listas.tsx            (modificar) Nueva lista
apps/mobile/app/lista/[id].tsx               (modificar) renombrar, borrar, quitar canción
apps/mobile/app/(tabs)/descargas.tsx         (modificar) cambios sin enviar
apps/mobile/test/pending.test.ts             (crear)
```

## Tareas

- [x] **Tarea 1 — Servidor:** rutas del celular, listas con id del cliente, agregar/quitar canciones; tests.
- [x] **Tarea 2 — Celular, lógica:** pendientes, `applyPending`, compactación, `flushPending`, envío al
      sincronizar; tests.
- [x] **Tarea 3 — Celular, interfaz:** corazón, menú de canción, agregar a lista, nueva lista, renombrar y
      borrar, quitar de la lista, aviso de cambios sin enviar.
- [x] **Tarea 4 (opcional) — Favoritas para bajar.**
- [ ] **Tarea 5 — Verificación:** tests, typecheck, lint, armado de Android; en el celular: favorita y lista nueva
      con la compu prendida (aparecen en la web al toque) y en modo avión (llegan al volver).

## Fuera de esta fase

Reordenar canciones de una lista desde el celular; editar listas de carpeta; crear listas de carpeta.

## Commit sugerido

`feat: favoritas y listas editables desde el celular, también sin conexión`
