import { tmpdir } from 'node:os';
import { afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ensureServerId } from '../../src/db/meta.ts';
import { EventBus } from '../../src/events.ts';
import { buildApp, type AppDeps } from '../../src/http/app.ts';
import { createPairing } from '../../src/pairing/pairing.ts';
import { createScanner } from '../../src/scan/scanner.ts';
import { makeDb, tmpDir } from './fixtures.ts';

export const REMOTE = '192.168.1.50';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

/** App con base en memoria y dependencias reales. */
export async function makeApp(): Promise<{ app: FastifyInstance; deps: AppDeps }> {
  const db = makeDb();
  const bus = new EventBus();
  const coversDir = await tmpDir();
  const deps: AppDeps = {
    db,
    bus,
    scanner: createScanner({ db, bus, coversDir }),
    pairing: createPairing(db),
    config: { dataDir: tmpdir(), dbPath: ':memory:', coversDir, port: 4747 },
    serverId: ensureServerId(db),
    serverName: 'PC-Test',
    lanUrls: () => ['http://192.168.1.10:4747'],
  };
  const app = buildApp(deps);
  apps.push(app);
  return { app, deps };
}
