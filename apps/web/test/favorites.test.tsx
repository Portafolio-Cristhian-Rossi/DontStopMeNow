import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { callsTo, fakeServer, makeCatalog, makeTrack, renderWithProviders } from './utils.tsx';

describe('favoritas', () => {
  it('el corazón de una fila marca la canción al instante y avisa al servidor', async () => {
    const server = fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'PUT /api/admin/favorites/t1': () => undefined,
    });
    renderWithProviders(<App />, { route: '/biblioteca/albumes/al1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar uno a favoritas' }));
    expect(screen.getByRole('button', { name: 'Quitar uno de favoritas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(callsTo(server, 'PUT', '/api/admin/favorites/t1')).toHaveLength(1);
  });

  it('si el servidor falla, el corazón vuelve atrás y se avisa', async () => {
    fakeServer({
      'GET /api/catalog': () => makeCatalog(),
      'PUT /api/admin/favorites/t1': () =>
        new Response(JSON.stringify({ error: { code: 'internal', message: 'Se cayó' } }), { status: 500 }),
    });
    renderWithProviders(<App />, { route: '/biblioteca/albumes/al1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar uno a favoritas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo agregar a favoritas: Se cayó');
    expect(screen.getByRole('button', { name: 'Agregar uno a favoritas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('Favoritas muestra las marcadas, la más reciente primero, y desmarcar la saca', async () => {
    const tracks = [
      makeTrack('t1', { title: 'uno', favoritedAt: 100 }),
      makeTrack('t2', { title: 'dos', favoritedAt: 200 }),
      makeTrack('t3', { title: 'tres' }),
    ];
    fakeServer({
      'GET /api/catalog': () => makeCatalog({ tracks }),
      'DELETE /api/admin/favorites/t2': () => undefined,
    });
    renderWithProviders(<App />, { route: '/listas/favoritas' });
    await screen.findByRole('heading', { name: 'Favoritas' });
    const titles = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[1]?.textContent);
    expect(titles()).toEqual(['dos', 'uno']);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar dos de favoritas' }));
    expect(titles()).toEqual(['uno']);
  });

  it('Listas muestra la tarjeta Favoritas con la cantidad', async () => {
    const tracks = [makeTrack('t1', { title: 'uno', favoritedAt: 100 }), makeTrack('t2', { title: 'dos' })];
    fakeServer({ 'GET /api/catalog': () => makeCatalog({ tracks }) });
    renderWithProviders(<App />, { route: '/listas' });
    const card = await screen.findByRole('link', { name: /Favoritas/ });
    expect(card).toHaveAttribute('href', '/listas/favoritas');
    expect(card).toHaveTextContent('1 canción');
  });

  it('sin favoritas explica cómo marcarlas', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    renderWithProviders(<App />, { route: '/listas/favoritas' });
    expect(await screen.findByText(/Todavía no marcaste ninguna/)).toBeInTheDocument();
  });
});
