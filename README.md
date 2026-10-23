# DontStopMeNow

Tu propio ecosistema de música: un servidor en la compu que organiza tu biblioteca a partir de la metadata
de los archivos, y una app Android que sincroniza los álbumes y listas que elijas y los reproduce sin conexión.

## Instalación

### Windows

1. Bajá `DontStopMeNow-windows-x64.zip` desde la página de
   [Releases](https://github.com/Portafolio-Cristhian-Rossi/DontStopMeNow/releases) (o, si todavía no hay una
   versión publicada, desde el artefacto de la última ejecución del workflow **Release** en la pestaña
   Actions; GitHub lo baja comprimido otra vez, así que adentro está el `.zip` de arriba).
2. Descomprimilo en una carpeta propia, por ejemplo `C:\Programas\DontStopMeNow`.
3. Doble clic en `DontStopMeNow.exe`. Si aparece **"Windows protegió su PC"** (el programa no está firmado
   digitalmente), tocá **Más información → Ejecutar de todas formas**. En Windows 11 con **Control inteligente
   de aplicaciones** activado no aparece esa opción: hay que desactivarlo en Seguridad de Windows.
4. La primera vez, Windows pregunta si permitís el acceso a la red (puede figurar como **Node.js JavaScript
   Runtime**): aceptá para **redes privadas** (si no, el celular no encuentra la compu).
5. Se abre el navegador en **http://localhost:4747**.

- **Cerrar:** cerrá la ventana negra del programa. No hagas clic adentro: Windows lo pausa mientras hay texto
  seleccionado (Esc lo destraba).
- **Si ya estaba abierto:** abrirlo de nuevo solo abre el navegador con el que ya está andando.
- **Que arranque con Windows:** Windows+R → `shell:startup` → poné ahí un acceso directo a
  `DontStopMeNow.exe`. Para que no abra el navegador cada vez, agregá ` --sin-navegador` al final del
  **Destino** del acceso directo.
- **Actualizar:** cerrá el programa y reemplazá la carpeta por la de la versión nueva. La biblioteca, las
  listas y los celulares vinculados se guardan en `%APPDATA%\DontStopMeNow`, así que se conservan.

### Linux (Docker)

```bash
git clone https://github.com/Portafolio-Cristhian-Rossi/DontStopMeNow.git
cd DontStopMeNow
# Editá docker-compose.yml: cambiá /ruta/a/tu/musica por tu carpeta de música.
docker compose up -d --build
```

Los datos del servidor quedan en el volumen de Docker `dsmn-data`.

Abrí http://localhost:4747 en esa misma máquina y, en **Ajustes**, agregá la carpeta como `/music`.

El contenedor usa la **red del host** (`network_mode: host`): la necesita para anunciarse por mDNS y porque
la web de gestión solo responde a pedidos locales; con la red "bridge" de Docker los pedidos llegarían desde
otra IP y la gestión respondería 403.

Sin Docker, también está el binario de Linux (`DontStopMeNow-linux-x64.zip` en Releases): se ejecuta con
`./DontStopMeNow` desde la carpeta descomprimida, no abre el navegador solo y guarda los datos en
`~/.local/share/dontstopmenow`.

## Cómo se usa

En **http://localhost:4747**, desde la misma compu:

1. **Ajustes:** agregá tu carpeta de música (por ejemplo `D:\Música`). El servidor la escanea y después
   vigila los cambios.
2. **Biblioteca:** álbumes, artistas y canciones armados desde la metadata.
3. **Listas:** listas manuales (agregás canciones desde la biblioteca) o de carpeta (todo lo que haya en
   una carpeta, se actualiza sola).
4. **Dispositivos:** el código QR para vincular el celular.

### La app del celular

Se compila con EAS (en la nube) y se instala como APK: los pasos están en
[apps/mobile/README.md](apps/mobile/README.md).

## Estructura

| Carpeta            | Qué es                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| `packages/shared`  | Tipos, esquemas y lógica compartida                                         |
| `apps/server`      | Servidor (Node + Fastify + SQLite) — ver [su README](apps/server/README.md) |
| `apps/web`         | Interfaz de gestión (React)                                                 |
| `scripts`          | Empaquetado del servidor y prueba de humo                                   |
| `docs/superpowers` | Diseño y planes de implementación                                           |

## Desarrollo

Requisitos: Node.js 22.22 o superior (recomendado: 24 LTS).

```bash
npm install
npm start                      # compila la web y arranca el servidor en :4747
npm start -w @dsmn/server      # servidor en :4747
npm run dev -w @dsmn/web       # web con recarga en caliente en :5173 (usa el servidor de :4747)
npm test                       # todos los tests
npm run lint && npm run typecheck && npm run format:check
npm run package                # arma el ejecutable de esta plataforma en release/
npm run smoke -- <ejecutable>  # prueba de humo del ejecutable (o de dist/bundle/server.cjs)
```

### Publicar una versión

```bash
git tag v0.1.0
git push origin v0.1.0
```

El workflow **Release** compila el ejecutable en Windows y en Linux, los prueba y crea el release con los
dos zip.
