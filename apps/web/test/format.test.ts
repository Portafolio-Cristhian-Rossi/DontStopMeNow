import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from '../src/lib/format.ts';

describe('format', () => {
  it.each([
    [0, '0:00'],
    [65_000, '1:05'],
    [3_723_000, '1:02:03'],
  ])('formatDuration(%i)', (ms, s) => expect(formatDuration(ms)).toBe(s));

  it.each([
    [512, '512 B'],
    [1536, '1,5 KB'],
    [5 * 1024 ** 3, '5 GB'],
  ])('formatBytes(%i)', (n, s) => expect(formatBytes(n)).toBe(s));
});
