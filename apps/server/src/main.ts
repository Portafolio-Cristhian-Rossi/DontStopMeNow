import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { Bonjour } from 'bonjour-service';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { ensureServerId } from './db/meta.ts';
import { EventBus } from './events.ts';
import { buildApp } from './http/app.ts';
import { publishService } from './net/discovery.ts';
import { getLanUrls, startupMessage } from './net/lanUrls.ts';
import { createPairing } from './pairing/pairing.ts';
import { BUNDLED, browserCommand, startupErrorMessage } from './runtime.ts';
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
    // Empaquetado, la consola solo muestra problemas: el registro de cada pedido no le sirve a quien usa el programa.
    { logger: BUNDLED ? { level: 'warn' } : true },
  );

  try {
    await app.listen({ host: '0.0.0.0', port: config.port });
  } catch (err) {
    console.error(startupErrorMessage(err, config.port));
    await watcher.close();
    db.close();
    process.exit(1);
  }
  console.log(startupMessage(config.port, getLanUrls(config.port)));
  console.log(`Datos en ${config.dataDir}`);

  if (BUNDLED && process.platform === 'win32' && process.env.DSMN_NO_BROWSER !== '1') {
    const open = browserCommand(process.platform, `http://localhost:${config.port}`);
    if (open) spawn(open.cmd, open.args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }

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

// Con `tsx src/main.ts` arranca acá; en el build empaquetado lo arranca entry.ts.
if (!BUNDLED && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
