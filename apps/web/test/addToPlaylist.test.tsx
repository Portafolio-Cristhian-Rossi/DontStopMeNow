import type { Playlist } from '@dsmn/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { callsTo, fakeServer, makeCatalog, renderWithProviders } from './utils.tsx';

const playlists: Playlist[] = [
  { id: 'gym', name: 'Gym', type: 'manual', folder: null, trackIds: ['t1'] },
  {
    id: 'chill',
    name: 'Carpeta Chill',
    type: 'folder',
    folder: { rootId: 1, relPath: 'Chill' },
    trackIds: [],
  },
];

function setup(route = '/biblioteca/canciones') {
  const server = fakeServer({
    'GET /api/catalog': () => makeCatalog({ playlists }),
    'PATCH /api/admin/playlists/gym': (body) => ({ ...playlists[0], ...(body as object) }),
    'POST /api/admin/playlists': (body) => ({ id: 'nueva', folder: null, ...(body as object) }),
  });
  renderWithProviders(<App />, { route });
  return server;
}

async function selectAndOpen(titles: string[]) {
  for (const t of titles)
    await userEvent.click(await screen.findByRole('checkbox', { name: `Seleccionar ${t}` }));
  await userEvent.click(screen.getByRole('button', { name: /Agregar a lista/ }));
  return screen.getByRole('dialog');
}

describe('Agregar a lista', () => {
  it('agrega al final sin duplicar', async () => {
    const server = setup();
    const dialog = await selectAndOpen(['uno', 'dos']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gym' }));
    expect(callsTo(server, 'PATCH', '/api/admin/playlists/gym')[0]?.body).toEqual({ trackIds: ['t1', 't2'] });
    expect(await screen.findByText('Agregadas 1 canciones a Gym')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si ya estaban todas no llama a la API', async () => {
    const server = setup();
    const dialog = await selectAndOpen(['uno']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gym' }));
    expect(within(dialog).getByText('Ya estaban todas en la lista')).toBeInTheDocument();
    expect(callsTo(server, 'PATCH', '/api/admin/playlists/gym')).toHaveLength(0);
  });

  it('crea una lista nueva con la selección', async () => {
    const server = setup();
    const dialog = await selectAndOpen(['dos']);
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nueva lista' }), 'Viaje');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(callsTo(server, 'POST', '/api/admin/playlists')[0]?.body).toEqual({
      type: 'manual',
      name: 'Viaje',
      trackIds: ['t2'],
    });
  });

  it('no ofrece listas de carpeta', async () => {
    setup();
    const dialog = await selectAndOpen(['uno']);
    expect(within(dialog).queryByRole('button', { name: 'Carpeta Chill' })).not.toBeInTheDocument();
  });

  it('el botón está deshabilitado sin selección', async () => {
    setup();
    expect(await screen.findByRole('button', { name: /Agregar a lista/ })).toBeDisabled();
  });

  it('desde un álbum agrega todas sus canciones', async () => {
    const server = setup('/biblioteca/albumes/al1');
    await userEvent.click(await screen.findByRole('button', { name: /Agregar a lista/ }));
    await userEvent.type(
      within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Nueva lista' }),
      'Todo',
    );
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear' }));
    expect(callsTo(server, 'POST', '/api/admin/playlists')[0]?.body).toMatchObject({
      trackIds: ['t1', 't2'],
    });
  });
});
