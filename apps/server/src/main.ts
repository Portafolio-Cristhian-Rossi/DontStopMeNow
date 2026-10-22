import { mkdirSync } from 'node:fs';
import os from 'node:os';
import { Bonjour } from 'bonjour-service';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { ensureServerId } from './db/meta.ts';
import { EventBus } from './events.ts';
import { buildApp } from './http/app.ts';
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
  },
  { logger: true },
);

await app.listen({ host: '0.0.0.0', port: config.port });
console.log(startupMessage(config.port, getLanUrls(config.port)));
console.log(`Datos en ${config.dataDir}`);

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
