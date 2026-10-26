# Rediseño web, fase 3 — Favoritas: plan de implementación

**Goal:** Marcar canciones con un corazón desde la web y tener una lista **Favoritas** que se arma sola con
lo marcado, ordenada de la más reciente a la más vieja.

**Diseño de referencia:** lienzo "DontStopMeNow — rediseño web": corazón en cada fila de Álbum, en la barra y
en Reproduciendo; tarjeta y lista Favoritas en Listas.

**Architecture:** Las favoritas se guardan en el servidor, en una tabla nueva atada a la **huella** del
archivo (`fingerprint`), no al id: así sobreviven a mover, renombrar o borrar y volver a agregar el archivo.
El catálogo suma a cada canción `favoritedAt` (cuándo se marcó, o `null`). Marcar o desmarcar sube la
revisión de la biblioteca, así la web (y más adelante el celular) se enteran por el aviso de siempre.
La web cambia el corazón al instante (actualización optimista del catálogo en caché) y lo vuelve atrás si
el servidor falla.

**Tech Stack:** el de las fases anteriores (`node:sqlite`, Fastify, zod, TanStack Query).

## Global Constraints

- **Migración 3, solo agrega**: `CREATE TABLE favorites (fingerprint TEXT PRIMARY KEY, created_at INTEGER
NOT NULL)`. No toca ni borra datos existentes. Se aplica sola al arrancar el servidor (como las
  anteriores), así que **se muestra antes de arrancar el servidor real** con la base del usuario.
- `favoritedAt` es **opcional** en `TrackSchema`: la app Android instalada (que no lo conoce) sigue leyendo
  el catálogo sin problemas.
- Las rutas son de gestión (`/api/admin/...`, solo desde la compu). El celular las suma en otra fase.
- Mismas reglas de interfaz que las fases 1 y 2.

## Review Focus

1. **Duplicados:** dos archivos con la misma huella quedan los dos como favoritos (es la misma canción).
2. **Idempotencia:** marcar dos veces no falla ni cambia la fecha; desmarcar algo no marcado no falla.
3. **Canción desconocida:** 404 con el mensaje de siempre.
4. **Optimista:** si el servidor responde error, el corazón vuelve a como estaba y se muestra el error.
5. **Migración desde la versión 2:** la base existente queda en `user_version = 3` con sus datos intactos;
   test igual al de la migración 2.

---

## Estructura de archivos

```
packages/shared/src/schemas.ts               (modificar) Track.favoritedAt opcional
apps/server/src/db/schema.ts                 (modificar) migración 3
apps/server/src/library/favorites.ts         (crear) setFavorite
apps/server/src/library/catalog.ts           (modificar) favoritedAt en cada canción
apps/server/src/http/adminRoutes.ts          (modificar) PUT/DELETE /api/admin/favorites/:id
apps/server/test/db.test.ts                  (modificar) migración 3
apps/server/test/library/favorites.test.ts   (crear)
apps/server/test/http/admin.test.ts          (modificar) rutas
apps/web/src/api/client.ts                   (modificar) setFavorite
apps/web/src/api/favorites.ts                (crear) useToggleFavorite (optimista)
apps/web/src/components/HeartButton.tsx      (crear)
apps/web/src/components/TrackTable.tsx       (modificar) columna del corazón
apps/web/src/player/PlayerBar.tsx            (modificar) corazón
apps/web/src/pages/NowPlayingPage.tsx        (modificar) corazón
apps/web/src/pages/FavoritesPage.tsx         (crear) /listas/favoritas
apps/web/src/pages/PlaylistsPage.tsx         (modificar) tarjeta Favoritas
apps/web/src/App.tsx                         (modificar) ruta
apps/web/test/favorites.test.tsx             (crear)
```

## Tareas

### Tarea 1 — Servidor

- [ ] Migración 3 y su test (desde una base en versión 2 con datos).
- [ ] `setFavorite(db, bus, trackId, on)`: busca la huella de la canción (404 si no existe), inserta con
      `INSERT OR IGNORE` o borra, y sube la revisión solo si algo cambió.
- [ ] `buildCatalog` agrega `favoritedAt` a cada canción (cruce por huella).
- [ ] `PUT /api/admin/favorites/:id` y `DELETE /api/admin/favorites/:id` → 204. Tests de rutas: marcar,
      repetir, desmarcar, desconocida y que desde la red respondan 403.

### Tarea 2 — Web

- [ ] `api.setFavorite(id, on)` y `useToggleFavorite()`: cambia `favoritedAt` en el catálogo en caché al
      instante, llama al servidor y, si falla, lo deshace y devuelve el error.
- [ ] `HeartButton` (`aria-pressed`, "Agregar a favoritas" / "Quitar de favoritas").
- [ ] Corazón en las filas de canciones (columna nueva después del título), en la barra y en Reproduciendo.
- [ ] `/listas/favoritas`: encabezado, Reproducir / Aleatorio y la tabla de canciones marcadas (la más
      reciente primero); vacía, explica cómo marcar.
- [ ] Listas: tarjeta **Favoritas** primero, con la cantidad.
- [ ] Tests: marcar desde un álbum (llamada al servidor y corazón prendido), error que vuelve atrás y la
      página Favoritas.

### Tarea 3 — Verificación

- [ ] `npm test`, typecheck, lint y Prettier.
- [ ] Mostrar la migración, hacer copia de `library.db` y recién ahí arrancar el servidor real; probar en el
      navegador marcar, desmarcar, recargar y reproducir Favoritas.

## Fuera de esta fase

Favoritas en la app Android (bajarlas, marcarlas desde el celular); "Agregar a la cola" y listas desde el
reproductor (fase 4).

## Commit sugerido

`feat: favoritas con corazón en la web y lista favoritas`
