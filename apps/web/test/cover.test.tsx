import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cover } from '../src/components/Cover.tsx';

describe('Cover', () => {
  it('sin portada muestra las iniciales sobre el color del título', () => {
    const { container } = render(<Cover coverId={null} title="Fever Dreams" />);
    const box = container.querySelector('.cover') as HTMLElement;
    expect(box).toHaveTextContent('FD');
    expect(box.style.background).not.toBe('');
  });
});
