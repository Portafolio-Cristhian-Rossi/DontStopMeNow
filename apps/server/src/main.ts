import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Bonjour } from 'bonjour-service';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { ensureServerId } from './db/meta.ts';
import { createDownloadQueue } from './downloads/queue.ts';
import { createYtDlpSettings, findOnPath } from './downloads/settings.ts';
import { createYtDlp, jsRuntimeFor } from './downloads/ytdlp.ts';
import { EventBus } from './events.ts';
import { buildApp } from './http/app.ts';
import { listRoots } from './library/roots.ts';
import { publishService } from './net/discovery.ts';
import { getLanUrls, startupMessage } from './net/lanUrls.ts';
import { createPairing } from './pairing/pairing.ts';
import {
  BUNDLED,
  browserCommand,
  exitWithError,
  isRunningServer,
  startupErrorMessage,
  wantsBrowser,
} from './runtime.ts';
import { createScanner } from './scan/scanner.ts';
import { createWatcher } from './scan/watcher.ts';

export async function main(): Promise<void> {
  const config = loadConfig(process.env, process.platform, os.homedir());
  mkdirSync(config.coversDir, { recursive: true });

  const db = openDatabase(config.dbPath);
  const bus = new EventBus();
  const serverId = ensureServerId(db);
  const serverName = os.hostname();
  const scanner = createScanner({ db, bus, coversDir: config.coversDir });
  const watcher = createWatcher({ db, scanner });

  const jsRuntime = jsRuntimeFor({ bundled: BUNDLED, execPath: process.execPath, findOnPath });
  const ytdlpSettings = createYtDlpSettings({
    db,
    roots: () => listRoots(db),
    findOnPath: (name) => findOnPath(name),
    exists: existsSync,
    makeYtDlp: (command) => createYtDlp({ command, jsRuntime }),
  });
  const downloadQueue = createDownloadQueue({
    db,
    bus,
    scanner,
    ytdlp: () => ytdlpSettings.current(),
    ffmpeg: () => findOnPath('ffmpeg') !== null,
    tempRoot: path.join(config.dataDir, 'yt-tmp'),
    log: (err, msg) => app.log.error(err, msg),
  });

  const app = buildApp(
    {
      db,
      bus,
      scanner,
      pairing: createPairing(db),
      config,
      serverId,
      serverName,
      lanUrls: () => getLanUrls(config.port),
      onRootsChanged: () =>
        void watcher.sync().catch((err) => app.log.error(err, 'No se pudo vigilar las carpetas')),
      downloads: { settings: ytdlpSettings, queue: downloadQueue },
    },
    // Empaquetado, la consola solo muestra problemas: el registro de cada pedido no le sirve a quien usa el programa.
    { logger: BUNDLED ? { level: 'warn' } : true },
  );

  try {
    await app.listen({ host: '0.0.0.0', port: config.port });
  } catch (err) {
    await watcher.close();
    db.close();
    // Doble clic con el programa ya abierto: se abre la web del que ya está andando.
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && (await isRunningServer(config.port))) {
      console.log(`DontStopMeNow ya está abierto en http://localhost:${config.port}`);
      openBrowser(config.port);
      process.exit(0);
    }
    return exitWithError(startupErrorMessage(err, config.port));
  }
  console.log(startupMessage(config.port, getLanUrls(config.port)));
  console.log(`Datos en ${config.dataDir}`);
  // Retoma las descargas que quedaron a medias; app.close() la detiene (hook onClose de las rutas de descargas).
  downloadQueue.start();

  openBrowser(config.port);

  scanner
    .scanAll()
    .then(() => watcher.sync())
    .catch((err) => app.log.error(err, 'Falló el escaneo inicial'));

  const bonjour = new Bonjour();
  const mdns = publishService({ bonjour, serverId, serverName, port: config.port });

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    await watcher.close();
    mdns.stop();
    bonjour.destroy();
    await app.close();
    db.close();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** En el ejecutable de Windows se abre la web solo, salvo con --sin-navegador o DSMN_NO_BROWSER=1. */
function openBrowser(port: number): void {
  if (!BUNDLED || process.platform !== 'win32' || !wantsBrowser(process.argv, process.env)) return;
  const open = browserCommand(process.platform, `http://localhost:${port}`);
  if (open) spawn(open.cmd, open.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// Con `tsx src/main.ts` arranca acá; en el build empaquetado lo arranca entry.ts.
if (!BUNDLED && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
