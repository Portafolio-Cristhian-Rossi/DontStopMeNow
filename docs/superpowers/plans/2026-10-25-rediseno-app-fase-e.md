# Rediseño de la app Android, fase E — Descargas y carpeta en la tarjeta SD: plan de implementación

**Goal:** La pantalla Descargas del diseño (estado del servidor, qué bajar, sincronizar con progreso) y poder
elegir **dónde se guarda la música**: la memoria del celular (como hasta ahora) o una carpeta elegida, por
ejemplo en la tarjeta SD, con la opción de mover ahí lo que ya está bajado.

**Diseño de referencia:** lienzo, página **App Android**, artboard "4 · Descargas".

**Lo que confirmó la prueba en el celular:** con el selector de carpetas de Android (`Directory.pickDirectoryAsync`
de expo-file-system, sin recompilar) se puede elegir una carpeta de la SD, escribir en ella, reproducir desde
ahí, y Android recuerda el permiso al volver a abrir la app.

**Architecture:**

- **Archivos (`FileStore`):** las descargas se siguen bajando a la memoria interna (ahí se pueden retomar a la
  mitad y verificar con la huella) y, ya verificadas, `place(temp, track)` las deja en el destino:
  - memoria del celular: se mueven a `music/<id>.<ext>` (como hoy);
  - carpeta elegida: se crea `Título - Artista.<ext>` (nombre legible, porque otros reproductores y el
    explorador de archivos la ven) y se copia por partes de 1 MB; después se borra el temporal. Se guarda la
    dirección `content://` que devuelve Android. Se crea con tipo genérico (`application/octet-stream`) para que
    Android no le agregue una segunda extensión.
  - si no se puede guardar en la carpeta (se llenó, se sacó la tarjeta, se perdió el permiso) la
    sincronización se corta con `TargetWriteError` y un aviso claro, sin dejar temporales.
  - `freeBytes()` devuelve `null` cuando el destino es una carpeta elegida (Android no informa el espacio
    libre de esas carpetas): la sincronización solo comprueba que entre la canción más grande en la memoria
    interna, que es lo que usa el temporal.
- **Ajuste guardado:** tabla `settings` en la base local (`musicFolder` = URI de la carpeta, o nada).
- **Mover lo descargado:** `relocateDownloads()` pasa cada canción que no está en el destino actual (copiar,
  comprobar tamaño, borrar el original, actualizar la ruta en la base), con progreso y se puede cortar.
- **Pantalla Descargas** (`app/(tabs)/descargas.tsx`): encabezado propio, tarjeta de estado del servidor
  (conectado con la dirección y última sincronización / no lo encuentra con "Buscar de nuevo" / desvinculado
  con "Volver a vincular"), pestañas Álbumes y Listas con la cantidad, búsqueda, filas con casilla, portada y
  tamaño, y abajo una barra fija con el resumen ("N canciones · X MB marcadas") y **Sincronizar**, o el
  progreso mientras baja. Al final de la lista: **Dónde se guarda** (memoria / carpeta, Cambiar, Volver a la
  memoria del celular, Mover lo descargado) y lo que hay en el celular (dato que salió de la Biblioteca).

## Global Constraints

- Sin dependencias nativas nuevas.
- Lo que ya está bajado sigue funcionando en su lugar actual aunque se cambie el destino (las rutas están
  guardadas); solo se mueve si se toca **Mover lo descargado**.
- Si Android revoca el permiso de la carpeta, la sincronización falla con un mensaje claro y se puede elegir de
  nuevo o volver a la memoria.
- Reglas de interfaz de la fase A.

## Review Focus

1. **Copia a la SD a medias** (se corta o se llena la tarjeta): el archivo incompleto se borra y la canción
   queda como no bajada (o en su lugar anterior, si se estaba moviendo).
2. **Nombres repetidos** en la carpeta: Android agrega " (1)"; se usa la URI que devuelve, no el nombre.
3. **Espacio:** con carpeta elegida no se bloquea por la memoria interna llena de cosas ajenas, salvo que no
   entre ni la canción más grande.
4. **Tests** del motor de sincronización con un `FileStore` en memoria que simula los dos destinos.

---

## Estructura de archivos

```
apps/mobile/src/core/types.ts              (modificar) FileStore.place, freeBytes nullable
apps/mobile/src/core/store.ts              (modificar) settings + updateDownloadPath
apps/mobile/src/core/syncEngine.ts         (modificar) usa place; chequeo de espacio
apps/mobile/src/core/relocate.ts           (crear) mover lo descargado al destino actual
apps/mobile/src/native/fileStore.ts        (modificar) destino interno o carpeta elegida
apps/mobile/src/state/AppContext.tsx       (modificar) carpeta, elegir, mover
apps/mobile/app/(tabs)/descargas.tsx       (reescribir) pantalla del diseño
apps/mobile/app/(tabs)/_layout.tsx         (modificar) Descargas sin encabezado nativo
apps/mobile/test/helpers.ts                (modificar) memoryFiles con destino
apps/mobile/test/syncEngine.test.ts        (modificar) tests
apps/mobile/test/relocate.test.ts          (crear)
apps/mobile/test/fileNames.test.ts         (crear) nombres legibles y nombre de la carpeta
apps/mobile/src/core/fileNames.ts          (crear) readableName, folderLabel
apps/mobile/src/core/player/controller.ts  (modificar) replaceSources tras mover
apps/mobile/src/state/PlayerContext.tsx    (modificar) detecta canciones movidas
```

## Tareas

- [x] **Tarea 1 — Lógica:** `place`, `settings`, chequeo de espacio, `relocateDownloads`; tests.
- [x] **Tarea 2 — Nativo:** destino carpeta con copia por partes; elegir carpeta; volver a la memoria.
- [x] **Tarea 3 — Pantalla Descargas** con estado del servidor, filas, barra de sincronizar y Dónde se
      guarda.
- [ ] **Tarea 4 — Verificación:** tests, typecheck, lint, armado de Android; en el celular: elegir la carpeta
      de la SD, sincronizar un álbum (queda en la SD con nombres legibles y suena), mover lo descargado, volver
      a la memoria, y la app sigue andando después de reiniciarla.

## Fuera de esta fase

Bajar Favoritas como selección (el servidor todavía no la ofrece como lista; fase F); mostrar el espacio libre
de la tarjeta SD.

## Commit sugerido

`feat(mobile): descargas rediseñadas y música guardada en una carpeta elegida (tarjeta SD)`
