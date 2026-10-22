import type { Playlist } from '@dsmn/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { ApiRequestError } from '../src/api/client.ts';
import { shouldRetry } from '../src/api/queryClient.ts';
import { callsTo, fakeServer, makeCatalog, makeTrack, renderWithProviders } from './utils.tsx';

afterEach(() => vi.useRealTimers());

const rowTitles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1]?.textContent);

describe('lista: orden optimista', () => {
  const playlist: Playlist = { id: 'p1', name: 'Gym', type: 'manual', folder: null, trackIds: ['t1', 't2'] };

  it('aplica el orden al instante y bloquea el arrastre mientras guarda', async () => {
    let release!: () => void;
    fakeServer({
      'GET /api/catalog': () => makeCatalog({ playlists: [playlist] }),
      'PATCH /api/admin/playlists/p1': () => new Promise((r) => (release = () => r({ ...playlist }))),
    });
    renderWithProviders(<App />, { route: '/listas/p1' });
    await screen.findByRole('heading', { name: 'Gym' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Bajar' })[0]!);
    expect(rowTitles()).toEqual(['dos', 'uno']);
    for (const handle of screen.getAllByLabelText(/^Arrastrar/)) {
      expect(handle).toHaveAttribute('aria-disabled', 'true');
    }
    release();
  });

  it('si falla el guardado vuelve al orden anterior y muestra el error', async () => {
    fakeServer({
      'GET /api/catalog': () => makeCatalog({ playlists: [playlist] }),
      'PATCH /api/admin/playlists/p1': () =>
        new Response(JSON.stringify({ error: { code: 'internal', message: 'Falló' } }), { status: 500 }),
    });
    renderWithProviders(<App />, { route: '/listas/p1' });
    await screen.findByRole('heading', { name: 'Gym' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Bajar' })[0]!);
    expect(await screen.findByText('Falló')).toBeInTheDocument();
    expect(rowTitles()).toEqual(['uno', 'dos']);
  });
});

describe('dispositivos: se actualiza al vincular', () => {
  it('muestra el celular nuevo y cambia el código usado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let devices: { id: string; name: string; createdAt: number; lastSeenAt: number | null }[] = [];
    const codes = ['PRIMER', 'SEGUND'];
    const server = fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'POST /api/admin/pairing-code': () => {
        const code = codes.shift() ?? 'OTRO22';
        return {
          code,
          expiresAt: Date.now() + 300_000,
          qrPayload: JSON.stringify({ v: 1, serverId: 's', urls: ['http://192.168.1.10:4747'], code }),
        };
      },
      'GET /api/admin/devices': () => devices,
    });
    renderWithProviders(<App />, { route: '/dispositivos' });
    expect(await screen.findByText('PRIMER')).toBeInTheDocument();
    devices = [{ id: 'd1', name: 'Pixel 8', createdAt: Date.now(), lastSeenAt: null }];
    await vi.advanceTimersByTimeAsync(3000);
    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    expect(await screen.findByText('SEGUND')).toBeInTheDocument();
    expect(callsTo(server, 'POST', '/api/admin/pairing-code')).toHaveLength(2);
  });
});

describe('canciones: bibliotecas grandes', () => {
  it('muestra hasta 500 filas y pide refinar la búsqueda', async () => {
    const tracks = Array.from({ length: 600 }, (_, i) => makeTrack(`t${i}`, { title: `Tema ${i}` }));
    fakeServer({ 'GET /api/catalog': () => makeCatalog({ tracks }) });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    expect(
      await screen.findByText('Mostrando 500 de 600. Refiná la búsqueda para ver el resto.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(501);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar canciones' }), 'Tema 59');
    await waitFor(() => expect(screen.getAllByRole('row').length).toBe(12)); // Tema 59 y Tema 590-599
    expect(screen.queryByText(/Mostrando 500/)).not.toBeInTheDocument();
  });
});

describe('reintentos', () => {
  it('no reintenta errores 4xx; reintenta una vez errores de red o 5xx', () => {
    expect(shouldRetry(0, new ApiRequestError(409, 'conflict', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiRequestError(0, 'internal', 'x'))).toBe(true);
    expect(shouldRetry(0, new ApiRequestError(502, 'internal', 'x'))).toBe(true);
    expect(shouldRetry(1, new ApiRequestError(502, 'internal', 'x'))).toBe(false);
  });
});
