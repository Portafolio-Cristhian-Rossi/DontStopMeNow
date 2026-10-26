# Rediseño web, fase 1 — Estilo y estructura: plan de implementación

**Goal:** Llevar la web de gestión al rediseño aprobado en el lienzo de Design (tema oscuro, barra lateral,
tipografías nuevas) sin agregar funciones: las mismas páginas, rutas y acciones de hoy, con otra cara.

**Diseño de referencia:** lienzo "DontStopMeNow — rediseño web" (artboards Biblioteca, Álbum, Listas,
Descargar, Dispositivos y Ajustes). La barra de reproducción, la pantalla Reproduciendo, los corazones y
Favoritas son de las fases 2 a 4.

**Architecture:** Casi todo es CSS (`apps/web/src/styles.css`) sobre el mismo HTML. Cambia el JSX solo
donde el diseño cambia la estructura: el `Layout` (barra lateral), los encabezados de página, las tarjetas
de Listas, la tarjeta de vinculación de Dispositivos y los chips de artista en Álbumes. Las tablas de
canciones siguen siendo `<table>` (los tests y la accesibilidad dependen de eso); cambia su estilo.

**Tech Stack:** el de la etapa 2, más `@fontsource-variable/inter`, `@fontsource-variable/bricolage-grotesque`
y `@fontsource-variable/jetbrains-mono` (OFL-1.1): las tipografías van empaquetadas con la web para que
funcione sin internet, en lugar de cargarlas de Google Fonts.

## Global Constraints

- Mismas reglas que la etapa 2: textos en español rioplatense, CSS propio con variables, sin librería de
  componentes, `strict` + `noUncheckedIndexedAccess`, Prettier y ESLint.
- **Solo tema oscuro** por ahora (`color-scheme: dark`): el diseño aprobado es oscuro; el claro queda para
  después.
- **Un solo `<nav>` por página**: los tests buscan `getByRole('navigation')`. La barra lateral es ese
  `<nav>`; las pestañas de la Biblioteca pasan a ser un grupo de links sin `<nav>` propio.
- Objetivos táctiles de al menos 44 px, contraste de texto 4.5:1, foco visible con el color de acento.
- Responsive: la barra lateral se apila arriba en pantallas angostas (flex-wrap), sin scroll horizontal.

## Review Focus

1. **Contraste:** el gris de texto secundario (`#A3A3AA`) sobre las superficies, y el texto oscuro
   (`#140A06`) sobre el acento coral.
2. **QR de vinculación:** margen blanco de 4 módulos (el estándar), para que la cámara lo lea fácil.
3. **Portadas sin imagen:** el color de respaldo sale de un hash del título, así un álbum tiene siempre
   el mismo color; test en la tarea 4.
4. **Tests existentes:** los 68 tests de la web tienen que seguir pasando sin cambiar lo que comprueban.

---

## Estructura de archivos

```
apps/web/package.json                      (modificar) tipografías
apps/web/src/main.tsx                      (modificar) importa las tipografías
apps/web/index.html                        (modificar) theme-color
apps/web/src/styles.css                    (reescribir) tokens, base, componentes
apps/web/src/components/Icon.tsx           (crear) íconos de trazo
apps/web/src/components/Layout.tsx         (modificar) barra lateral + estado del servidor
apps/web/src/components/LibraryTabs.tsx    (modificar) pestañas subrayadas, sin <nav>
apps/web/src/components/Cover.tsx          (modificar) respaldo de color con iniciales
apps/web/src/components/PageHeader.tsx     (crear) título + subtítulo + acciones
apps/web/src/pages/AlbumsPage.tsx          (modificar) encabezado con totales + chips de artista
apps/web/src/pages/ArtistsPage.tsx         (modificar) encabezado
apps/web/src/pages/SongsPage.tsx           (modificar) encabezado
apps/web/src/pages/AlbumPage.tsx           (modificar) volver a Biblioteca + encabezado grande
apps/web/src/pages/PlaylistsPage.tsx       (modificar) tarjetas + formulario "Nueva lista"
apps/web/src/pages/PlaylistPage.tsx        (modificar) encabezado
apps/web/src/pages/DownloadPage.tsx        (modificar) encabezado + caja del link
apps/web/src/pages/SettingsPage.tsx        (modificar) secciones en tarjetas
apps/web/src/pages/DevicesPage.tsx         (modificar) tarjeta de vinculación, margen del QR
apps/web/test/cover.test.tsx               (crear)
```

## Tareas

### Tarea 1 — Tipografías y tokens

- [ ] `npm install -w @dsmn/web` de las tres tipografías; importarlas en `main.tsx`.
- [ ] Reescribir `styles.css`: tokens (`--bg #0E0F11`, `--surface #16171A`, `--surface-side #121316`,
      `--surface-2 #1F2024`, `--border #24252A`, `--text #F2F1EE`, `--muted #A3A3AA`, `--accent #FF5A3C`,
      `--accent-text #140A06`, `--ok #3CCB8A`, `--danger #FF6B60`), familias (`--font-display`,
      `--font-body`, `--font-mono`), radios y foco; botones (`primary`, normal, `danger`, `small`),
      campos, tarjetas, tablas, badges, diálogos.

### Tarea 2 — Íconos y barra lateral

- [ ] `Icon.tsx`: `biblioteca`, `listas`, `descargar`, `dispositivos`, `ajustes`, `buscar`, `mas`,
      `volver`, `carpeta`, `link`, `ok`, `alerta`, `refrescar` (SVG de trazo, `aria-hidden`).
- [ ] `Layout.tsx`: marca con logo, el `<nav>` con las cinco secciones e íconos, y abajo la tarjeta de
      estado ("Servidor activo" + "Escaneando… x/y" o "Biblioteca al día"). El texto
      `Escaneando… 3/10` se mantiene igual (lo comprueba `layout.test.tsx`).

### Tarea 3 — Encabezados y Biblioteca

- [ ] `PageHeader` (h1 + subtítulo + zona de acciones) en todas las páginas.
- [ ] Álbumes: subtítulo "N álbumes · M canciones"; chips de artista que llevan a `?artista=`; tarjetas
      con portada, título y "artista · año".
- [ ] Álbum: link "Biblioteca" para volver, portada de 232 px, título grande, detalles y
      "Agregar a lista…".
- [ ] Tablas de canciones: filas de 52 px con hover, duración en monoespaciada, títulos largos cortados con
      "…" y el título completo en `title`.

### Tarea 4 — Portadas de respaldo

- [ ] `Cover`: sin `coverId`, bloque de color elegido por hash del título dentro de una paleta fija, con
      las iniciales (hasta 2 letras) en el color de texto que contraste.
- [ ] Test: el mismo título da siempre el mismo color, y las iniciales salen de las primeras palabras.

### Tarea 5 — Listas, Descargar, Ajustes y Dispositivos

- [ ] Listas: botón "Nueva lista" que abre el formulario con los dos tipos (elegir canciones o desde una
      carpeta); las listas como tarjetas en grilla. Se mantienen las etiquetas que usan los tests
      ("Nombre de la lista nueva", "Nombre de la lista de carpeta").
- [ ] Descargar: el link en una caja grande con el botón "Ver"; Cola y playlists de YouTube como tarjetas.
- [ ] Ajustes: cada sección (Carpetas, Escaneo, yt-dlp, Archivos con problemas) en una tarjeta.
- [ ] Dispositivos: tarjeta con QR (margen 4), pasos numerados, código grande con lo que falta para que
      venza, direcciones de la compu (salen del contenido del QR) y "Generar otro código"; celulares
      vinculados como filas.

### Tarea 6 — Verificación

- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` (de los archivos tocados).
- [ ] Recorrer las seis páginas en el navegador a 1440 px y a 390 px, y escanear el QR con la app dev.

## Fuera de esta fase

Reproducción, cola y disco animado (fase 2); favoritas (fase 3); "Agregar a la cola" y listas desde el
reproductor (fase 4); tema claro; llevar el diseño a la app Android.

## Commit sugerido

`feat(web): rediseño con barra lateral, tema oscuro y tipografías nuevas`
