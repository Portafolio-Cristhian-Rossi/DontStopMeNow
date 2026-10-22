import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { callsTo, fakeServer, makeCatalog, renderWithProviders } from './utils.tsx';

afterEach(() => {
  vi.useRealTimers();
});

function pairing(code: string, ttlMs: number) {
  return {
    code,
    expiresAt: Date.now() + ttlMs,
    qrPayload: JSON.stringify({ v: 1, serverId: 's', urls: ['http://192.168.1.10:4747'], code }),
  };
}

describe('dispositivos', () => {
  it('muestra el código, el QR y la cuenta regresiva', async () => {
    fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'POST /api/admin/pairing-code': () => pairing('ABC234', 300_000),
      'GET /api/admin/devices': () => [],
    });
    renderWithProviders(<App />, { route: '/dispositivos' });
    expect(await screen.findByText('ABC234')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Código QR de vinculación' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
    expect(screen.getByText(/Vence en (5:00|4:59)/)).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay celulares vinculados.')).toBeInTheDocument();
  });

  it('regenera el código al vencer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const codes = ['PRIMER', 'SEGUND'];
    const server = fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'POST /api/admin/pairing-code': () => pairing(codes.shift() ?? 'OTRO22', 2000),
      'GET /api/admin/devices': () => [],
    });
    renderWithProviders(<App />, { route: '/dispositivos' });
    expect(await screen.findByText('PRIMER')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2100);
    expect(await screen.findByText('SEGUND')).toBeInTheDocument();
    expect(callsTo(server, 'POST', '/api/admin/pairing-code')).toHaveLength(2);
  });

  it('sin red local muestra el mensaje del servidor', async () => {
    fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'POST /api/admin/pairing-code': () =>
        new Response(
          JSON.stringify({
            error: { code: 'conflict', message: 'La compu no está conectada a una red local' },
          }),
          { status: 409 },
        ),
      'GET /api/admin/devices': () => [],
    });
    renderWithProviders(<App />, { route: '/dispositivos' });
    expect(await screen.findByText('La compu no está conectada a una red local')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Código QR de vinculación' })).not.toBeInTheDocument();
  });

  it('revoca un dispositivo', async () => {
    let devices = [
      { id: 'd1', name: 'Pixel 8', createdAt: Date.UTC(2026, 9, 1), lastSeenAt: null as number | null },
    ];
    const server = fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'POST /api/admin/pairing-code': () => pairing('ABC234', 300_000),
      'GET /api/admin/devices': () => devices,
      'DELETE /api/admin/devices/d1': () => {
        devices = [];
        return undefined;
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<App />, { route: '/dispositivos' });
    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    expect(screen.getByText(/Nunca/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    expect(callsTo(server, 'DELETE', '/api/admin/devices/d1')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText('Pixel 8')).not.toBeInTheDocument());
  });
});
