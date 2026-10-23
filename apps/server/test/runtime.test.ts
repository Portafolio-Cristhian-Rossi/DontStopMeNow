import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserCommand,
  installWarningFilter,
  isRunningServer,
  shouldWaitForEnter,
  startupErrorMessage,
  wantsBrowser,
  webDirFor,
} from '../src/runtime.ts';

describe('webDirFor', () => {
  it('empaquetado como SEA: web junto al ejecutable, aunque la ruta tenga espacios y tildes', () => {
    expect(
      webDirFor({
        bundled: true,
        isSea: true,
        execPath: 'C:\\Users\\Cristhián\\Mis programas\\DontStopMeNow\\DontStopMeNow.exe',
        scriptPath: undefined,
        moduleUrl: 'file:///x/src/runtime.ts',
        platform: 'win32',
      }),
    ).toBe('C:\\Users\\Cristhián\\Mis programas\\DontStopMeNow\\web');
  });

  it('empaquetado con Node (Docker): web junto a server.cjs', () => {
    expect(
      webDirFor({
        bundled: true,
        isSea: false,
        execPath: '/usr/local/bin/node',
        scriptPath: '/app/server.cjs',
        moduleUrl: 'file:///x',
        platform: 'linux',
      }),
    ).toBe('/app/web');
  });

  it('en desarrollo: apps/web/dist', () => {
    expect(
      webDirFor({
        bundled: false,
        isSea: false,
        execPath: '',
        scriptPath: '',
        moduleUrl: 'file:///repo/apps/server/src/runtime.ts',
        platform: 'linux',
      }),
    ).toBe('/repo/apps/web/dist');
  });
});

describe('startupErrorMessage', () => {
  it('puerto en uso → mensaje claro', () => {
    expect(
      startupErrorMessage(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }), 4747),
    ).toBe(
      'El puerto 4747 ya está en uso: ¿DontStopMeNow ya está abierto? Cerrá la otra ventana o usá DSMN_PORT.',
    );
    expect(startupErrorMessage(new Error('boom'), 4747)).toBe('No se pudo iniciar el servidor: boom');
  });
});

describe('browserCommand', () => {
  it('por plataforma', () => {
    expect(browserCommand('win32', 'http://localhost:4747')).toEqual({
      cmd: 'cmd',
      // Un argumento vacío llega a cmd como "" (el título de la ventana que espera start).
      args: ['/c', 'start', '', 'http://localhost:4747'],
    });
    expect(browserCommand('darwin', 'http://x')).toEqual({ cmd: 'open', args: ['http://x'] });
    expect(browserCommand('linux', 'http://x')).toEqual({ cmd: 'xdg-open', args: ['http://x'] });
    expect(browserCommand('aix', 'http://x')).toBeNull();
  });
});

describe('installWarningFilter', () => {
  const original = process.listeners('warning');
  afterEach(() => {
    process.removeAllListeners('warning');
    for (const l of original) process.on('warning', l);
  });

  it('oculta solo el aviso experimental de SQLite', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installWarningFilter();
    process.emitWarning(
      'SQLite is an experimental feature and might change at any time',
      'ExperimentalWarning',
    );
    process.emitWarning('Otro aviso', 'DeprecationWarning');
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('Otro aviso');
    warn.mockRestore();
  });
});

describe('cerrar la ventana con un error', () => {
  it('solo espera Enter en el ejecutable de Windows abierto con doble clic', () => {
    expect(shouldWaitForEnter({ isSea: true, platform: 'win32', isTTY: true })).toBe(true);
    expect(shouldWaitForEnter({ isSea: false, platform: 'win32', isTTY: true })).toBe(false);
    expect(shouldWaitForEnter({ isSea: true, platform: 'linux', isTTY: true })).toBe(false);
    expect(shouldWaitForEnter({ isSea: true, platform: 'win32', isTTY: false })).toBe(false);
  });
});

describe('wantsBrowser', () => {
  it('se puede desactivar con --sin-navegador o DSMN_NO_BROWSER', () => {
    expect(wantsBrowser(['node', 'x'], {})).toBe(true);
    expect(wantsBrowser(['DontStopMeNow.exe', '--sin-navegador'], {})).toBe(false);
    expect(wantsBrowser(['x'], { DSMN_NO_BROWSER: '1' })).toBe(false);
  });
});

describe('isRunningServer', () => {
  const fetchReturning = (status: number, body: unknown) =>
    (async () => ({ status, json: async () => body })) as unknown as typeof fetch;

  it('reconoce un DontStopMeNow que ya está escuchando en el puerto', async () => {
    expect(await isRunningServer(4747, fetchReturning(200, { serverId: 'abc', tracks: [] }))).toBe(true);
  });

  it('otro programa en el puerto no cuenta', async () => {
    expect(await isRunningServer(4747, fetchReturning(200, { hola: 1 }))).toBe(false);
    expect(await isRunningServer(4747, fetchReturning(404, {}))).toBe(false);
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await isRunningServer(4747, failing)).toBe(false);
  });
});
