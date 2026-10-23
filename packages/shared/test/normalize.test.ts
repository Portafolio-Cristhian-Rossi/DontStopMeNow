import { describe, expect, it } from 'vitest';
import { albumId, normalizeKey, sanitizeFolderName } from '../src/index.ts';

describe('normalizeKey', () => {
  it('pasa a minúsculas, colapsa y recorta espacios', () => {
    expect(normalizeKey('  The   Beatles ')).toBe('the beatles');
  });
  it('normaliza a NFC', () => {
    expect(normalizeKey('Canción')).toBe(normalizeKey('Canción'));
  });
});

describe('albumId', () => {
  it('es estable e insensible a mayúsculas/espacios', () => {
    expect(albumId('Queen', 'A Night at the Opera')).toBe(albumId(' queen ', 'a night  at the opera'));
  });
  it('tiene 16 caracteres hex', () => {
    expect(albumId('Queen', 'Jazz')).toMatch(/^[0-9a-f]{16}$/);
  });
  it('distingue artista de álbum', () => {
    expect(albumId('ab', 'c')).not.toBe(albumId('a', 'bc'));
  });
});

describe('sanitizeFolderName', () => {
  it('deja nombres válidos en Windows', () => {
    expect(sanitizeFolderName('AC/DC: Hits?')).toBe('AC_DC_ Hits_');
    expect(sanitizeFolderName('  Mix  de   verano. ')).toBe('Mix de verano');
    expect(sanitizeFolderName('..')).toBe('Descargas');
    expect(sanitizeFolderName('Persona 3-4-5 Best Tracks')).toBe('Persona 3-4-5 Best Tracks');
  });
});
