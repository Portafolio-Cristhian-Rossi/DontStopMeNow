import type { YtDlpStatus } from '@dsmn/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { FakeEventSource, callsTo, fakeServer, makeCatalog, renderWithProviders } from './utils.tsx';

const NOT_SET: YtDlpStatus = {
  path: null,
  version: null,
  ffmpeg: true,
  suggestedPath: 'D:\\Music\\yt-dlp.exe',
  error: null,
};

function setup(status: YtDlpStatus = NOT_SET, overrides: Record<string, (body: unknown) => unknown> = {}) {
  let current = status;
  const server = fakeServer({
    'GET /api/catalog': () => makeCatalog(),
    'GET /api/admin/roots': () => [],
    'GET /api/admin/issues': () => [],
    'GET /api/admin/ytdlp': () => current,
    'PUT /api/admin/ytdlp': (body) => {
      current = { ...current, path: (body as { path: string }).path, version: '2026.03.17' };
      return current;
    },
    ...overrides,
  });
  const rendered = renderWithProviders(<App />, { route: '/ajustes' });
  return { server, ...rendered };
}

describe('ajustes de yt-dlp', () => {
  it('propone la ruta sugerida, guarda y muestra la versión', async () => {
    const { server } = setup();
    const input = await screen.findByRole('textbox', { name: 'Ruta de yt-dlp' });
    await waitFor(() => expect(input).toHaveValue('D:\\Music\\yt-dlp.exe'));
    expect(screen.getByText('yt-dlp no está configurado')).toBeInTheDocument();
    expect(screen.getByText('ffmpeg: encontrado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(callsTo(server, 'PUT', '/api/admin/ytdlp')[0]?.body).toEqual({ path: 'D:\\Music\\yt-dlp.exe' });
    expect(await screen.findByText('Versión 2026.03.17')).toBeInTheDocument();
  });

  it('muestra el error al guardar una ruta que no anda', async () => {
    setup(NOT_SET, {
      'PUT /api/admin/ytdlp': () =>
        new Response(
          JSON.stringify({
            error: { code: 'bad_request', message: 'No se pudo ejecutar yt-dlp: spawn ENOENT' },
          }),
          { status: 400 },
        ),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('No se pudo ejecutar yt-dlp: spawn ENOENT')).toBeInTheDocument();
  });

  it('actualizar muestra la salida o el error tal cual', async () => {
    let busy = true;
    setup(
      { ...NOT_SET, path: 'D:\\Music\\yt-dlp.exe', version: '2026.03.17' },
      {
        'POST /api/admin/ytdlp/update': () =>
          busy
            ? new Response(
                JSON.stringify({ error: { code: 'conflict', message: 'Hay una descarga en curso' } }),
                { status: 409 },
              )
            : { version: '2026.09.01', output: 'Updated yt-dlp to 2026.09.01' },
      },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Hay una descarga en curso')).toBeInTheDocument();
    busy = false;
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Updated yt-dlp to 2026.09.01')).toBeInTheDocument();
  });

  it('sin ffmpeg lo avisa', async () => {
    setup({ ...NOT_SET, ffmpeg: false });
    expect(
      await screen.findByText('ffmpeg: no encontrado (instalalo y reiniciá el servidor)'),
    ).toBeInTheDocument();
  });

  it('una ruta guardada que dejó de andar muestra el motivo', async () => {
    setup({ ...NOT_SET, path: 'C:\\roto.exe', error: 'No se pudo ejecutar yt-dlp: spawn ENOENT' });
    expect(await screen.findByText('No se pudo ejecutar yt-dlp: spawn ENOENT')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ruta de yt-dlp' })).toHaveValue('C:\\roto.exe');
  });
});

describe('eventos de descargas', () => {
  it('refresca al cambiar el estado o al terminar/fallar una canción; el porcentaje solo, no', async () => {
    const { queryClient } = setup();
    await screen.findByRole('navigation');
    const keys = [['download-jobs'], ['yt-sources']];
    const reset = () => {
      for (const key of keys) queryClient.setQueryData(key, []);
    };
    const invalidated = () => keys.map((key) => queryClient.getQueryState(key)?.isInvalidated);
    const event = (status: string, done: number, failed: number, percent: number | null) => ({
      jobId: 1,
      status,
      done,
      failed,
      total: 3,
      current: status === 'running' ? { videoId: 'a', title: 'A', stage: 'download', percent } : null,
    });

    reset();
    act(() => FakeEventSource.last.emit('download', event('running', 0, 0, 0)));
    await waitFor(() => expect(invalidated()).toEqual([true, true]));

    reset();
    act(() => FakeEventSource.last.emit('download', event('running', 0, 0, 40)));
    expect(invalidated()).toEqual([false, false]);

    act(() => FakeEventSource.last.emit('download', event('running', 1, 0, 0)));
    await waitFor(() => expect(invalidated()).toEqual([true, true]));

    reset();
    act(() => FakeEventSource.last.emit('download', event('running', 1, 1, 0)));
    await waitFor(() => expect(invalidated()).toEqual([true, true]));

    reset();
    act(() => FakeEventSource.last.emit('download', event('done', 2, 1, null)));
    await waitFor(() => expect(invalidated()).toEqual([true, true]));
  });
});
