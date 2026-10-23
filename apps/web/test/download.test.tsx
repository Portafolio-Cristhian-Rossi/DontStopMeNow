import type { AnalyzedEntry, Preview, Root, YtDlpStatus } from '@dsmn/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { callsTo, fakeServer, makeCatalog, renderWithProviders } from './utils.tsx';

const READY: YtDlpStatus = {
  path: 'D:\\Music\\yt-dlp.exe',
  version: '2026.03.17',
  ffmpeg: true,
  suggestedPath: null,
  error: null,
};
const ROOTS: Root[] = [
  { id: 1, path: 'D:\\Music', status: 'online' },
  { id: 2, path: 'E:\\Viejo', status: 'offline' },
];

const entry = (videoId: string, position: number, partial: Partial<AnalyzedEntry> = {}): AnalyzedEntry => ({
  videoId,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  title: `Canción ${videoId}`,
  channel: null,
  durationSec: 245,
  position,
  unavailable: false,
  duplicateOf: null,
  inLibrary: null,
  versionGroup: null,
  versionTags: [],
  alreadyDownloaded: false,
  selected: true,
  ...partial,
});

const PREVIEW: Preview = {
  kind: 'playlist',
  ytPlaylistId: 'PL1',
  title: 'AC/DC: Hits?',
  url: 'https://www.youtube.com/playlist?list=PL1',
  playlistSize: 4,
  sourceId: null,
  destination: null,
  entries: [
    entry('a', 1),
    entry('b', 2, { duplicateOf: 'a', selected: false }),
    entry('c', 3, { inLibrary: 't1', selected: false }),
    entry('d', 4, { title: 'Video no disponible', durationSec: null, unavailable: true, selected: false }),
  ],
};

function setup(
  preview: Preview | (() => unknown) = PREVIEW,
  { ytdlp = READY, roots = ROOTS }: { ytdlp?: YtDlpStatus; roots?: Root[] } = {},
) {
  const server = fakeServer({
    'GET /api/catalog': () => makeCatalog(),
    'GET /api/admin/roots': () => roots,
    'GET /api/admin/ytdlp': () => ytdlp,
    'GET /api/admin/downloads/jobs': () => [],
    'GET /api/admin/downloads/sources': () => [],
    'POST /api/admin/downloads/preview': () => (typeof preview === 'function' ? preview() : preview),
    'POST /api/admin/downloads/jobs': (body) => ({
      id: 9,
      ...(body as object),
      status: 'pending',
      items: [],
    }),
  });
  renderWithProviders(<App />, { route: '/descargar' });
  return server;
}

async function look(url = 'https://www.youtube.com/playlist?list=PL1') {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Link de YouTube' }), url);
  await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
}

const box = (title: string) => screen.getByRole('checkbox', { name: title });

describe('descargar', () => {
  it('la pestaña Descargar está entre Listas y Ajustes', async () => {
    setup();
    const links = within(await screen.findByRole('navigation')).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Biblioteca',
      'Listas',
      'Descargar',
      'Ajustes',
      'Dispositivos',
    ]);
  });

  it('ver un link muestra la previsualización con las casillas por defecto', async () => {
    const server = setup();
    await look();
    expect(await screen.findByText('Repetida de #01')).toBeInTheDocument();
    expect(callsTo(server, 'POST', '/api/admin/downloads/preview')[0]?.body).toEqual({
      url: 'https://www.youtube.com/playlist?list=PL1',
    });
    expect(screen.getByText('Ya en tu biblioteca')).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(screen.getByText('4 videos')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 elegidas')).toBeInTheDocument();
    expect(box('Canción a')).toBeChecked();
    expect(box('Canción b')).not.toBeChecked();
    expect(box('Video no disponible')).toBeDisabled();
    expect(screen.getAllByText('4:05')).toHaveLength(3);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('Todas, Ninguna y encolar mandan lo elegido con la subcarpeta saneada', async () => {
    const server = setup();
    await look();
    expect(await screen.findByRole('textbox', { name: 'Subcarpeta' })).toHaveValue('AC_DC_ Hits_');
    expect(screen.getByRole('combobox', { name: 'Carpeta de música' })).toHaveDisplayValue('D:\\Music');
    await userEvent.click(screen.getByRole('button', { name: 'Ninguna' }));
    expect(screen.getByText('0 de 3 elegidas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar a la cola' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getByText('3 de 3 elegidas')).toBeInTheDocument();
    await userEvent.click(box('Canción c'));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar a la cola' }));
    expect(callsTo(server, 'POST', '/api/admin/downloads/jobs')[0]?.body).toEqual({
      url: 'https://www.youtube.com/playlist?list=PL1',
      title: 'AC/DC: Hits?',
      kind: 'playlist',
      ytPlaylistId: 'PL1',
      playlistSize: 4,
      rootId: 1,
      folder: 'AC_DC_ Hits_',
      items: [
        { videoId: 'a', position: 1, title: 'Canción a' },
        { videoId: 'b', position: 2, title: 'Canción b' },
      ],
    });
    await waitFor(() => expect(screen.queryByText('Repetida de #01')).not.toBeInTheDocument());
    expect(screen.getByText('Agregado a la cola: AC/DC: Hits?')).toBeInTheDocument();
  });

  it('las versiones dicen con qué otros videos se agrupan, sin desmarcarse', async () => {
    setup({
      ...PREVIEW,
      entries: [
        entry('j', 1, { title: 'Persona 3 OST - Joy', versionGroup: 'joy' }),
        entry('x', 2),
        entry('r', 3, { title: 'Joy (P3R ver.)', versionGroup: 'joy', versionTags: ['p3r ver'] }),
      ],
    });
    await look();
    expect(await screen.findByText('Versión: original (también #03)')).toBeInTheDocument();
    expect(screen.getByText('Versión: p3r ver (también #01)')).toBeInTheDocument();
    expect(box('Joy (P3R ver.)')).toBeChecked();
  });

  it('un video suelto va sin subcarpeta', async () => {
    setup({
      ...PREVIEW,
      kind: 'video',
      ytPlaylistId: null,
      title: 'Un tema',
      playlistSize: 1,
      entries: [entry('v', 0, { position: null })],
    });
    await look('https://www.youtube.com/watch?v=v');
    expect(await screen.findByRole('textbox', { name: 'Subcarpeta' })).toHaveValue('');
  });

  it('playlist guardada: destino fijo y ya descargadas plegadas', async () => {
    setup({
      ...PREVIEW,
      sourceId: 3,
      destination: { rootId: 1, folder: 'AC_DC_ Hits_' },
      entries: [
        entry('a', 1, { alreadyDownloaded: true, selected: false }),
        entry('b', 2, { alreadyDownloaded: true, selected: false }),
        entry('n', 3),
      ],
    });
    await look();
    expect(await screen.findByText('Se guarda en la misma carpeta que la vez anterior')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Carpeta de música' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Subcarpeta' })).toBeDisabled();
    expect(screen.getByText('2 ya descargadas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(box('Canción a')).not.toBeChecked();
    expect(box('Canción n')).toBeChecked();
  });

  it('sin yt-dlp avisa y no deja encolar', async () => {
    setup(PREVIEW, { ytdlp: { ...READY, path: null, version: null } });
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Para descargar, configurá yt-dlp en Ajustes');
    expect(within(notice).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes');
    await look();
    await screen.findByText('Repetida de #01');
    expect(screen.getByRole('button', { name: 'Agregar a la cola' })).toBeDisabled();
  });

  it('sin carpetas de música conectadas lo avisa', async () => {
    setup(PREVIEW, { roots: [ROOTS[1]!] });
    await look();
    expect(await screen.findByText('Agregá o conectá una carpeta de música en Ajustes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar a la cola' })).toBeDisabled();
  });

  it('muestra el error del link tal cual', async () => {
    setup(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'bad_request', message: '[youtube] bad: Video unavailable' } }),
          { status: 400 },
        ),
    );
    await look('https://www.youtube.com/watch?v=bad');
    expect(await screen.findByText('[youtube] bad: Video unavailable')).toBeInTheDocument();
  });
});
