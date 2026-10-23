import { readFileSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpDir } from './fixtures.ts';

export interface FakeCall {
  args: string[];
  pythonIoEncoding: string | null;
}

/** Copia el yt-dlp falso a una carpeta con espacios, como "C:\Program Files\yt-dlp", y devuelve su ruta. */
export async function installFakeYtDlp(): Promise<string> {
  const dir = join(await tmpDir(), 'yt dlp test');
  await mkdir(dir);
  const target = join(dir, 'fakeYtDlp.ts');
  await copyFile(join(import.meta.dirname, 'fakeYtDlp.ts'), target);
  return target;
}

/** Llamadas que recibió el yt-dlp falso, en orden. */
export function fakeCalls(fake: string): FakeCall[] {
  let text: string;
  try {
    text = readFileSync(join(fake, '..', 'calls.jsonl'), 'utf8');
  } catch {
    return [];
  }
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FakeCall);
}

/** Ids de los videos que el yt-dlp falso bajó (o intentó bajar), en orden. */
export function downloadedIds(fake: string): string[] {
  return fakeCalls(fake)
    .filter((c) => c.args.includes('-x'))
    .map((c) => /[?&]v=([^&]+)/.exec(c.args.at(-1)!)![1]!);
}
