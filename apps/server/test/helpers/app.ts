import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ensureServerId, setMeta } from '../../src/db/meta.ts';
import { createDownloadQueue } from '../../src/downloads/queue.ts';
import { createYtDlpSettings } from '../../src/downloads/settings.ts';
import { createYtDlp } from '../../src/downloads/ytdlp.ts';
import { listRoots } from '../../src/library/roots.ts';
import { EventBus } from '../../src/events.ts';
import { buildApp, type AppDeps } from '../../src/http/app.ts';
import { createPairing } from '../../src/pairing/pairing.ts';
import { createScanner } from '../../src/scan/scanner.ts';
import { makeDb, tmpDir } from './fixtures.ts';
import { installFakeYtDlp } from './ytdlp.ts';

export const REMOTE = '192.168.1.50';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

/**
 * App con base en memoria y dependencias reales. Con `downloads`, arma la cola con el yt-dlp falso ya configurado,
 * ffmpeg disponible y sin la pausa de 5 s entre canciones; `fake` es la ruta del yt-dlp falso.
 */
export async function makeApp(
  overrides: { webDir?: string | null; downloads?: boolean } = {},
): Promise<{ app: FastifyInstance; deps: AppDeps; fake?: string }> {
  const db = makeDb();
  const bus = new EventBus();
  const coversDir = await tmpDir();
  const deps: AppDeps = {
    db,
    bus,
    scanner: createScanner({ db, bus, coversDir }),
    pairing: createPairing(db),
    config: {
      dataDir: tmpdir(),
      dbPath: ':memory:',
      coversDir,
      port: 4747,
      webDir: overrides.webDir ?? null,
    },
    serverId: ensureServerId(db),
    serverName: 'PC-Test',
    lanUrls: () => ['http://192.168.1.10:4747'],
  };
  let fake: string | undefined;
  if (overrides.downloads) {
    fake = await installFakeYtDlp();
    setMeta(db, 'ytdlp_path', fake);
    const settings = createYtDlpSettings({
      db,
      roots: () => listRoots(db),
      findOnPath: (name) => (name === 'ffmpeg' ? 'ffmpeg' : null),
      exists: () => false,
      makeYtDlp: (command) => createYtDlp({ command: process.execPath, prefixArgs: [command] }),
    });
    const queue = createDownloadQueue({
      db,
      bus,
      scanner: deps.scanner,
      ytdlp: () => settings.current(),
      ffmpeg: () => true,
      tempRoot: join(await tmpDir(), 'yt-tmp'),
      wait: async () => {},
    });
    deps.downloads = { settings, queue };
    queue.start();
  }
  const app = buildApp(deps);
  apps.push(app);
  return { app, deps, fake };
}
