import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addRoot } from '../../src/library/roots.ts';
import { makeApp } from '../helpers/app.ts';
import { makeLibrary } from '../helpers/fixtures.ts';
import { makeMp3 } from '../helpers/mp3.ts';

describe('descargas retomadas', () => {
  it('el archivo lleva ETag = huella', async () => {
    const { app, deps } = await makeApp();
    addRoot(deps.db, deps.bus, await makeLibrary({ 'a.mp3': makeMp3({ title: 'v1' }) }));
    await deps.scanner.scanAll();
    const track = (await app.inject({ url: '/api/catalog' })).json().tracks[0];
    const r = await app.inject({ url: `/api/tracks/${track.id}/file` });
    expect(r.headers.etag).toBe(`"${track.fingerprint}"`);
  });

  it('If-Range: si el archivo no cambió devuelve 206; si cambió, 200 con el archivo completo', async () => {
    const { app, deps } = await makeApp();
    const dir = await makeLibrary({ 'a.mp3': makeMp3({ title: 'v1' }) });
    addRoot(deps.db, deps.bus, dir);
    await deps.scanner.scanAll();
    const track = (await app.inject({ url: '/api/catalog' })).json().tracks[0];
    const etag = `"${track.fingerprint}"`;

    const same = await app.inject({
      url: `/api/tracks/${track.id}/file`,
      headers: { range: 'bytes=10-', 'if-range': etag },
    });
    expect(same.statusCode).toBe(206);

    // El usuario edita los tags entre la descarga cortada y el reintento (mismo tamaño o no).
    const v2 = makeMp3({ title: 'v2' });
    await writeFile(join(dir, 'a.mp3'), v2);
    await deps.scanner.scanAll();
    const changed = await app.inject({
      url: `/api/tracks/${track.id}/file`,
      headers: { range: 'bytes=10-', 'if-range': etag },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.rawPayload.equals(Buffer.from(v2))).toBe(true);
    expect(changed.headers.etag).not.toBe(etag);
  });
});
