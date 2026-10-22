import type { Playlist } from '@dsmn/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { callsTo, fakeServer, location, makeCatalog, renderWithProviders } from './utils.tsx';

function statefulServer(initial: Playlist[]) {
  let playlists = structuredClone(initial);
  const server = fakeServer({
    'GET /api/catalog': () => makeCatalog({ playlists }),
    'GET /api/admin/roots': () => [{ id: 1, path: '/musica', status: 'online' }],
    'GET /api/admin/browse': (_b, url) => {
      const path = url.searchParams.get('path') ?? '';
      return { rootId: 1, path, folders: path === '' ? ['Rock', 'Jazz'] : [] };
    },
    'POST /api/admin/playlists': (body) => {
      const b = body as { type: 'manual' | 'folder'; name: string; rootId?: number; folderRelPath?: string };
      const p: Playlist = {
        id: 'nueva',
        name: b.name,
        type: b.type,
        folder: b.type === 'folder' ? { rootId: b.rootId!, relPath: b.folderRelPath! } : null,
        trackIds: [],
      };
      playlists = [...playlists, p];
      return p;
    },
    'PATCH /api/admin/playlists/p1': (body) => {
      playlists = playlists.map((p) => (p.id === 'p1' ? { ...p, ...(body as object) } : p));
      return playlists.find((p) => p.id === 'p1');
    },
    'DELETE /api/admin/playlists/p1': () => {
      playlists = playlists.filter((p) => p.id !== 'p1');
      return undefined;
    },
  });
  return server;
}

const manual: Playlist = {
  id: 'p1',
  name: 'Gym',
  type: 'manual',
  folder: null,
  trackIds: ['t1', 't2', 't1'],
};
const folder: Playlist = {
  id: 'p1',
  name: 'Rock',
  type: 'folder',
  folder: { rootId: 1, relPath: 'Rock' },
  trackIds: ['t1'],
};

const rowTitles = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1]?.textContent);

describe('listas', () => {
  it('lista las listas con su tipo', async () => {
    statefulServer([manual]);
    renderWithProviders(<App />, { route: '/listas' });
    const link = await screen.findByRole('link', { name: /Gym/ });
    expect(link).toHaveTextContent('Manual');
    expect(link).toHaveTextContent('3 canciones');
  });

  it('crea una lista manual y navega a ella', async () => {
    const server = statefulServer([]);
    renderWithProviders(<App />, { route: '/listas' });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre de la lista nueva' }), 'Viaje');
    await userEvent.click(screen.getByRole('button', { name: 'Crear lista' }));
    expect(callsTo(server, 'POST', '/api/admin/playlists')[0]?.body).toEqual({
      type: 'manual',
      name: 'Viaje',
    });
    await waitFor(() => expect(location()).toBe('/listas/nueva'));
  });

  it('crea una lista de carpeta navegando subcarpetas', async () => {
    const server = statefulServer([]);
    renderWithProviders(<App />, { route: '/listas' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva lista de carpeta' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre de la lista de carpeta' }), 'Rock');
    await userEvent.click(await screen.findByRole('button', { name: 'Rock' }));
    await waitFor(() => expect(screen.getByText('/musica/Rock')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Usar esta carpeta' }));
    expect(callsTo(server, 'POST', '/api/admin/playlists')[0]?.body).toEqual({
      type: 'folder',
      name: 'Rock',
      rootId: 1,
      folderRelPath: 'Rock',
    });
    await waitFor(() => expect(location()).toBe('/listas/nueva'));
  });

  it('reordena con Bajar y quita canciones, también repetidas', async () => {
    const server = statefulServer([manual]);
    renderWithProviders(<App />, { route: '/listas/p1' });
    await screen.findByRole('heading', { name: 'Gym' });
    expect(rowTitles()).toEqual(['uno', 'dos', 'uno']);
    await userEvent.click(screen.getAllByRole('button', { name: 'Bajar' })[0]!);
    expect(callsTo(server, 'PATCH', '/api/admin/playlists/p1')[0]?.body).toEqual({
      trackIds: ['t2', 't1', 't1'],
    });
    await waitFor(() => expect(rowTitles()).toEqual(['dos', 'uno', 'uno']));
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[2]!);
    expect(callsTo(server, 'PATCH', '/api/admin/playlists/p1')[1]?.body).toEqual({ trackIds: ['t2', 't1'] });
    expect(screen.getAllByRole('button', { name: 'Subir' })[0]).toBeDisabled();
  });

  it('renombra y borra', async () => {
    const server = statefulServer([manual]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<App />, { route: '/listas/p1' });
    const name = await screen.findByRole('textbox', { name: 'Nombre de la lista' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Gym 2{Enter}');
    expect(callsTo(server, 'PATCH', '/api/admin/playlists/p1')[0]?.body).toEqual({ name: 'Gym 2' });
    await userEvent.click(screen.getByRole('button', { name: 'Borrar lista' }));
    expect(callsTo(server, 'DELETE', '/api/admin/playlists/p1')).toHaveLength(1);
    await waitFor(() => expect(location()).toBe('/listas'));
  });

  it('una lista de carpeta no se puede reordenar y muestra su carpeta', async () => {
    statefulServer([folder]);
    renderWithProviders(<App />, { route: '/listas/p1' });
    expect(await screen.findByText('Carpeta: /musica/Rock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bajar' })).not.toBeInTheDocument();
    expect(rowTitles()).toEqual(['uno']);
  });

  it('lista inexistente', async () => {
    statefulServer([]);
    renderWithProviders(<App />, { route: '/listas/nope' });
    expect(await screen.findByText('Lista no encontrada')).toBeInTheDocument();
  });
});
