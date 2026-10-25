import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { fakeServer, location, makeCatalog, renderWithProviders } from './utils.tsx';

function albumRoute() {
  const catalog = makeCatalog();
  const album = catalog.albums.find((a) => a.trackIds.length > 1)!;
  return { catalog, album, route: `/biblioteca/albumes/${album.id}` };
}

describe('reproducción', () => {
  it('Reproducir un álbum muestra la barra con la primera canción y resalta la fila', async () => {
    const { catalog, album, route } = albumRoute();
    fakeServer({ 'GET /api/catalog': () => catalog });
    renderWithProviders(<App />, { route });
    await userEvent.click(await screen.findByRole('button', { name: 'Reproducir' }));

    const first = catalog.tracks.find((t) => t.id === album.trackIds[0])!;
    const bar = await screen.findByRole('region', { name: 'Reproductor' });
    expect(bar).toHaveTextContent(first.title);
    expect(within(bar).getByRole('button', { name: 'Pausa' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sonando')).toBeInTheDocument();
  });

  it('el play de una fila arranca desde esa canción y la pausa se refleja en la barra', async () => {
    const { catalog, album, route } = albumRoute();
    fakeServer({ 'GET /api/catalog': () => catalog });
    renderWithProviders(<App />, { route });
    const second = catalog.tracks.find((t) => t.id === album.trackIds[1])!;
    await userEvent.click(await screen.findByRole('button', { name: `Reproducir ${second.title}` }));

    const bar = await screen.findByRole('region', { name: 'Reproductor' });
    expect(bar).toHaveTextContent(second.title);
    await userEvent.click(within(bar).getByRole('button', { name: 'Pausa' }));
    expect(within(bar).getByRole('button', { name: 'Reproducir' })).toBeInTheDocument();
  });

  it('la pantalla Reproduciendo muestra la cola y deja quitar canciones', async () => {
    const { catalog, album, route } = albumRoute();
    fakeServer({ 'GET /api/catalog': () => catalog });
    renderWithProviders(<App />, { route });
    await userEvent.click(await screen.findByRole('button', { name: 'Reproducir' }));
    await userEvent.click(screen.getByRole('link', { name: 'Ver la cola' }));
    await waitFor(() => expect(location()).toBe('/reproduciendo'));

    const panel = screen.getByRole('complementary', { name: 'Cola y ajustes' });
    const next = catalog.tracks.find((t) => t.id === album.trackIds[1])!;
    expect(within(panel).getByText(next.title)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: `Quitar ${next.title} de la cola` }));
    expect(within(panel).queryByText(next.title)).not.toBeInTheDocument();
  });

  it('en Ajustes se cambia repetir y el temporizador', async () => {
    const { catalog, route } = albumRoute();
    fakeServer({ 'GET /api/catalog': () => catalog });
    renderWithProviders(<App />, { route });
    await userEvent.click(await screen.findByRole('button', { name: 'Reproducir' }));
    await userEvent.click(screen.getByRole('link', { name: 'Ver la cola' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Ajustes' }));

    const repeat = screen.getByRole('group', { name: 'Repetir' });
    await userEvent.click(within(repeat).getByRole('button', { name: 'Una' }));
    expect(screen.getAllByRole('button', { name: 'Repetir: una' }).length).toBeGreaterThan(0);

    const sleep = screen.getByRole('group', { name: 'Temporizador para dormir' });
    await userEvent.click(within(sleep).getByRole('button', { name: 'Al terminar la canción' }));
    expect(screen.getByText('Se pausa cuando termine esta canción.')).toBeInTheDocument();
  });

  it('sin nada sonando, Reproduciendo invita a elegir un álbum', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    renderWithProviders(<App />, { route: '/reproduciendo' });
    expect(await screen.findByText(/No está sonando nada/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Reproductor' })).not.toBeInTheDocument();
  });
});
