/**
 * yt-dlp falso para los tests: se ejecuta con `node fakeYtDlp.ts <args>` e imita las respuestas de yt-dlp según el id
 * del video. Anota cada llamada en `calls.jsonl`, junto al script.
 *
 * ids: ok* baja bien · fail* video no disponible · limit* HTTP 429 · hang* no responde · exists* ya existía.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const here = dirname(process.argv[1]!);
const args = process.argv.slice(2);
appendFileSync(
  join(here, 'calls.jsonl'),
  JSON.stringify({ args, pythonIoEncoding: process.env.PYTHONIOENCODING ?? null }) + '\n',
);

const versionFile = join(here, 'version.txt');
const url = args.at(-1) ?? '';
const videoId = /[?&]v=([^&]+)/.exec(url)?.[1] ?? 'x';
const value = (flag: string, prefix: string) => {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag && args[i + 1]!.startsWith(prefix)) return args[i + 1]!.slice(prefix.length);
  }
  return undefined;
};

function fail(message: string): never {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}

const entry = (id: string) => ({
  _type: 'url',
  id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Canción ${id}`,
  channel: 'Canal',
  duration: 200,
});

if (args.includes('--version')) {
  console.log(existsSync(versionFile) ? readFileSync(versionFile, 'utf8') : '2026.03.17');
} else if (args.includes('-U')) {
  writeFileSync(versionFile, '2026.09.01');
  console.log('Updated yt-dlp to 2026.09.01');
} else if (args.includes('--flat-playlist')) {
  if (url.includes('bad')) fail('[youtube] bad: Video unavailable');
  const list = /[?&]list=([^&]+)/.exec(url)?.[1];
  if (list) {
    const priv = {
      _type: 'url',
      id: 'priv',
      url: 'priv',
      title: '[Private video]',
      channel: null,
      duration: null,
    };
    console.log(
      JSON.stringify({
        _type: 'playlist',
        id: list,
        title: 'Fake Playlist',
        // "gone" imita lo que devuelve YouTube hoy para un video no disponible: sin título ni duración.
        entries: [
          entry('ok1'),
          priv,
          entry('ok2'),
          {
            _type: 'url',
            id: 'gone',
            url: 'https://www.youtube.com/watch?v=gone',
            title: null,
            duration: null,
          },
        ],
      }),
    );
  } else {
    console.log(JSON.stringify({ ...entry(videoId), _type: 'video', webpage_url: url }));
  }
} else if (videoId.startsWith('ok')) {
  for (const done of [0, 50, 100]) console.log(`dsmn-progress ${done} 100 NA`);
  console.log('[ExtractAudio] Destination: temp.mp3');
  const home = value('-P', 'home:')!;
  const template = value('-o', '')!;
  const file = join(home, template.replace('%(title)s', `Canción ${videoId}`).replace('%(ext)s', 'mp3'));
  mkdirSync(home, { recursive: true });
  writeFileSync(file, 'mp3 falso');
  console.log(`dsmn-file ${file}`);
} else if (videoId.startsWith('fail')) {
  fail('[youtube] fail: Video unavailable');
} else if (videoId.startsWith('limit')) {
  fail('unable to download video data: HTTP Error 429: Too Many Requests');
} else if (videoId.startsWith('hang')) {
  setInterval(() => {}, 1000);
} else if (videoId.startsWith('exists')) {
  console.log(`[download] ${videoId}.mp3 has already been downloaded`);
}
