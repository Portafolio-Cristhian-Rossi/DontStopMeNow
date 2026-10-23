import type { DownloadItem, DownloadJob, Preview, YtDlpStatus, YtSource } from '@dsmn/shared';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { FakeEventSource, callsTo, fakeServer, makeCatalog, renderWithProviders } from './utils.tsx';

const READY: YtDlpStatus = {
  path: 'D:\\Music\\yt-dlp.exe',
  version: '2026.03.17',
  ffmpeg: true,
  suggestedPath: null,
  error: null,
};

const item = (videoId: string, partial: Partial<DownloadItem> = {}): DownloadItem => ({
  videoId,
  position: 1,
  title: `Canción ${videoId}`,
  status: 'pending',
  error: null,
  filePath: null,
  ...partial,
});

const job = (id: number, partial: Partial<DownloadJob> = {}): DownloadJob => ({
  id,
  sourceId: null,
  url: 'https://www.youtube.com/playlist?list=PL1',
  title: `Trabajo ${id}`,
  rootId: 1,
  folder: 'P',
  status: 'pending',
  pauseReason: null,
  createdAt: 0,
  finishedAt: null,
  items: [item('a')],
  ...partial,
});

const SOURCE: YtSource = {
  id: 1,
  url: 'https://www.youtube.com/playlist?list=PL1',
  ytPlaylistId: 'PL1',
  title: 'Persona 3-4-5 Best Tracks',
  rootId: 1,
  folder: 'Persona 3-4-5 Best Tracks',
  playlistId: 'pl',
  downloaded: 50,
  createdAt: 0,
  lastCheckedAt: null,
};

const CHECK: Preview = {
  kind: 'playlist',
  ytPlaylistId: 'PL1',
  title: 'Persona 3-4-5 Best Tracks',
  url: SOURCE.url,
  playlistSize: 2,
  sourceId: 1,
  destination: { rootId: 1, folder: 'Persona 3-4-5 Best Tracks' },
  entries: [
    {
      videoId: 'n',
      url: 'https://www.youtube.com/watch?v=n',
      title: 'Canción nueva',
      channel: null,
      durationSec: 200,
      position: 55,
      unavailable: false,
      duplicateOf: null,
      inLibrary: null,
      versionGroup: null,
      versionTags: [],
      alreadyDownloaded: false,
      selected: true,
    },
  ],
};

function setup(jobs: DownloadJob[], sources: YtSource[] = []) {
  const server = fakeServer({
    'GET /api/catalog': () => makeCatalog(),
    'GET /api/admin/roots': () => [{ id: 1, path: 'D:\\Music', status: 'online' }],
    'GET /api/admin/ytdlp': () => READY,
    'GET /api/admin/downloads/jobs': () => jobs,
    'GET /api/admin/downloads/sources': () => sources,
    'POST /api/admin/downloads/jobs/1/cancel': () => job(1, { status: 'cancelled' }),
    'POST /api/admin/downloads/jobs/2/resume': () => job(2),
    'POST /api/admin/downloads/jobs/3/retry': () => job(3),
    'DELETE /api/admin/downloads/jobs/3': () => undefined,
    'POST /api/admin/downloads/sources/1/check': () => CHECK,
    'DELETE /api/admin/downloads/sources/1': () => undefined,
  });
  renderWithProviders(<App />, { route: '/descargar' });
  return server;
}

const row = async (title: string) => (await screen.findByText(title)).closest('li')!;

describe('cola de descargas', () => {
  it('muestra el progreso en vivo del trabajo en curso', async () => {
    setup([job(1, { status: 'running', items: [item('a', { status: 'done' }), item('b'), item('c')] })]);
    const li = await row('Trabajo 1');
    expect(within(li).getByText('Bajando')).toBeInTheDocument();
    act(() =>
      FakeEventSource.last.emit('download', {
        jobId: 1,
        status: 'running',
        done: 1,
        failed: 0,
        total: 3,
        current: { videoId: 'b', title: 'Burn My Dread', stage: 'download', percent: 43.4 },
      }),
    );
    expect(within(li).getByText('1/3')).toBeInTheDocument();
    expect(within(li).getByText('Burn My Dread 43%')).toBeInTheDocument();
    act(() =>
      FakeEventSource.last.emit('download', {
        jobId: 1,
        status: 'running',
        done: 1,
        failed: 0,
        total: 3,
        current: { videoId: 'b', title: 'Burn My Dread', stage: 'convert', percent: null },
      }),
    );
    expect(within(li).getByText('Burn My Dread: convirtiendo…')).toBeInTheDocument();
  });

  it('botones según el estado llaman a la API', async () => {
    const server = setup([
      job(1, { status: 'running' }),
      job(2, { status: 'paused', pauseReason: 'YouTube está limitando las descargas' }),
      job(3, {
        status: 'done',
        items: [item('a', { status: 'failed', error: 'Video unavailable' }), item('b', { status: 'done' })],
      }),
    ]);
    const running = await row('Trabajo 1');
    expect(within(running).queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();
    await userEvent.click(within(running).getByRole('button', { name: 'Cancelar' }));
    expect(callsTo(server, 'POST', '/api/admin/downloads/jobs/1/cancel')).toHaveLength(1);

    const paused = await row('Trabajo 2');
    expect(within(paused).getByText('Pausado: YouTube está limitando las descargas')).toBeInTheDocument();
    await userEvent.click(within(paused).getByRole('button', { name: 'Reanudar' }));
    expect(callsTo(server, 'POST', '/api/admin/downloads/jobs/2/resume')).toHaveLength(1);

    const done = await row('Trabajo 3');
    expect(within(done).getByText('Terminado')).toBeInTheDocument();
    expect(within(done).getByText('1/2 · 1 fallida')).toBeInTheDocument();
    expect(within(done).getByText('Canción a: falló: Video unavailable')).toBeInTheDocument();
    await userEvent.click(within(done).getByRole('button', { name: 'Reintentar fallidas' }));
    expect(callsTo(server, 'POST', '/api/admin/downloads/jobs/3/retry')).toHaveLength(1);
    await userEvent.click(within(done).getByRole('button', { name: 'Quitar' }));
    expect(callsTo(server, 'DELETE', '/api/admin/downloads/jobs/3')).toHaveLength(1);
  });

  it('un error de la API se muestra', async () => {
    fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'GET /api/admin/roots': () => [],
      'GET /api/admin/ytdlp': () => READY,
      'GET /api/admin/downloads/jobs': () => [job(5, { status: 'paused', pauseReason: 'x' })],
      'GET /api/admin/downloads/sources': () => [],
      'POST /api/admin/downloads/jobs/5/resume': () =>
        new Response(JSON.stringify({ error: { code: 'conflict', message: 'El trabajo no está pausado' } }), {
          status: 409,
        }),
    });
    renderWithProviders(<App />, { route: '/descargar' });
    await userEvent.click(within(await row('Trabajo 5')).getByRole('button', { name: 'Reanudar' }));
    expect(await screen.findByText('El trabajo no está pausado')).toBeInTheDocument();
  });

  it('sin nada en la cola lo dice', async () => {
    setup([]);
    expect(await screen.findByText('No hay descargas en la cola.')).toBeInTheDocument();
  });
});

describe('playlists de YouTube guardadas', () => {
  it('muestra cada playlist con su ruta y cuántas canciones se bajaron', async () => {
    setup([], [SOURCE]);
    const li = await row('Persona 3-4-5 Best Tracks');
    expect(within(li).getByText('D:\\Music\\Persona 3-4-5 Best Tracks')).toBeInTheDocument();
    expect(within(li).getByText('50 canciones · nunca revisada')).toBeInTheDocument();
  });

  it('Buscar nuevas abre la previsualización de esa playlist', async () => {
    const server = setup([], [SOURCE]);
    await userEvent.click(
      within(await row('Persona 3-4-5 Best Tracks')).getByRole('button', { name: 'Buscar nuevas' }),
    );
    expect(callsTo(server, 'POST', '/api/admin/downloads/sources/1/check')).toHaveLength(1);
    expect(await screen.findByText('Se guarda en la misma carpeta que la vez anterior')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Canción nueva' })).toBeChecked();
  });

  it('Olvidar pide confirmación', async () => {
    const server = setup([], [SOURCE]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const li = await row('Persona 3-4-5 Best Tracks');
    await userEvent.click(within(li).getByRole('button', { name: 'Olvidar' }));
    expect(confirm.mock.calls[0]?.[0]).toBe(
      'Se deja de seguir Persona 3-4-5 Best Tracks. Los archivos y la lista no se borran.',
    );
    expect(callsTo(server, 'DELETE', '/api/admin/downloads/sources/1')).toHaveLength(0);
    confirm.mockReturnValue(true);
    await userEvent.click(within(li).getByRole('button', { name: 'Olvidar' }));
    expect(callsTo(server, 'DELETE', '/api/admin/downloads/sources/1')).toHaveLength(1);
  });
});
