/** Genera un MP3 mínimo (ID3v2.4 + frames MPEG en silencio) para usar como fixture. */
type Tags = Partial<Record<'title' | 'artist' | 'albumArtist' | 'album' | 'track' | 'disc' | 'year', string>>;

const FRAME_IDS: Record<keyof Tags, string> = {
  title: 'TIT2',
  artist: 'TPE1',
  albumArtist: 'TPE2',
  album: 'TALB',
  track: 'TRCK',
  disc: 'TPOS',
  year: 'TDRC',
};

const enc = new TextEncoder();

function synchsafe(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function frame(id: string, body: Uint8Array): Uint8Array {
  return Uint8Array.from([...enc.encode(id), ...synchsafe(body.length), 0, 0, ...body]);
}

export function makeMp3(
  tags: Tags,
  opts: { seconds?: number; picture?: { mime: string; data: Uint8Array } } = {},
): Uint8Array {
  const frames: Uint8Array[] = [];
  for (const [key, value] of Object.entries(tags) as [keyof Tags, string][]) {
    frames.push(frame(FRAME_IDS[key], Uint8Array.from([0x03, ...enc.encode(value)])));
  }
  if (opts.picture) {
    const { mime, data } = opts.picture;
    frames.push(frame('APIC', Uint8Array.from([0x03, ...enc.encode(mime), 0, 0x03, 0, ...data])));
  }
  const tagBody = frames.flatMap((f) => [...f]);
  const header = [...enc.encode('ID3'), 0x04, 0x00, 0x00, ...synchsafe(tagBody.length)];

  const frameCount = Math.round((opts.seconds ?? 1) * 38.28);
  const audio = new Uint8Array(frameCount * 417);
  for (let i = 0; i < frameCount; i++) audio.set([0xff, 0xfb, 0x90, 0x00], i * 417);

  const out = new Uint8Array(header.length + tagBody.length + audio.length);
  out.set(header, 0);
  out.set(tagBody, header.length);
  out.set(audio, header.length + tagBody.length);
  return out;
}
