import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isUnderRelDir, toRelPath } from '../../src/library/paths.ts';

describe('toRelPath', () => {
  it('convierte rutas de Windows a rel_path con /', () => {
    expect(toRelPath('D:\\Música', 'D:\\Música\\Rock\\Queen\\a.mp3', path.win32)).toBe('Rock/Queen/a.mp3');
  });
  it('la propia raíz es la cadena vacía', () => {
    expect(toRelPath('/m', '/m', path.posix)).toBe('');
  });
  it('rechaza rutas fuera de la raíz', () => {
    expect(() => toRelPath('/m', '/otra/a.mp3', path.posix)).toThrow();
  });
});

describe('isUnderRelDir', () => {
  it('no confunde prefijos', () => {
    expect(isUnderRelDir('Rock/a.mp3', 'Rock')).toBe(true);
    expect(isUnderRelDir('Rockabilly/a.mp3', 'Rock')).toBe(false);
    expect(isUnderRelDir('x.mp3', '')).toBe(true);
  });
});
