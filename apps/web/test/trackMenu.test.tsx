import type { Playlist } from '@dsmn/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { callsTo, fakeServer, location, makeCatalog, makeTrack, renderWithProviders } from './utils.tsx';

const tracks = [
  makeTrack('t1', { title: 'uno', trackNo: 1 }),
  makeTrack('t2', { title: 'dos', trackNo: 2 }),
  makeTrack('t3', { title: 'tres', trackNo: 3 }),
];
const catalog = () =>
  makeCatalog({
    tracks,
    albums: [
      {
        id: 'al1',
        title: 'Disco',
        artist: 'Artista',
        year: 2001,
        coverId: null,
        trackIds: ['t1', 't2', 't3'],
      },
    ],
  });

async function openMenu(title: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Más opciones para ${title}` }));
  return screen.getByRole('menu', { name: `Opciones para ${title}` });
}

const upcoming = () =>
  within(screen.getByRole('complementary', { name: 'Cola y ajustes' }))
    .getAllByRole('button', { name: /^(uno|dos|tres)/ })
    .map((b) => b.textContent?.replace(/\d+:\d+$/, ''));

describe('menú de cada canción', () => {
  it('"a continuación" va antes que lo que ya estaba y "a la cola" al final', async () => {
    fakeServer({ 'GET /api/catalog': catalog });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    await userEvent.click(await screen.findByRole('button', { name: 'Reproducir uno' }));
    // La búsqueda arma la cola uno, dos, tres; se agregan tres a continuación y uno al final.
    await userEvent.click(
      within(await openMenu('tres')).getByRole('menuitem', { name: 'Reproducir a continuación' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Suena a continuación: tres');
    await userEvent.click(within(await openMenu('uno')).getByRole('menuitem', { name: 'Agregar a la cola' }));
    await userEvent.click(screen.getByRole('link', { name: 'Ver la cola' }));
    expect(upcoming()).toEqual(['tres', 'dos', 'tres', 'uno']);
  });

  it('con la cola vacía, "a la cola" empieza a sonar esa canción', async () => {
    fakeServer({ 'GET /api/catalog': catalog });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    await userEvent.click(within(await openMenu('dos')).getByRole('menuitem', { name: 'Agregar a la cola' }));
    expect(await screen.findByRole('region', { name: 'Reproductor' })).toHaveTextContent('dos');
  });

  it('"Agregar a lista…" abre el diálogo y agrega la canción', async () => {
    const gym: Playlist = { id: 'gym', name: 'Gym', type: 'manual', folder: null, trackIds: ['t1'] };
    const server = fakeServer({
      'GET /api/catalog': () => ({ ...catalog(), playlists: [gym] }),
      'PATCH /api/admin/playlists/gym': (body) => ({ ...gym, ...(body as object) }),
    });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    await userEvent.click(within(await openMenu('dos')).getByRole('menuitem', { name: 'Agregar a lista…' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Gym' }));
    expect(callsTo(server, 'PATCH', '/api/admin/playlists/gym')[0]?.body).toEqual({ trackIds: ['t1', 't2'] });
    expect(await screen.findByRole('alert')).toHaveTextContent('Agregadas 1 canciones a Gym');
  });

  it('Escape cierra el menú y devuelve el foco al botón', async () => {
    fakeServer({ 'GET /api/catalog': catalog });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    const menu = await openMenu('uno');
    expect(within(menu).getByRole('menuitem', { name: 'Reproducir a continuación' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Agregar a la cola' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Más opciones para uno' })).toHaveFocus();
  });

  it('"Ir al álbum" navega, y en la página del álbum no aparece', async () => {
    fakeServer({ 'GET /api/catalog': catalog });
    renderWithProviders(<App />, { route: '/biblioteca/canciones' });
    await userEvent.click(within(await openMenu('dos')).getByRole('menuitem', { name: 'Ir al álbum' }));
    await waitFor(() => expect(location()).toBe('/biblioteca/albumes/al1'));
    expect(
      within(await openMenu('dos')).queryByRole('menuitem', { name: 'Ir al álbum' }),
    ).not.toBeInTheDocument();
  });
});
