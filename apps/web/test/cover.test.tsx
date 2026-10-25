import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cover, coverColors, initials } from '../src/components/Cover.tsx';

describe('Cover', () => {
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

  it('sin portada muestra las iniciales sobre el color del título', () => {
    const { container } = render(<Cover coverId={null} title="Fever Dreams" />);
    const box = container.querySelector('.cover') as HTMLElement;
    expect(box).toHaveTextContent('FD');
    expect(box.style.background).not.toBe('');
  });
});
