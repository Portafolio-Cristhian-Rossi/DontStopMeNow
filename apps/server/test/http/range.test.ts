import { describe, expect, it } from 'vitest';
import { parseRange } from '../../src/http/range.ts';

describe('parseRange', () => {
  it.each([
    [undefined, 100, null],
    ['bytes=0-', 100, { start: 0, end: 99 }],
    ['bytes=10-19', 100, { start: 10, end: 19 }],
    ['bytes=90-500', 100, { start: 90, end: 99 }],
    ['bytes=100-', 100, 'invalid'],
    ['bytes=5-2', 100, 'invalid'],
    ['bytes=0-1,5-6', 100, 'invalid'],
    ['items=0-1', 100, 'invalid'],
  ] as const)('parseRange(%s, %i)', (h, size, exp) => expect(parseRange(h, size)).toEqual(exp));
});
