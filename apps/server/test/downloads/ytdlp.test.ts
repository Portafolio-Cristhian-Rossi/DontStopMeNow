import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDownloadArgs } from '../../src/downloads/recipe.ts';
import { createYtDlp, jsRuntimeFor, type YtDlp } from '../../src/downloads/ytdlp.ts';
import { tmpDir } from '../helpers/fixtures.ts';
import { fakeCalls, installFakeYtDlp } from '../helpers/ytdlp.ts';

let fake: string;
let dest: string;
let tmp: string;
let yt: YtDlp;

const calls = () => fakeCalls(fake);
const lastCall = () => calls().at(-1)!.args;

const argsFor = (id: string) =>
  buildDownloadArgs({
    videoUrl: `https://www.youtube.com/watch?v=${id}`,
    destDir: dest,
    tempDir: tmp,
    position: 1,
    numberWidth: 2,
  });

beforeEach(async () => {
  fake = await installFakeYtDlp();
  dest = await tmpDir();
  tmp = await tmpDir();
  yt = createYtDlp({ command: process.execPath, prefixArgs: [fake] });
});

describe('adaptador de yt-dlp', () => {
  it('preview de playlist con un video privado', async () => {
    const p = await yt.preview('https://www.youtube.com/watch?v=x&list=PL1');
    expect(p).toMatchObject({ kind: 'playlist', ytPlaylistId: 'PL1', title: 'Fake Playlist' });
    expect(p.entries).toHaveLength(4);
    expect(p.entries[0]).toEqual({
      videoId: 'ok1',
      url: 'https://www.youtube.com/watch?v=ok1',
      title: 'Canción ok1',
      channel: 'Canal',
      durationSec: 200,
      position: 1,
      unavailable: false,
    });
    expect(p.entries[1]).toMatchObject({ position: 2, unavailable: true, channel: null });
    expect(p.entries[2]).toMatchObject({ videoId: 'ok2', url: 'https://www.youtube.com/watch?v=ok2' });
  });

  it('un video sin título ni duración (como los devuelve YouTube hoy) es no disponible', async () => {
    const p = await yt.preview('https://www.youtube.com/playlist?list=PL1');
    expect(p.entries[3]).toMatchObject({
      videoId: 'gone',
      title: 'Video no disponible',
      unavailable: true,
      position: 4,
    });
  });

  it('preview de un video suelto', async () => {
    const p = await yt.preview('https://www.youtube.com/watch?v=ok7');
    expect(p).toMatchObject({ kind: 'video', ytPlaylistId: null, title: 'Canción ok7' });
    expect(p.entries).toEqual([expect.objectContaining({ videoId: 'ok7', position: null })]);
  });

  it('preview con link inválido rechaza con el ERROR de yt-dlp', async () => {
    await expect(yt.preview('https://www.youtube.com/watch?v=bad')).rejects.toThrow(
      '[youtube] bad: Video unavailable',
    );
  });

  it('downloadOne informa progreso y devuelve el archivo', async () => {
    const stages: string[] = [];
    const r = await yt.downloadOne(
      argsFor('ok1'),
      (p) => stages.push(`${p.stage}:${p.percent}`),
      new AbortController().signal,
    );
    expect(stages).toEqual(['download:0', 'download:50', 'download:100', 'convert:null']);
    expect(r.filePath).toBe(join(dest, '01 - Canción ok1.mp3'));
    expect(existsSync(r.filePath!)).toBe(true);
  });

  it('una canción que falla rechaza con el motivo', async () => {
    await expect(yt.downloadOne(argsFor('fail1'), () => {}, new AbortController().signal)).rejects.toThrow(
      '[youtube] fail: Video unavailable',
    );
  });

  it('un link con & y comillas llega intacto como un solo argumento (sin shell)', async () => {
    const url = 'https://www.youtube.com/watch?v=x&list=PL1&x="a b"';
    await yt.preview(url);
    expect(lastCall().at(-1)).toBe(url);
    expect(lastCall().at(-2)).toBe('--');
  });

  it('previsualizar y bajar usan el Node del servidor para resolver los desafíos JS de YouTube', async () => {
    await yt.preview('https://www.youtube.com/watch?v=ok7');
    await yt.downloadOne(argsFor('ok1'), () => {}, new AbortController().signal);
    await yt.version();
    const [preview, download, version] = calls()
      .slice(-3)
      .map((c) => c.args);
    const runtime = ['--js-runtimes', `node:${process.execPath}`];
    expect(preview!.slice(0, 2)).toEqual(runtime);
    expect(download!.slice(0, 2)).toEqual(runtime);
    expect(version).toEqual(['--version']);
  });

  it('sin runtime JS (ejecutable sin node en el PATH) no pasa --js-runtimes', async () => {
    const noRuntime = createYtDlp({ command: process.execPath, prefixArgs: [fake], jsRuntime: null });
    await noRuntime.preview('https://www.youtube.com/watch?v=ok7');
    expect(lastCall()[0]).toBe('--flat-playlist');
  });

  it('jsRuntimeFor: desde el código usa el Node del servidor; en el ejecutable, el node del PATH o ninguno', () => {
    const onPath = (found: string | null) => (name: string) => (name === 'node' ? found : null);
    expect(jsRuntimeFor({ bundled: false, execPath: 'C:\\node\\node.exe', findOnPath: onPath(null) })).toBe(
      'node:C:\\node\\node.exe',
    );
    expect(
      jsRuntimeFor({
        bundled: true,
        execPath: 'C:\\App\\DontStopMeNow.exe',
        findOnPath: onPath('C:\\n\\node.exe'),
      }),
    ).toBe('node:C:\\n\\node.exe');
    expect(
      jsRuntimeFor({ bundled: true, execPath: 'C:\\App\\DontStopMeNow.exe', findOnPath: onPath(null) }),
    ).toBe(null);
  });

  it('fuerza UTF-8 en la salida de yt-dlp (títulos y rutas con tildes)', async () => {
    await yt.version();
    expect(calls().at(-1)!.pythonIoEncoding).toBe('utf-8');
  });

  it('archivo que ya existía: termina bien sin dsmn-file → filePath null', async () => {
    expect(await yt.downloadOne(argsFor('exists1'), () => {}, new AbortController().signal)).toEqual({
      filePath: null,
    });
  });

  it('cancelar y colgarse matan el proceso', async () => {
    const ac = new AbortController();
    const p = yt.downloadOne(argsFor('hang1'), () => {}, ac.signal);
    setTimeout(() => ac.abort(), 100);
    await expect(p).rejects.toThrow('Cancelada');
    const slow = createYtDlp({ command: process.execPath, prefixArgs: [fake], stallMs: 300 });
    await expect(slow.downloadOne(argsFor('hang2'), () => {}, new AbortController().signal)).rejects.toThrow(
      'No respondió',
    );
  });

  it('version y update', async () => {
    expect(await yt.version()).toBe('2026.03.17');
    expect(await yt.update()).toEqual({
      version: '2026.09.01',
      output: 'Updated yt-dlp to 2026.09.01',
    });
    expect(await yt.version()).toBe('2026.09.01');
  });
});
