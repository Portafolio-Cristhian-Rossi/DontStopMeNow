import { describe, expect, it } from 'vitest';
import { coverColors, initials } from '../src/covers.ts';

describe('portadas de respaldo', () => {
  it('el mismo título da siempre el mismo color', () => {
    expect(coverColors('Persona 5')).toEqual(coverColors('Persona 5'));
    const distintos = new Set(['A', 'B', 'C', 'D', 'E', 'F'].map((t) => coverColors(t).background));
    expect(distintos.size).toBeGreaterThan(1);
  });

  it('toma hasta dos iniciales de las primeras palabras con letras o números', () => {
    expect(initials('Persona 5')).toBe('P5');
    expect(initials('fever dreams and more')).toBe('FD');
    expect(initials('【Counter Strike】 OST')).toBe('CS');
    expect(initials('Ghost')).toBe('G');
  });
});
