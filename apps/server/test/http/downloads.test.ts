import type { AddressInfo } from 'node:net';
import type { DownloadEvent } from '@dsmn/shared';
import { describe, expect, it, vi } from 'vitest';
import { REMOTE, makeApp } from '../helpers/app.ts';
import { addRootRow, tmpDir } from '../helpers/fixtures.ts';
import { fakeCalls } from '../helpers/ytdlp.ts';

const PLAYLIST = 'https://www.youtube.com/playlist?list=PL1';

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(marker) || !/\n\n$/.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

async function setup() {
  const made = await makeApp({ downloads: true });
  const rootId = addRootRow(made.deps.db, await tmpDir());
  return { ...made, rootId };
}

describe('rutas de descargas', () => {
  it('estado de yt-dlp y guardar una ruta inválida → 400', async () => {
    const { app } = await setup();
    const s = await app.inject({ url: '/api/admin/ytdlp' });
    expect(s.statusCode).toBe(200);
    expect(s.json()).toMatchObject({ version: '2026.03.17', ffmpeg: true, error: null });
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/admin/ytdlp',
      payload: { path: 'C:\\no\\existe.exe' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toContain('No se pudo ejecutar yt-dlp');
  });

  it('preview marca no disponibles y lo que ya está en la biblioteca', async () => {
    const { app, deps, rootId } = await setup();
    deps.db
      .prepare(
        `INSERT INTO tracks (id, root_id, rel_path, size, mtime, fingerprint, title, artist, album, duration_ms, format, album_id, updated_at)
         VALUES ('t1', ?, 'a.mp3', 1, 0, 'f', 'Canción ok2', 'Canal', 'B', 0, 'mp3', 'x', 0)`,
      )
      .run(rootId);
    const r = await app.inject({
      method: 'POST',
      url: '/api/admin/downloads/preview',
      payload: { url: PLAYLIST },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      kind: 'playlist',
      ytPlaylistId: 'PL1',
      title: 'Fake Playlist',
      playlistSize: 4,
      sourceId: null,
      destination: null,
    });
    expect(r.json().entries.map((e: { selected: boolean }) => e.selected)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(r.json().entries[2]).toMatchObject({ videoId: 'ok2', inLibrary: 't1' });
  });

  it('preview: link no http → 400 sin ejecutar yt-dlp; ERROR de yt-dlp → 400 con el mensaje', async () => {
    const { app, fake } = await setup();
    const before = fakeCalls(fake!).length;
    const notHttp = await app.inject({
      method: 'POST',
      url: '/api/admin/downloads/preview',
      payload: { url: '--exec calc' },
    });
    expect(notHttp.statusCode).toBe(400);
    expect(fakeCalls(fake!)).toHaveLength(before);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/downloads/preview',
      payload: { url: 'https://www.youtube.com/watch?v=bad' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toBe('[youtube] bad: Video unavailable');
  });

  it('flujo completo: encolar, fuente guardada, buscar nuevas, quitar y olvidar', async () => {
    const { app, deps, rootId } = await setup();
    const job = await app.inject({
      method: 'POST',
      url: '/api/admin/downloads/jobs',
      payload: {
        url: PLAYLIST,
        title: 'Fake Playlist',
        kind: 'playlist',
        ytPlaylistId: 'PL1',
        playlistSize: 4,
        rootId,
        folder: 'Fake Playlist',
        items: [{ videoId: 'ok1', position: 1, title: 'Canción ok1' }],
      },
    });
    expect(job.statusCode).toBe(201);
    await deps.downloads!.queue.idle();
    const jobs = (await app.inject({ url: '/api/admin/downloads/jobs' })).json();
    expect(jobs).toEqual([expect.objectContaining({ id: job.json().id, status: 'done' })]);

    const sources = (await app.inject({ url: '/api/admin/downloads/sources' })).json();
    expect(sources).toEqual([
      expect.objectContaining({ ytPlaylistId: 'PL1', downloaded: 1, lastCheckedAt: null }),
    ]);
    const check = await app.inject({
      method: 'POST',
      url: `/api/admin/downloads/sources/${sources[0].id}/check`,
    });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({
      sourceId: sources[0].id,
      destination: { rootId, folder: 'Fake Playlist' },
    });
    expect(check.json().entries[0]).toMatchObject({
      videoId: 'ok1',
      alreadyDownloaded: true,
      selected: false,
    });
    expect(check.json().entries[2]).toMatchObject({
      videoId: 'ok2',
      alreadyDownloaded: false,
      selected: true,
    });
    expect((await app.inject({ url: '/api/admin/downloads/sources' })).json()[0].lastCheckedAt).toEqual(
      expect.any(Number),
    );

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/downloads/jobs/${job.json().id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/admin/downloads/jobs' })).json()).toEqual([]);
    const forget = await app.inject({
      method: 'DELETE',
      url: `/api/admin/downloads/sources/${sources[0].id}`,
    });
    expect(forget.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/admin/downloads/sources' })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: '/api/admin/downloads/sources/999' })).statusCode).toBe(
      404,
    );
  });

  it('cancelar, reintentar y update con una descarga en curso', async () => {
    const { app, deps, rootId } = await setup();
    const job = await app.inject({
      method: 'POST',
      url: '/api/admin/downloads/jobs',
      payload: {
        url: 'https://www.youtube.com/watch?v=hang1',
        title: 'Colgado',
        kind: 'video',
        ytPlaylistId: null,
        playlistSize: 1,
        rootId,
        folder: '',
        items: [{ videoId: 'hang1', position: null, title: 'Colgado' }],
      },
    });
    const id = job.json().id;
    await vi.waitFor(() => expect(deps.downloads!.queue.busy()).toBe(true));
    const update = await app.inject({ method: 'POST', url: '/api/admin/ytdlp/update' });
    expect(update.statusCode).toBe(409);
    expect(update.json().error.message).toBe('Hay una descarga en curso');
    const cancel = await app.inject({ method: 'POST', url: `/api/admin/downloads/jobs/${id}/cancel` });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ id, status: 'cancelled' });
    await deps.downloads!.queue.idle();
    expect(
      (await app.inject({ method: 'POST', url: `/api/admin/downloads/jobs/${id}/resume` })).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: 'POST', url: '/api/admin/downloads/jobs/999/cancel' })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/admin/ytdlp/update' })).json()).toEqual({
      version: '2026.09.01',
      output: 'Updated yt-dlp to 2026.09.01',
    });
  });

  it('el SSE reenvía los eventos de descarga', async () => {
    const { app, deps } = await setup();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const reader = (await fetch(`http://127.0.0.1:${port}/api/admin/events`)).body!.getReader();
    await readUntil(reader, 'event: revision');
    const event: DownloadEvent = { jobId: 7, status: 'running', done: 1, failed: 0, total: 3, current: null };
    deps.bus.emit('download', event);
    const text = await readUntil(reader, 'event: download');
    expect(text).toContain(`data: ${JSON.stringify(event)}`);
    await reader.cancel();
  });

  it('las rutas nuevas no responden desde la red', async () => {
    const { app } = await setup();
    for (const url of ['/api/admin/downloads/jobs', '/api/admin/ytdlp', '/api/admin/downloads/sources']) {
      expect((await app.inject({ url, remoteAddress: REMOTE })).statusCode).toBe(403);
    }
  });
});
