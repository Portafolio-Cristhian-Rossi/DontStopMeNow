# Etapa 5 — Empaquetado: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el servidor se instale sin Node ni npm: un `DontStopMeNow.exe` de doble clic para Windows (con la web incluida), una imagen Docker opcional para Linux, y GitHub Actions que compila y publica ambos.

**Architecture:** El servidor se empaqueta con esbuild en un único `server.cjs`. Ese archivo se convierte en un ejecutable autocontenido de Node (SEA: `--experimental-sea-config` + `postject`) que se distribuye en una carpeta junto a `web/` (la interfaz compilada). Un workflow de GitHub Actions arma el `.exe` en `windows-latest` y el binario de Linux en `ubuntu-latest`, los prueba con un script de humo y los adjunta a un release cuando se publica un tag `v*`. La imagen Docker corre el mismo `server.cjs` con Node.

**Tech Stack:** esbuild 0.28, postject 1.0.0-alpha.6, Node 24 (CI) / ≥ 22.22 (local), GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-10-22-dontstopmenow-design.md` (§11 etapa 5, §3.2 configuración)

## Global Constraints

- Nombre de la carpeta distribuida: `DontStopMeNow-<os>-<arch>` (`windows-x64`, `linux-x64`), con `DontStopMeNow.exe` (o `DontStopMeNow` en Linux), `web/` y `LEEME.txt`.
- Fusible de SEA: `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`; `sea-config.json` con `disableExperimentalSEAWarning: true` y `useCodeCache: false` (el caché de código ata el blob a la versión exacta de V8 y no aporta en un servidor).
- En el build empaquetado (`__DSMN_BUNDLED__ = true`, inyectado por esbuild), la web por defecto es `<carpeta del ejecutable>/web` (SEA) o `<carpeta de server.cjs>/web` (Node + bundle, Docker). `DSMN_WEB_DIR` sigue teniendo prioridad. La carpeta de datos no cambia (`%APPDATA%\DontStopMeNow`), así que reemplazar la carpeta del programa por una versión nueva conserva biblioteca, listas y celulares vinculados.
- Solo en Windows y en el build empaquetado, al arrancar se abre `http://localhost:<puerto>` en el navegador, salvo con `DSMN_NO_BROWSER=1`.
- El aviso `ExperimentalWarning` de `node:sqlite` no se muestra en el build empaquetado (no le sirve a quien usa el programa); los demás avisos sí.
- Textos para quien usa el programa en español rioplatense.

## Review Focus

1. **Doble clic dos veces** (el puerto ya está en uso): la consola muestra `"El puerto 4747 ya está en uso: ¿DontStopMeNow ya está abierto? Cerrá la otra ventana o usá DSMN_PORT."` y no un stack trace; test en Task 1.
2. **Carpeta del programa con espacios o tildes** (`C:\Users\Cristhián\Mis programas\DontStopMeNow`): la web se encuentra igual; test en Task 1 con `path.win32`.
3. **Actualizar** reemplazando la carpeta: los datos siguen en `%APPDATA%`; documentado en Task 5 y cubierto por el test de `loadConfig` existente.
4. **Docker con red bridge:** las rutas de gestión responderían 403 porque los pedidos llegan desde la IP del gateway. El `docker-compose.yml` usa `network_mode: host` y el README explica por qué; Task 4.
5. **Windows SmartScreen** ante un `.exe` sin firmar: el README explica "Más información → Ejecutar de todas formas"; Task 5.

---

### Task 1: Servidor listo para empaquetar

**Files:**

- Create: `apps/server/src/runtime.ts`, `apps/server/src/entry.ts`
- Modify: `apps/server/src/main.ts` (todo dentro de `export async function main(): Promise<void>`, sin `await` de nivel superior), `apps/server/src/config.ts` (recibe `defaultWebDir` en lugar de calcularlo con `import.meta`)
- Test: `apps/server/test/runtime.test.ts`, `apps/server/test/config.test.ts`

**Interfaces:**

- Produces:
  - `webDirFor(opts: { bundled: boolean; isSea: boolean; execPath: string; scriptPath: string | undefined; moduleUrl: string; platform: NodeJS.Platform }): string` — empaquetado: `join(dirname(isSea ? execPath : scriptPath), 'web')` (con `path.win32` en win32); si no, `fileURLToPath(new URL('../../web/dist', moduleUrl))`.
  - `defaultWebDir(): string` — llama a `webDirFor` con los valores reales (`__DSMN_BUNDLED__`, `node:sea` `isSea()`, `process.execPath`, `process.argv[1]`, `import.meta.url`).
  - `loadConfig(env, platform, homedir, exists = existsSync, defaultWeb = defaultWebDir())`.
  - `startupErrorMessage(err: unknown, port: number): string` — `EADDRINUSE` → el texto de Review Focus 1; si no, `"No se pudo iniciar el servidor: <mensaje>"`.
  - `browserCommand(platform: NodeJS.Platform, url: string): { cmd: string; args: string[] } | null` — win32: `cmd` `['/c', 'start', '""', url]`; darwin: `open` `[url]`; linux: `xdg-open` `[url]`; otro: `null`.
  - `installWarningFilter(): void` — reemplaza los listeners de `'warning'` por uno que ignora `ExperimentalWarning` cuyo mensaje menciona `SQLite` y muestra el resto con `console.warn`.
  - `entry.ts` (punto de entrada del bundle): `installWarningFilter()` y después `import('./main.ts').then((m) => m.main())`, para que el filtro esté antes de que se cargue `node:sqlite`. `main()` captura el error de `listen`, imprime `startupErrorMessage` y termina con código 1; en el build empaquetado en Windows, abre el navegador con `browserCommand` (`spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()`), salvo `DSMN_NO_BROWSER=1`.
  - `apps/server/package.json`: `start` sigue con `tsx src/main.ts`; para eso `main.ts` termina con `if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();`, que no se ejecuta en el bundle porque ahí el arranque lo hace `entry.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('empaquetado como SEA: web junto al ejecutable, aunque la ruta tenga espacios y tildes', () => {
  expect(
    webDirFor({
      bundled: true,
      isSea: true,
      execPath: 'C:\\Users\\Cristhián\\Mis programas\\DontStopMeNow\\DontStopMeNow.exe',
      scriptPath: undefined,
      moduleUrl: 'file:///x/src/runtime.ts',
      platform: 'win32',
    }),
  ).toBe('C:\\Users\\Cristhián\\Mis programas\\DontStopMeNow\\web');
});
it('empaquetado con Node (Docker): web junto a server.cjs', () => {
  expect(
    webDirFor({
      bundled: true,
      isSea: false,
      execPath: '/usr/local/bin/node',
      scriptPath: '/app/server.cjs',
      moduleUrl: 'file:///x',
      platform: 'linux',
    }),
  ).toBe('/app/web');
});
it('en desarrollo: apps/web/dist', () => {
  expect(
    webDirFor({
      bundled: false,
      isSea: false,
      execPath: '',
      scriptPath: '',
      moduleUrl: 'file:///repo/apps/server/src/runtime.ts',
      platform: 'linux',
    }),
  ).toBe('/repo/apps/web/dist');
});
it('puerto en uso → mensaje claro', () => {
  expect(
    startupErrorMessage(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), 4747),
  ).toBe(
    'El puerto 4747 ya está en uso: ¿DontStopMeNow ya está abierto? Cerrá la otra ventana o usá DSMN_PORT.',
  );
  expect(startupErrorMessage(new Error('boom'), 4747)).toBe('No se pudo iniciar el servidor: boom');
});
it('browserCommand por plataforma', () => {
  expect(browserCommand('win32', 'http://localhost:4747')).toEqual({
    cmd: 'cmd',
    args: ['/c', 'start', '""', 'http://localhost:4747'],
  });
  expect(browserCommand('linux', 'http://x')).toEqual({ cmd: 'xdg-open', args: ['http://x'] });
  expect(browserCommand('aix', 'http://x')).toBeNull();
});
it('el filtro oculta solo el aviso experimental de SQLite', () => {
  /* espiar console.warn; emitir ambos avisos con process.emitWarning; await; solo el otro llega */
});
// config.test.ts: loadConfig usa defaultWeb cuando no hay DSMN_WEB_DIR
```

- [ ] **Step 2: Run** `npx vitest run apps/server` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS; `npm start -w @dsmn/server` sigue arrancando (prueba manual con `DSMN_DATA_DIR` temporal: imprime el mensaje de inicio y responde `/api/catalog`).
- [ ] **Step 5: Commit** — `feat(server): listo para empaquetar (entrada, web junto al ejecutable, errores de inicio)`

---

### Task 2: Bundle, ejecutable y prueba de humo

**Files:**

- Create: `scripts/bundle-server.mjs`, `scripts/package.mjs`, `scripts/smoke.mjs`, `scripts/LEEME.txt` (plantilla)
- Modify: `package.json` raíz (scripts y devDependencies `esbuild@0.28.2`, `postject@1.0.0-alpha.6`), `.gitignore` (`/release/`, `/dist/`), `eslint.config.js` (globals de Node para `scripts/**/*.mjs`)

**Interfaces:**

- Produces:
  - `npm run bundle` → `node scripts/bundle-server.mjs` → `dist/bundle/server.cjs` (esbuild: entrada `apps/server/src/entry.ts`, `platform: 'node'`, `target: 'node22'`, `format: 'cjs'`, `define: { __DSMN_BUNDLED__: 'true' }`, `logOverride: { 'empty-import-meta': 'silent' }`).
  - `npm run package` → `node scripts/package.mjs` → `npm run build` (web) + bundle + blob SEA con el `node` actual + copia de `process.execPath` + `postject` (`--sentinel-fuse` de Global Constraints; en macOS no se usa) + copia de `apps/web/dist` a `web/` + `LEEME.txt` → `release/DontStopMeNow-<os>-<arch>/`. Imprime la ruta final.
  - `node scripts/smoke.mjs <ruta al ejecutable o a server.cjs>` — lo arranca con `DSMN_DATA_DIR` temporal, un puerto libre y `DSMN_NO_BROWSER=1`; espera hasta 20 s a que `GET /api/catalog` responda 200 con JSON válido; comprueba que `GET /` devuelve HTML con `id="root"`; mata el proceso; sale con código 0 o 1 e imprime qué falló. Si recibe un `.cjs`, lo corre con `process.execPath`.
  - `LEEME.txt`: tres pasos (doble clic, permitir en redes privadas, abrir `http://localhost:4747`), qué hacer con SmartScreen, dónde quedan los datos y cómo actualizar.

- [ ] **Step 1: Implementar** los tres scripts.
- [ ] **Step 2: Verificar** `npm run bundle && node scripts/smoke.mjs dist/bundle/server.cjs` → `OK`; `npm run package && node scripts/smoke.mjs release/DontStopMeNow-linux-x64/DontStopMeNow` → `OK`; la consola del ejecutable no muestra el aviso de SQLite. Probar el caso de puerto ocupado: arrancar dos veces con el mismo `DSMN_PORT` → la segunda imprime el mensaje de Review Focus 1 y sale con código 1.
- [ ] **Step 3: Verificar** `npm test && npm run lint && npm run typecheck && npm run format:check`.
- [ ] **Step 4: Commit** — `build: ejecutable autocontenido del servidor y prueba de humo`

---

### Task 3: GitHub Actions — compilar y publicar

**Files:**

- Create: `.github/workflows/release.yml`

**Interfaces:**

- Produces: workflow `Release` con `on: { workflow_dispatch: {}, push: { tags: ['v*'] } }`:
  - Job `build` con `matrix: { include: [{ os: windows-latest, name: windows-x64, bin: DontStopMeNow.exe }, { os: ubuntu-latest, name: linux-x64, bin: DontStopMeNow }] }`: checkout, `setup-node@v4` (24, cache npm), `npm ci`, `npm run package`, `node scripts/smoke.mjs release/DontStopMeNow-${{ matrix.name }}/${{ matrix.bin }}`, comprimir (`Compress-Archive` en Windows, `zip -r` en Linux) a `DontStopMeNow-${{ matrix.name }}.zip` y `actions/upload-artifact@v4`.
  - Job `release` (solo si `startsWith(github.ref, 'refs/tags/v')`, `needs: build`, `permissions: contents: write`): `actions/download-artifact@v4` y `softprops/action-gh-release@v2` con los dos zip.

- [ ] **Step 1: Implementar** el workflow.
- [ ] **Step 2: Verificar** la sintaxis: `npx --yes yaml-lint .github/workflows/release.yml` (o el parser `yaml` de Node) sin errores.
- [ ] **Step 3: Commit** — `ci: workflow para compilar y publicar el ejecutable`
- [ ] **Step 4: Probar en GitHub:** push y disparar el workflow con `workflow_dispatch` (herramienta de GitHub Actions). Esperar a que termine y leer los logs de los dos jobs. Si falla el de Windows, corregir y repetir. Expected: los dos jobs en verde, con artefactos `DontStopMeNow-windows-x64` y `DontStopMeNow-linux-x64`.

---

### Task 4: Docker para Linux

**Files:**

- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`

**Interfaces:**

- Produces:
  - `Dockerfile` en dos etapas:
    - **`build`:** `node:24-slim`, `npm ci`, `npm run build`, `npm run bundle`.
    - **runtime:** `node:24-slim`, con:
      - `WORKDIR /app`;
      - copia de `dist/bundle/server.cjs` y de `apps/web/dist` → `/app/web`;
      - `ENV DSMN_DATA_DIR=/data DSMN_PORT=4747 NODE_ENV=production`;
      - `VOLUME /data`, `EXPOSE 4747`;
      - `USER node`;
      - `CMD ["node", "server.cjs"]`.
  - `.dockerignore`: `node_modules`, `**/node_modules`, `dist`, `release`, `apps/mobile`, `.git`, `.superpowers`, `apps/web/dist`.
  - `docker-compose.yml`: servicio `dontstopmenow` con `build: .`, `network_mode: host` (comentario: necesario para mDNS y para que las rutas de gestión vean los pedidos como locales), `volumes: ['./data:/data', '/ruta/a/tu/musica:/music:ro']` (comentario: cambiá la ruta; en la web agregá la carpeta como `/music`), `restart: unless-stopped`.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar** sin Docker: los mismos comandos de la etapa `build` corren en limpio (`rm -rf dist && npm run build && npm run bundle`) y `node scripts/smoke.mjs dist/bundle/server.cjs` con `DSMN_WEB_DIR` apuntando a `apps/web/dist` → `OK`. Si hay un daemon de Docker disponible, `docker build -t dontstopmenow .` y la prueba de humo dentro del contenedor.
- [ ] **Step 3: Commit** — `build: imagen Docker opcional para Linux`

---

### Task 5: Documentación de instalación

**Files:**

- Modify: `README.md` raíz (sección **Instalación**: Windows y Linux/Docker, primero; desarrollo después), `apps/server/README.md` (apunta a la instalación), spec §11 (marca la etapa 5 como hecha y resume cómo se distribuye)

**Interfaces:**

- Produces: README con:
  - **Windows:**
    1. Bajar `DontStopMeNow-windows-x64.zip` desde Releases (o desde el artefacto del último workflow).
    2. Descomprimirlo en una carpeta propia (por ejemplo `C:\Programas\DontStopMeNow`).
    3. Doble clic en `DontStopMeNow.exe`. SmartScreen: "Más información → Ejecutar de todas formas".
    4. Permitir el acceso en redes privadas.
    5. Se abre el navegador en `http://localhost:4747`.
    - **Que arranque con Windows:** un acceso directo en `shell:startup`.
    - **Actualizar:** cerrar la ventana y reemplazar la carpeta (los datos quedan en `%APPDATA%\DontStopMeNow`).
    - **Cerrar:** cerrar la ventana.
  - **Linux (Docker):** editar la ruta de música en `docker-compose.yml`, correr `docker compose up -d --build` y agregar la carpeta como `/music`. Explica por qué usa red `host`.
  - **Publicar una versión** (para el dueño del repo): `git tag v0.1.0 && git push origin v0.1.0` y el workflow crea el release.

- [ ] **Step 1: Escribir.**
- [ ] **Step 2: Verificar** `npm run format:check`.
- [ ] **Step 3: Commit** — `docs: instalación en Windows y Linux`
