# Rediseño de la app Android, fase B — Vincular y el escáner QR: plan de implementación

**Goal:** Que vincular el celular sea fácil y que cada problema se explique solo: la pantalla Vincular del
diseño (cámara con marco, linterna, mensajes por caso, compus encontradas en el WiFi y formulario a mano) y el
arreglo de por qué fallaba el QR.

**Diseño de referencia:** lienzo, página **App Android**, artboard "1 · Vincular".

**Lo que se averiguó del escáner:** la cámara ya lee el QR (desde que la web le puso margen de 4 módulos). Lo
que fallaba era el canje del código: el servidor guarda los códigos solo en memoria y la web no pedía uno nuevo
cuando el servidor se reiniciaba, así que mostraba un QR que el servidor ya no conocía ("Código inválido o
vencido").

**Architecture:**

- **Web:** `useServerEvents` escucha `open` del `EventSource`; si se vuelve a abrir (el servidor se reinició o
  se cortó la conexión), invalida los datos, incluido el código de vinculación, y la página Dispositivos muestra
  uno nuevo.
- **App, lógica (`src/core/pairing.ts`):** `describePairingError` traduce cada falla a un mensaje del diseño:
  QR de otra app, código vencido o ya usado, la compu no responde (con la dirección que se probó), y otros
  errores con el texto del servidor. Pura y con tests.
- **App, pantalla (`app/vincular.tsx`):** sin encabezado nativo (es la primera pantalla), cámara de 312 dp con
  marco y línea de barrido animada (quieta con "reducir movimiento"), botón de linterna, estados de permiso
  (pedir permiso o abrir los ajustes de Android si se negó para siempre), tarjeta de estado que anuncia los
  cambios al lector de pantalla, lista "En tu WiFi" con "Usar" (completa la dirección) y "Buscar de nuevo", y
  formulario a mano con validación (la dirección no vacía y el código de 6 letras o números, que se pasa a
  mayúsculas solo).
- Se sacan los `console.log` temporales del escáner.

## Global Constraints

- Sin dependencias nativas nuevas (la linterna es `enableTorch` de `CameraView`, que ya está).
- El nombre del celular que ve la web sigue siendo el modelo (`Device.modelName`); el campo para cambiarlo sale
  de esta pantalla (el diseño no lo tiene).
- Reglas de interfaz de la fase A (tema, 44 dp, español rioplatense).

## Review Focus

1. **Un QR fallido no se reintenta en bucle** (la cámara lo lee varias veces por segundo): solo vuelve a
   probar con "Reintentar" o con otro QR.
2. **Permiso negado para siempre:** el botón lleva a los ajustes de Android en vez de volver a pedir.
3. **Web después de reiniciar el servidor:** el QR cambia solo, sin recargar la página; test con el
   `EventSource` falso.

---

## Estructura de archivos

```
apps/web/src/api/events.ts               (modificar) al reconectar invalida los datos y el código
apps/web/src/api/queries.ts              (modificar) clave pairingCode
apps/web/src/pages/DevicesPage.tsx       (modificar) usa la clave compartida
apps/web/test/devices.test.tsx           (modificar) test de reconexión
apps/mobile/src/core/pairing.ts          (modificar) describePairingError
apps/mobile/test/pairing.test.ts         (modificar) tests de los mensajes
apps/mobile/src/components/ScanFrame.tsx (crear) marco y línea de barrido sobre la cámara
apps/mobile/app/vincular.tsx             (reescribir) la pantalla del diseño
apps/mobile/app/_layout.tsx              (modificar) Vincular sin encabezado nativo
```

## Tareas

- [ ] **Tarea 1 — Web:** reconexión → nuevo código; test.
- [ ] **Tarea 2 — Lógica de la app:** `describePairingError` con sus tests.
- [ ] **Tarea 3 — Pantalla:** cámara, marco, linterna, permisos, estado, En tu WiFi, a mano.
- [ ] **Tarea 4 — Verificación:** `npm test`, typecheck, lint, Prettier; en el celular: escanear, QR de otra
      app, código vencido (reiniciar el servidor sin recargar la web ya no debería fallar), vincular a mano y
      desde "En tu WiFi". Para probar sin perder lo bajado, se usa "Desvincular" y se vuelve a vincular.

## Fuera de esta fase

Que el servidor guarde los códigos en la base (no hace falta con el refresco de la web); escanear desde la
galería; vincular desde la app de cámara del sistema.

## Commit sugerido

`feat: pantalla vincular nueva y código de vinculación que se renueva al reiniciar el servidor`
