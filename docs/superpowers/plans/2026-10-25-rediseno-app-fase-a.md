# Rediseño de la app Android, fase A — Base visual: plan de implementación

**Goal:** Que la app tenga la misma cara que la web rediseñada: tema oscuro, tipografías, portadas de
respaldo iguales, cuatro pestañas (Biblioteca, Listas, Descargas, Ajustes) y el mini reproductor con el disco
chico. Las pantallas se rediseñan una por una en las fases B a E; esta fase deja todas legibles en oscuro.

**Diseño de referencia:** lienzo "DontStopMeNow — rediseño web", página **App Android**.

**Architecture:**

- `src/ui/theme.ts`: los tokens de la web (colores, radios, familias) en un solo lugar.
- `src/ui/Text.tsx` y `src/ui/TextInput.tsx`: reemplazan a los de React Native en las pantallas. Ponen el
  color y la tipografía por defecto y traducen `fontWeight` a la familia correcta (en Android una tipografía
  cargada con `expo-font` no cambia de peso con `fontWeight`: cada peso es otra familia).
- `src/ui/Button.tsx`: botón propio (primario, normal, peligro) en lugar del `Button` nativo, que en Android
  no se puede estilizar.
- Tipografías con `@expo-google-fonts/*` y `useFonts` (de `expo-font`, que ya está en la app): **no hace
  falta recompilar el APK de desarrollo**.
- Tema de navegación oscuro (`ThemeProvider` de React Navigation) para encabezados y pestañas; fondo de la
  ventana con `expo-system-ui` en tiempo de ejecución.
- `coverColors` e `initials` pasan de la web a `@dsmn/shared`: la misma canción tiene el mismo color en la
  web y en el celular.
- `src/components/Disc.tsx`: la portada como disco con `Animated` de React Native (quieto ~3 s, dos vueltas en
  ~2 s, repite; en pausa se congela; con "reducir movimiento" de Android queda quieto). El reproductor grande
  lo usa en la fase C.

## Global Constraints

- Sin dependencias nativas nuevas (nada que obligue a recompilar). Íconos: Ionicons (ya están).
- Textos en español rioplatense; objetivos táctiles de al menos 44 dp; contraste como en la web.
- La lógica (`src/core`) no cambia en esta fase.

## Review Focus

1. **Pesos de la tipografía en Android:** un texto con `fontWeight: '600'` se ve en Inter SemiBold, no en
   la regular estirada; test de la función que elige la familia.
2. **Antes de cargar las tipografías** no se muestra texto en la tipografía del sistema por un instante
   (la app espera a `useFonts`, y si falla sigue con la del sistema).
3. **Pestaña Listas nueva:** lo que antes estaba como sub-pestaña de Biblioteca sigue funcionando (abrir una
   lista, reproducirla).

---

## Estructura de archivos

```
packages/shared/src/covers.ts                (crear) coverColors + initials (desde la web)
packages/shared/test/covers.test.ts          (crear) (desde apps/web/test/cover.test.tsx)
apps/web/src/components/Cover.tsx            (modificar) los toma de @dsmn/shared
apps/mobile/package.json                     (modificar) tipografías
apps/mobile/src/ui/theme.ts                  (crear)
apps/mobile/src/ui/fonts.ts                  (crear) familias + elección por peso
apps/mobile/src/ui/Text.tsx                  (crear)
apps/mobile/src/ui/TextInput.tsx             (crear)
apps/mobile/src/ui/Button.tsx                (crear)
apps/mobile/src/components/Disc.tsx          (crear)
apps/mobile/src/components/Cover.tsx         (modificar) color de respaldo + iniciales
apps/mobile/src/components/MiniPlayer.tsx    (modificar) diseño nuevo con disco
apps/mobile/app/_layout.tsx                  (modificar) tipografías, tema, fondo
apps/mobile/app/(tabs)/_layout.tsx           (modificar) cuatro pestañas con íconos
apps/mobile/app/(tabs)/listas.tsx            (crear) lo que era la sub-pestaña Listas
apps/mobile/app/(tabs)/index.tsx             (modificar) sin la sub-pestaña Listas
apps/mobile/app/**, src/components/**        (modificar) Text/TextInput/Button propios y colores del tema
apps/mobile/test/fonts.test.ts               (crear)
```

## Tareas

- [ ] **Tarea 1:** portadas compartidas (mover, re-exportar en la web, tests).
- [ ] **Tarea 2:** tema, tipografías, `Text`, `TextInput`, `Button`; `_layout` con `useFonts`, tema de
      navegación y fondo.
- [ ] **Tarea 3:** cuatro pestañas, pantalla Listas, mini reproductor con `Disc`.
- [ ] **Tarea 4:** pasar todas las pantallas a los componentes y colores del tema (sin rediseñarlas todavía).
- [ ] **Tarea 5:** `npm test`, typecheck, lint, Prettier; probar en el celular con el development build.

## Fuera de esta fase

El rediseño de cada pantalla (fases B a E), favoritas y listas editables desde el celular (fase F), íconos
SVG propios.

## Commit sugerido

`feat(mobile): tema oscuro, tipografías, cuatro pestañas y mini reproductor con disco`
