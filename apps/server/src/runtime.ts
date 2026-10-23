import path from 'node:path';
import { createInterface } from 'node:readline';
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
  // start toma el primer argumento entre comillas como título de la ventana: va uno vacío.
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
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

/** Si se abre el navegador al arrancar. El acceso directo de inicio de Windows usa --sin-navegador. */
export function wantsBrowser(argv: string[], env: NodeJS.ProcessEnv): boolean {
  return !argv.includes('--sin-navegador') && env.DSMN_NO_BROWSER !== '1';
}

/** ¿Ya hay un DontStopMeNow escuchando en ese puerto de esta compu? */
export async function isRunningServer(port: number, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(`http://127.0.0.1:${port}/api/catalog`, { signal: AbortSignal.timeout(2000) });
    if (res.status !== 200) return false;
    const body = (await res.json()) as { serverId?: unknown } | null;
    return typeof body?.serverId === 'string';
  } catch {
    return false;
  }
}

/**
 * Abierto con doble clic en Windows, la consola se cierra al salir y el mensaje de error
 * no llega a leerse: en ese caso se espera un Enter.
 */
export function shouldWaitForEnter(opts: {
  isSea: boolean;
  platform: NodeJS.Platform;
  isTTY: boolean | undefined;
}): boolean {
  return opts.isSea && opts.platform === 'win32' && opts.isTTY === true;
}

/** Muestra el error a quien abrió el programa y termina. */
export async function exitWithError(message: string): Promise<never> {
  console.error(message);
  if (shouldWaitForEnter({ isSea: isSea(), platform: process.platform, isTTY: process.stdin.isTTY })) {
    console.error('Presioná Enter para cerrar.');
    const rl = createInterface({ input: process.stdin });
    await new Promise<void>((resolve) => rl.once('line', () => resolve()));
    rl.close();
  }
  process.exit(1);
}
