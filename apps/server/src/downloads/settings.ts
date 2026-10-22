import { existsSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Root, YtDlpStatus } from '@dsmn/shared';
import { getMeta, setMeta } from '../db/meta.ts';
import { HttpError } from '../http/errors.ts';
import type { YtDlp } from './ytdlp.ts';

const PATH_KEY = 'ytdlp_path';

export interface YtDlpSettings {
  status(): Promise<YtDlpStatus>;
  /** Valida con --version y guarda; si no anda, no guarda. */
  setPath(path: string): Promise<YtDlpStatus>;
  /** El yt-dlp configurado, o null si todavía no hay ruta. */
  current(): YtDlp | null;
}

/** Busca un ejecutable en el PATH (en Windows, probando las extensiones de PATHEXT). */
export function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const win = platform === 'win32';
  const dirs = (env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter(Boolean);
  const exts = win ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext.toLowerCase());
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createYtDlpSettings(o: {
  db: DatabaseSync;
  roots: () => Root[];
  findOnPath: (name: string) => string | null;
  exists: (p: string) => boolean;
  makeYtDlp: (command: string) => YtDlp;
}): YtDlpSettings {
  const exeName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  let cached: { path: string; ytdlp: YtDlp } | null = null;

  function ytdlpFor(command: string): YtDlp {
    if (cached?.path !== command) cached = { path: command, ytdlp: o.makeYtDlp(command) };
    return cached.ytdlp;
  }

  function suggestedPath(): string | null {
    const onPath = o.findOnPath('yt-dlp');
    if (onPath) return onPath;
    for (const root of o.roots()) {
      const candidate = path.join(root.path, exeName);
      if (o.exists(candidate)) return candidate;
    }
    return null;
  }

  async function status(): Promise<YtDlpStatus> {
    const current = getMeta(o.db, PATH_KEY) ?? null;
    let version: string | null = null;
    let error: string | null = null;
    if (current) {
      try {
        version = await ytdlpFor(current).version();
      } catch (err) {
        error = `No se pudo ejecutar yt-dlp: ${message(err)}`;
      }
    }
    return {
      path: current,
      version,
      ffmpeg: o.findOnPath('ffmpeg') !== null,
      suggestedPath: suggestedPath(),
      error,
    };
  }

  return {
    status,

    async setPath(raw) {
      const candidate = raw.trim().replace(/^["']+|["']+$/g, '');
      try {
        await o.makeYtDlp(candidate).version();
      } catch (err) {
        throw new HttpError(400, 'bad_request', `No se pudo ejecutar yt-dlp: ${message(err)}`);
      }
      setMeta(o.db, PATH_KEY, candidate);
      return status();
    },

    current() {
      const current = getMeta(o.db, PATH_KEY);
      return current ? ytdlpFor(current) : null;
    },
  };
}
