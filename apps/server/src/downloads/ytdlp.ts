import { execFile, spawn } from 'node:child_process';
import type { PreviewEntry } from '@dsmn/shared';
import { PREVIEW_ARGS } from './recipe.ts';

export interface DownloadProgress {
  stage: 'download' | 'convert';
  percent: number | null;
}

export interface YtDlpPreview {
  kind: 'playlist' | 'video';
  ytPlaylistId: string | null;
  title: string;
  url: string;
  entries: PreviewEntry[];
}

/** Único lugar del servidor que ejecuta yt-dlp. */
export interface YtDlp {
  version(): Promise<string>;
  update(): Promise<{ version: string; output: string }>;
  preview(url: string): Promise<YtDlpPreview>;
  /** `filePath` es null si yt-dlp terminó bien sin informar el archivo (ya existía). */
  downloadOne(
    args: string[],
    onProgress: (p: DownloadProgress) => void,
    signal: AbortSignal,
  ): Promise<{ filePath: string | null }>;
}

/** Falla de yt-dlp con el motivo legible (la última línea "ERROR:"). */
export class YtDlpError extends Error {}

const STALL_MS = 300_000;
/**
 * YouTube exige resolver desafíos de JavaScript; yt-dlp solo busca deno por defecto y sin runtime recibe 403. El
 * servidor siempre corre sobre Node, así que se lo pasamos.
 */
const JS_RUNTIME = ['--js-runtimes', `node:${process.execPath}`];
const CONVERT_LINE = /^\[(ExtractAudio|EmbedThumbnail|Metadata)\]/;

interface RunOptions {
  onLine?: (line: string) => void;
  signal?: AbortSignal;
}

function kill(pid: number | undefined, child: { kill(): boolean }) {
  // En Windows hay que cerrar el árbol entero: yt-dlp lanza ffmpeg.
  if (process.platform === 'win32' && pid !== undefined) {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
  } else {
    child.kill();
  }
}

export function createYtDlp(o: { command: string; prefixArgs?: string[]; stallMs?: number }): YtDlp {
  const stallMs = o.stallMs ?? STALL_MS;

  function run(args: string[], opts: RunOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new YtDlpError('Cancelada'));
      const child = spawn(o.command, [...(o.prefixArgs ?? []), ...args], {
        shell: false,
        windowsHide: true,
        // Sin esto, en Windows yt-dlp escribe en la página de códigos de la consola y rompe las tildes.
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
      let stdout = '';
      let pending = '';
      let lastError: string | null = null;
      let stopped: string | null = null;

      const stop = (reason: string) => {
        stopped = reason;
        kill(child.pid, child);
      };
      let stall = setTimeout(() => stop('No respondió'), stallMs);
      const touch = () => {
        clearTimeout(stall);
        stall = setTimeout(() => stop('No respondió'), stallMs);
      };
      const onAbort = () => stop('Cancelada');
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      const readLines = (chunk: string) => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('ERROR:')) lastError = line.slice('ERROR:'.length).trim();
          opts.onLine?.(line);
        }
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        touch();
        stdout += chunk;
        readLines(chunk);
      });
      child.stderr.on('data', (chunk: string) => {
        touch();
        for (const line of chunk.split(/\r?\n/)) {
          if (line.startsWith('ERROR:')) lastError = line.slice('ERROR:'.length).trim();
        }
      });
      child.on('error', (err) => {
        clearTimeout(stall);
        reject(new YtDlpError(`No se pudo ejecutar yt-dlp: ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(stall);
        opts.signal?.removeEventListener('abort', onAbort);
        if (pending) readLines('\n');
        if (stopped) return reject(new YtDlpError(stopped));
        if (code !== 0) return reject(new YtDlpError(lastError ?? `yt-dlp terminó con código ${code}`));
        resolve(stdout);
      });
    });
  }

  async function version(): Promise<string> {
    return (await run(['--version'])).trim();
  }

  return {
    version,

    async update() {
      const output = (await run(['-U'])).trim();
      return { version: await version(), output };
    },

    async preview(url) {
      const data = JSON.parse(await run([...JS_RUNTIME, ...PREVIEW_ARGS, '--', url])) as RawInfo;
      if (data._type === 'playlist') {
        return {
          kind: 'playlist',
          ytPlaylistId: data.id,
          title: data.title ?? 'Playlist',
          url,
          entries: (data.entries ?? []).map((e, i) => toEntry(e, i + 1)),
        };
      }
      return {
        kind: 'video',
        ytPlaylistId: null,
        title: data.title ?? data.id,
        url,
        entries: [toEntry(data, null)],
      };
    },

    async downloadOne(args, onProgress, signal) {
      let filePath: string | null = null;
      await run([...JS_RUNTIME, ...args], {
        signal,
        onLine: (line) => {
          if (line.startsWith('dsmn-progress ')) {
            const [done, total, estimate] = line.split(' ').slice(1).map(Number);
            const size = Number.isFinite(total) ? total! : estimate!;
            const percent =
              Number.isFinite(done) && Number.isFinite(size) && size > 0 ? (done! / size) * 100 : null;
            onProgress({ stage: 'download', percent });
          } else if (line.startsWith('dsmn-file ')) {
            filePath = line.slice('dsmn-file '.length);
          } else if (CONVERT_LINE.test(line)) {
            onProgress({ stage: 'convert', percent: null });
          }
        },
      });
      return { filePath };
    },
  };
}

interface RawInfo {
  _type?: string;
  id: string;
  url?: string;
  webpage_url?: string;
  title?: string;
  channel?: string | null;
  uploader?: string | null;
  duration?: number | null;
  entries?: RawInfo[];
}

function toEntry(e: RawInfo, position: number | null): PreviewEntry {
  const duration = e.duration ?? null;
  const link = e.url?.startsWith('http') ? e.url : `https://www.youtube.com/watch?v=${e.id}`;
  // YouTube marca los no disponibles como "[Private video]"/"[Deleted video]" o, hoy, sin título ni duración.
  const unavailable = duration === null && (!e.title || /^\[(private|deleted)/i.test(e.title));
  return {
    videoId: e.id,
    url: link,
    title: e.title || 'Video no disponible',
    channel: e.channel ?? e.uploader ?? null,
    durationSec: duration,
    position,
    unavailable,
  };
}
