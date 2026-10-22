import { describe, expect, it } from 'vitest';
import {
  CreatePlaylistRequestSchema,
  EnqueueRequestSchema,
  PairRequestSchema,
  PreviewRequestSchema,
  QrPayloadSchema,
  UpdatePlaylistRequestSchema,
} from '../src/index.ts';

describe('esquemas de descargas', () => {
  it('PreviewRequest solo acepta http(s)', () => {
    expect(PreviewRequestSchema.safeParse({ url: 'https://www.youtube.com/playlist?list=PL1' }).success).toBe(
      true,
    );
    expect(PreviewRequestSchema.safeParse({ url: '--exec calc' }).success).toBe(false);
    expect(PreviewRequestSchema.safeParse({ url: 'file:///C:/x' }).success).toBe(false);
  });

  it('EnqueueRequest exige al menos una canción', () => {
    const base = {
      url: 'https://y/p',
      title: 'P',
      kind: 'playlist',
      ytPlaylistId: 'PL1',
      playlistSize: 3,
      rootId: 1,
      folder: 'P',
    };
    expect(EnqueueRequestSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(
      EnqueueRequestSchema.safeParse({ ...base, items: [{ videoId: 'a', position: 1, title: 'A' }] }).success,
    ).toBe(true);
  });
});

describe('schemas', () => {
  it('CreatePlaylistRequest discrimina por type', () => {
    expect(CreatePlaylistRequestSchema.parse({ type: 'manual', name: ' Gym ' })).toEqual({
      type: 'manual',
      name: 'Gym',
    });
    expect(CreatePlaylistRequestSchema.safeParse({ type: 'folder', name: 'X' }).success).toBe(false);
    expect(CreatePlaylistRequestSchema.safeParse({ type: 'manual', name: '   ' }).success).toBe(false);
  });
  it('UpdatePlaylistRequest exige algún campo', () => {
    expect(UpdatePlaylistRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdatePlaylistRequestSchema.safeParse({ trackIds: [] }).success).toBe(true);
  });
  it('PairRequest recorta y limita deviceName', () => {
    expect(PairRequestSchema.parse({ code: 'ABC123', deviceName: ' Pixel ' }).deviceName).toBe('Pixel');
    expect(PairRequestSchema.safeParse({ code: 'A', deviceName: 'x'.repeat(65) }).success).toBe(false);
  });
  it('QrPayload exige v=1 y al menos una url', () => {
    expect(QrPayloadSchema.safeParse({ v: 1, serverId: 's', urls: [], code: 'c' }).success).toBe(false);
    expect(
      QrPayloadSchema.safeParse({ v: 1, serverId: 's', urls: ['http://192.168.0.2:4747'], code: 'c' })
        .success,
    ).toBe(true);
  });
});
