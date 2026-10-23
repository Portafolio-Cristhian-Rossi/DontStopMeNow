import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bonjour } from 'bonjour-service';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { ensureServerId } from './db/meta.ts';
import { createDownloadQueue } from './downloads/queue.ts';
import { createYtDlpSettings, findOnPath } from './downloads/settings.ts';
import { createYtDlp } from './downloads/ytdlp.ts';
import { EventBus } from './events.ts';
import { buildApp } from './http/app.ts';
import { listRoots } from './library/roots.ts';
import { publishService } from './net/discovery.ts';
import { getLanUrls, startupMessage } from './net/lanUrls.ts';
import { createPairing } from './pairing/pairing.ts';
import { createScanner } from './scan/scanner.ts';
import { createWatcher } from './scan/watcher.ts';

const config = loadConfig(process.env, process.platform, os.homedir());
mkdirSync(config.coversDir, { recursive: true });

const db = openDatabase(config.dbPath);
const bus = new EventBus();
const serverId = ensureServerId(db);
const serverName = os.hostname();
const scanner = createScanner({ db, bus, coversDir: config.coversDir });
const watcher = createWatcher({ db, scanner });

const ytdlpSettings = createYtDlpSettings({
  db,
  roots: () => listRoots(db),
  findOnPath: (name) => findOnPath(name),
  exists: existsSync,
  makeYtDlp: (command) => createYtDlp({ command }),
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
  { logger: true },
);

await app.listen({ host: '0.0.0.0', port: config.port });
console.log(startupMessage(config.port, getLanUrls(config.port)));
console.log(`Datos en ${config.dataDir}`);
// Retoma lo que quedó a medias; app.close() la detiene (hook onClose de las rutas de descargas).
downloadQueue.start();

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
