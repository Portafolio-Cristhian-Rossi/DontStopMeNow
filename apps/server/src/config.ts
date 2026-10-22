import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@dsmn/shared';

export interface Config {
  dataDir: string;
  dbPath: string;
  coversDir: string;
  port: number;
  /** Carpeta con la web compilada, o null si no está compilada. */
  webDir: string | null;
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homedir: string,
  exists: (p: string) => boolean = existsSync,
): Config {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const dataDir =
    env.DSMN_DATA_DIR ??
    (platform === 'win32'
      ? p.join(env.APPDATA ?? p.join(homedir, 'AppData', 'Roaming'), 'DontStopMeNow')
      : p.join(homedir, '.local', 'share', 'dontstopmenow'));

  let port = DEFAULT_PORT;
  if (env.DSMN_PORT !== undefined) {
    port = Number(env.DSMN_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`DSMN_PORT inválido: ${env.DSMN_PORT}`);
    }
  }

  const webCandidate = env.DSMN_WEB_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
  const webDir = exists(path.join(webCandidate, 'index.html')) ? webCandidate : null;

  return {
    dataDir,
    dbPath: p.join(dataDir, 'library.db'),
    coversDir: p.join(dataDir, 'covers'),
    port,
    webDir,
  };
}
