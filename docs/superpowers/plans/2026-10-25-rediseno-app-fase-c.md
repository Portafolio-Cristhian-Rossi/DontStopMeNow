# Rediseño de la app Android, fase C — Reproductor: plan de implementación

**Goal:** El reproductor del diseño: pantalla completa con la portada como disco (quieto ~3 s, dos vueltas,
quieto en pausa), controles grandes y corazón a la vista, y una hoja que sube desde abajo con dos pestañas,
**Cola** (lo que sigue, reordenar, quitar, limpiar, saltar) y **Ajustes** (repetir, aleatorio, velocidad y
temporizador para dormir).

**Diseño de referencia:** lienzo, página **App Android**, artboards "5 · Reproductor" y "6 · Cola y ajustes".

**Architecture:**

- **`PlayerController`** (lógica pura, con tests sobre el motor falso) suma:
  - `setRate(rate)` → `PlayerEngine.setRate` (el `AudioPlaylist` de expo-audio ya tiene `playbackRate`); la
    velocidad se guarda con el estado para retomarla.
  - `setSleep(off | 15/30/60 min | al terminar la canción)`: los minutos con un temporizador que pausa; "al
    terminar la canción" pausa cuando el motor pasa solo a la siguiente (no cuando la persona toca
    siguiente/anterior o elige otra).
  - `removeAt`, `move` y `clearUpcoming` sobre lo que viene después de la actual (la cola compartida de
    `@dsmn/shared` + `remove`/`insert` del motor, que mantiene el mismo orden e índices).
  - El snapshot suma `rate` y `sleep`.
- **Pantalla `app/reproductor.tsx`** (modal sin encabezado nativo): cerrar (chevron), "Sonando desde" + álbum,
  `Disc` de 300 dp, título en dos líneas, artista, progreso con `Slider`, aleatorio / anterior / play grande /
  siguiente / repetir, y abajo la fila "Cola · a continuación" que abre la hoja.
- **Hoja `src/components/QueueSheet.tsx`:** `Modal` de React Native que sube desde abajo, con pestañas Cola y
  Ajustes. Reordenar con `PanResponder` desde la manija (sin dependencias nuevas): mantener apretada la manija
  y arrastrar; también hay "Subir"/"Bajar" accesibles para lector de pantalla.
- El corazón queda **solo para mirar** (favorita o no, según el catálogo): marcar desde el celular es la
  fase F.

## Global Constraints

- Sin dependencias nativas nuevas.
- El disco y la hoja respetan "reducir movimiento" (sin animaciones de entrada).
- La canción que suena no se puede quitar desde la cola (se cambia con siguiente).
- Reglas de interfaz de la fase A.

## Review Focus

1. **Temporizador "al terminar la canción":** pausa en el cambio automático, no en uno manual; tests.
2. **Mover y quitar** dejan la cola del controlador igual a la del motor (mismo orden de `remove`/`insert`);
   tests con el motor falso.
3. **Velocidad al cambiar de cola:** una cola nueva (otro álbum) sigue a la velocidad elegida.
4. **Temporizador con la pantalla apagada:** el temporizador de JavaScript sigue corriendo porque el audio
   en segundo plano mantiene viva la app; se verifica en el celular.

---

## Estructura de archivos

```
apps/mobile/src/core/types.ts               (modificar) PlayerEngine.setRate
apps/mobile/src/core/store.ts               (modificar) SavedPlayerState.rate (opcional)
apps/mobile/src/core/player/controller.ts   (modificar) rate, sleep, removeAt, move, clearUpcoming
apps/mobile/src/native/player.ts            (modificar) setRate
apps/mobile/test/player.test.ts             (modificar) tests nuevos
apps/mobile/src/components/QueueSheet.tsx   (crear) hoja de cola y ajustes
apps/mobile/app/reproductor.tsx             (reescribir) pantalla del diseño
apps/mobile/app/_layout.tsx                 (modificar) reproductor sin encabezado nativo
```

## Tareas

- [ ] **Tarea 1 — Controlador:** velocidad, temporizador y edición de la cola, con tests.
- [ ] **Tarea 2 — Pantalla Reproductor** con el disco.
- [ ] **Tarea 3 — Hoja de cola y ajustes.**
- [ ] **Tarea 4 — Verificación:** `npm test`, typecheck, lint, Prettier, armado de Android; en el celular:
      el disco, saltar desde la cola, reordenar, quitar, limpiar, velocidad, temporizador de 15 min (o uno
      corto para probar) y "al terminar la canción".

## Fuera de esta fase

Marcar favoritas desde el celular (fase F); fundido entre canciones y normalizar volumen; "Agregar a lista"
desde el reproductor (fase F, junto con listas editables).

## Commit sugerido

`feat(mobile): reproductor con disco, cola editable y ajustes de velocidad y temporizador`
