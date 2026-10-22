import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { FakeEventSource, callsTo, fakeServer, makeCatalog, renderWithProviders } from './utils.tsx';

function setup(overrides: Record<string, (body: unknown) => unknown> = {}) {
  const server = fakeServer({
    'GET /api/catalog': () => makeCatalog(),
    'GET /api/admin/roots': () => [
      { id: 1, path: 'D:\\Música', status: 'online' },
      { id: 2, path: 'E:\\Más', status: 'offline' },
    ],
    'GET /api/admin/issues': () => [
      { path: 'D:\\Música\\roto.mp3', error: 'No se detectó audio', detectedAt: 0 },
    ],
    'POST /api/admin/roots': (body) => ({ id: 3, path: (body as { path: string }).path, status: 'online' }),
    'DELETE /api/admin/roots/1': () => undefined,
    'POST /api/admin/scan': () => new Response(JSON.stringify({ started: true }), { status: 202 }),
    ...overrides,
  });
  renderWithProviders(<App />, { route: '/ajustes' });
  return server;
}

describe('ajustes', () => {
  it('muestra las carpetas con su estado', async () => {
    setup();
    expect(await screen.findByText('D:\\Música')).toBeInTheDocument();
    expect(screen.getByText('Conectada')).toBeInTheDocument();
    expect(screen.getByText('Desconectada')).toBeInTheDocument();
  });

  it('agrega una carpeta limpiando comillas y espacios', async () => {
    const server = setup();
    const input = await screen.findByRole('textbox', { name: 'Ruta de la carpeta' });
    await userEvent.type(input, '  "D:\\Música\\Rock"  ');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar carpeta' }));
    expect(callsTo(server, 'POST', '/api/admin/roots')[0]?.body).toEqual({ path: 'D:\\Música\\Rock' });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('muestra el error del servidor', async () => {
    setup({
      'POST /api/admin/roots': () =>
        new Response(
          JSON.stringify({
            error: { code: 'conflict', message: 'Se superpone con la carpeta ya agregada D:\\Música' },
          }),
          { status: 409 },
        ),
    });
    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Ruta de la carpeta' }),
      'D:\\Música\\Rock',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agregar carpeta' }));
    expect(await screen.findByText('Se superpone con la carpeta ya agregada D:\\Música')).toBeInTheDocument();
  });

  it('quita una carpeta tras confirmar', async () => {
    const server = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await screen.findByText('D:\\Música');
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0]!);
    expect(confirm.mock.calls[0]?.[0]).toContain('D:\\Música');
    expect(callsTo(server, 'DELETE', '/api/admin/roots/1')).toHaveLength(1);
  });

  it('no quita si no se confirma', async () => {
    const server = setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await screen.findByText('D:\\Música');
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0]!);
    expect(callsTo(server, 'DELETE', '/api/admin/roots/1')).toHaveLength(0);
  });

  it('reescanear llama a la API y muestra el progreso', async () => {
    const server = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Reescanear todo' }));
    expect(callsTo(server, 'POST', '/api/admin/scan')).toHaveLength(1);
    act(() => FakeEventSource.last.emit('scan', { running: true, processed: 5, total: 20 }));
    expect(screen.getAllByText('Escaneando… 5/20').length).toBeGreaterThan(0);
  });

  it('lista los archivos con problemas', async () => {
    setup();
    expect(await screen.findByText('D:\\Música\\roto.mp3')).toBeInTheDocument();
    expect(screen.getByText('No se detectó audio')).toBeInTheDocument();
  });
});
