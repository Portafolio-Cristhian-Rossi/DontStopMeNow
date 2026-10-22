import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { FakeEventSource, fakeServer, location, makeCatalog, renderWithProviders } from './utils.tsx';

describe('Layout', () => {
  it('muestra el progreso del escaneo e invalida los datos al cambiar la revisión', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    const { queryClient } = renderWithProviders(<App />, { route: '/listas' });
    await screen.findByRole('navigation');
    act(() => FakeEventSource.last.emit('scan', { running: true, processed: 3, total: 10 }));
    expect(screen.getByText('Escaneando… 3/10')).toBeInTheDocument();
    for (const key of [['catalog'], ['roots'], ['issues']]) queryClient.setQueryData(key, []);
    act(() => FakeEventSource.last.emit('revision', { revision: 5 }));
    await waitFor(() => {
      for (const key of [['catalog'], ['roots'], ['issues']]) {
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
      }
    });
  });

  it('la raíz redirige a la biblioteca y la navegación tiene las cuatro secciones', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    renderWithProviders(<App />, { route: '/' });
    const nav = await screen.findByRole('navigation');
    expect(location()).toBe('/biblioteca/albumes');
    for (const name of ['Biblioteca', 'Listas', 'Ajustes', 'Dispositivos']) {
      expect(nav).toHaveTextContent(name);
    }
  });

  it('cierra el EventSource al desmontar', async () => {
    fakeServer({ 'GET /api/catalog': () => makeCatalog() });
    const { unmount } = renderWithProviders(<App />, { route: '/listas' });
    await screen.findByRole('navigation');
    const es = FakeEventSource.last;
    unmount();
    expect(es.closed).toBe(true);
  });
});
