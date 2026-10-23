import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Root } from '@dsmn/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createYtDlpSettings, findOnPath } from '../../src/downloads/settings.ts';
import type { YtDlp } from '../../src/downloads/ytdlp.ts';
import { makeDb, tmpDir } from '../helpers/fixtures.ts';

let db: DatabaseSync;
beforeEach(() => {
  db = makeDb();
});

const exeName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const music = path.join(path.parse(process.cwd()).root, 'Music');

/** yt-dlp que responde --version, o que falla si el comando contiene "roto". */
const fakeFactory = (command: string): YtDlp =>
  ({
    version: async () => {
      if (command.includes('roto')) throw new Error('spawn ENOENT');
      return '2026.03.17';
    },
  }) as YtDlp;

function settings(over: Partial<Parameters<typeof createYtDlpSettings>[0]> = {}) {
  return createYtDlpSettings({
    db,
    roots: (): Root[] => [{ id: 1, path: music, status: 'online' }],
    findOnPath: (n) => (n === 'ffmpeg' ? 'C:\\ff\\ffmpeg.exe' : null),
    exists: (p) => p === path.join(music, exeName),
    makeYtDlp: fakeFactory,
    ...over,
  });
}

describe('ajustes de yt-dlp', () => {
  it('sugiere el yt-dlp de una carpeta de música y detecta ffmpeg', async () => {
    expect(await settings().status()).toEqual({
      path: null,
      version: null,
      ffmpeg: true,
      suggestedPath: path.join(music, exeName),
      error: null,
    });
  });

  it('prefiere el yt-dlp del PATH y avisa si falta ffmpeg', async () => {
    const s = settings({ findOnPath: (n) => (n === 'yt-dlp' ? '/usr/bin/yt-dlp' : null) });
    expect(await s.status()).toMatchObject({ suggestedPath: '/usr/bin/yt-dlp', ffmpeg: false });
  });

  it('setPath valida con --version y no guarda si falla', async () => {
    const s = settings();
    await expect(s.setPath('C:\\roto\\yt-dlp.exe')).rejects.toMatchObject({
      status: 400,
      message: 'No se pudo ejecutar yt-dlp: spawn ENOENT',
    });
    expect((await s.status()).path).toBeNull();
    expect(s.current()).toBeNull();
    expect(await s.setPath('  D:\\Music\\yt-dlp.exe ')).toMatchObject({
      path: 'D:\\Music\\yt-dlp.exe',
      version: '2026.03.17',
    });
    expect(s.current()).not.toBeNull();
    expect((await settings().status()).path).toBe('D:\\Music\\yt-dlp.exe');
  });

  it('si la ruta guardada deja de funcionar, status lo informa', async () => {
    const s = settings();
    await s.setPath('D:\\Music\\yt-dlp.exe');
    db.prepare("UPDATE meta SET value = 'C:\\roto\\yt-dlp.exe' WHERE key = 'ytdlp_path'").run();
    expect(await s.status()).toMatchObject({
      path: 'C:\\roto\\yt-dlp.exe',
      version: null,
      error: 'No se pudo ejecutar yt-dlp: spawn ENOENT',
    });
  });

  it('findOnPath respeta PATHEXT en Windows', async () => {
    const dir = await tmpDir();
    await writeFile(path.join(dir, 'yt-dlp.exe'), '');
    expect(findOnPath('yt-dlp', { PATH: dir, PATHEXT: '.COM;.EXE' }, 'win32')).toBe(
      path.join(dir, 'yt-dlp.exe'),
    );
    expect(findOnPath('ffmpeg', { PATH: dir, PATHEXT: '.EXE' }, 'win32')).toBeNull();
  });
});
