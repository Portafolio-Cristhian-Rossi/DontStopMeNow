import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config.ts';
import type { EventBus } from '../events.ts';
import type { Pairing } from '../pairing/pairing.ts';
import type { Scanner } from '../scan/scanner.ts';
import { authHook } from './auth.ts';
import { deviceRoutes } from './deviceRoutes.ts';
import { errorHandler, notFoundHandler } from './errors.ts';

export interface AppDeps {
  db: DatabaseSync;
  bus: EventBus;
  scanner: Scanner;
  pairing: Pairing;
  config: Config;
  serverId: string;
  serverName: string;
  lanUrls: () => string[];
  onRootsChanged?: () => void;
}

export function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook('onRequest', authHook(deps.pairing));
  deviceRoutes(app, deps);
  return app;
}
