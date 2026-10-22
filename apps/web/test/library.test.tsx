import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { fakeServer, location, makeCatalog, makeTrack, renderWithProviders } from './utils.tsx';

const rowTitles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1]?.textContent);

describe('biblioteca', () => {
  it('lista álbumes y abre uno con sus canciones en orden', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    renderWithProviders(<App />, { route: '/biblioteca/albumes' });
    await userEvent.click(await screen.findByRole('link', { name: /Disco/ }));
    expect(location()).toBe('/biblioteca/albumes/al1');
    expect(await screen.findByRole('heading', { name: 'Disco' })).toBeInTheDocument();
    expect(rowTitles()).toEqual(['uno', 'dos']);
    expect(screen.getByText(/2001/)).toBeInTheDocument();
  });

  it('álbum inexistente', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    renderWithProviders(<App />, { route: '/biblioteca/albumes/nope' });
    expect(await screen.findByText('Álbum no encontrado')).toBeInTheDocument();
  });

  it('el buscador ignora tildes y mayúsculas', async () => {
    const tracks = [makeTrack('a', { title: 'Canción ñandú' }), makeTrack('b', { title: 'Otra' })];
    fakeServer({
      'GET /api/catalog': () =>
        makeCatalog({
          tracks,
          albums: [
            { id: 'al1', title: 'Disco', artist: 'Artista', year: null, coverId: null, trackIds: ['a', 'b'] },
          ],
        }),
    });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    await screen.findByText('Otra');
    await userEvent.type(screen.getByRole('searchbox'), 'CANCION');
    expect(rowTitles()).toEqual(['Canción ñandú']);
  });

  it('artistas enlazan a sus álbumes', async () => {
    fakeServer({
      'GET /api/catalog': () =>
        makeCatalog({
          albums: [
            { id: 'q1', title: 'Jazz', artist: 'Queen', year: null, coverId: null, trackIds: [] },
            { id: 'b1', title: 'Homogenic', artist: 'Björk', year: null, coverId: null, trackIds: [] },
          ],
        }),
    });
    renderWithProviders(<App />, { route: '/biblioteca/artistas' });
    await userEvent.click(await screen.findByRole('link', { name: /Queen/ }));
    expect(location()).toBe('/biblioteca/albumes?artista=Queen');
    expect(await screen.findByRole('link', { name: /Jazz/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Homogenic/ })).not.toBeInTheDocument();
  });

  it('muestra estado vacío con link a Ajustes', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog({ tracks: [], albums: [] }) });
    renderWithProviders(<App />, { route: '/biblioteca/albumes' });
    const empty = await screen.findByText(/Todavía no hay música/);
    expect(within(empty).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes');
  });

  it('marca canciones no disponibles', async () => {
    fakeServer({
      'GET /api/catalog': () =>
        makeCatalog({ tracks: [makeTrack('t1', { title: 'uno', available: false })] }),
    });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    expect(await screen.findByText('no disponible')).toBeInTheDocument();
  });
});
