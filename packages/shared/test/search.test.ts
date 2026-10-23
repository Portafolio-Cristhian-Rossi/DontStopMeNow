import { describe, expect, it } from 'vitest';
import { searchKey } from '../src/index.ts';

describe('searchKey', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(searchKey('Canción Ñandú BJÖRK')).toBe('cancion nandu bjork');
  });
});
