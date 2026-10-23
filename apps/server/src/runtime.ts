import path from 'node:path';
import { isSea } from 'node:sea';
import { fileURLToPath } from 'node:url';

/** esbuild lo define como `true` en el build empaquetado (ver scripts/bundle-server.mjs). */
declare const __DSMN_BUNDLED__: boolean | undefined;

export const BUNDLED = typeof __DSMN_BUNDLED__ !== 'undefined' && __DSMN_BUNDLED__;

/**
 * Dónde está la web compilada. Empaquetado, va al lado del ejecutable (SEA) o de server.cjs (Docker);
 * en desarrollo, en apps/web/dist.
 */
export function webDirFor(opts: {
  bundled: boolean;
  isSea: boolean;
  execPath: string;
  scriptPath: string | undefined;
  moduleUrl: string;
  platform: NodeJS.Platform;
}): string {
  if (opts.bundled) {
    const p = opts.platform === 'win32' ? path.win32 : path.posix;
    const base = opts.isSea ? opts.execPath : (opts.scriptPath ?? opts.execPath);
    return p.join(p.dirname(base), 'web');
  }
  return fileURLToPath(new URL('../../web/dist', opts.moduleUrl));
}

export function defaultWebDir(): string {
  return webDirFor({
    bundled: BUNDLED,
    isSea: isSea(),
    execPath: process.execPath,
    scriptPath: process.argv[1],
    moduleUrl: import.meta.url,
    platform: process.platform,
  });
}

/** Mensaje para quien abrió el programa si el servidor no puede arrancar. */
export function startupErrorMessage(err: unknown, port: number): string {
  if ((err as NodeJS.ErrnoException | null)?.code === 'EADDRINUSE') {
    return `El puerto ${port} ya está en uso: ¿DontStopMeNow ya está abierto? Cerrá la otra ventana o usá DSMN_PORT.`;
  }
  return `No se pudo iniciar el servidor: ${err instanceof Error ? err.message : String(err)}`;
}

/** Comando para abrir una URL en el navegador por defecto. */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): { cmd: string; args: string[] } | null {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  if (platform === 'linux') return { cmd: 'xdg-open', args: [url] };
  return null;
}

/** El aviso experimental de node:sqlite no le sirve a quien usa el programa; los demás se muestran. */
export function installWarningFilter(): void {
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.name === 'ExperimentalWarning' && /SQLite/.test(warning.message)) return;
    console.warn(`${warning.name}: ${warning.message}`);
  });
}
