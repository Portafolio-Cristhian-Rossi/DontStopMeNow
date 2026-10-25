import { describe, expect, it } from 'vitest';
import { fontFamilyFor } from '../src/ui/fontFamily.ts';

describe('fontFamilyFor', () => {
  it('elige la familia del peso pedido', () => {
    expect(fontFamilyFor('body')).toBe('Inter_400Regular');
    expect(fontFamilyFor('body', '600')).toBe('Inter_600SemiBold');
    expect(fontFamilyFor('body', 'bold')).toBe('Inter_700Bold');
    expect(fontFamilyFor('body', 500)).toBe('Inter_500Medium');
  });

  it('sin ese peso usa el más cercano, y ante un empate el más pesado', () => {
    expect(fontFamilyFor('body', '800')).toBe('Inter_700Bold');
    expect(fontFamilyFor('display')).toBe('BricolageGrotesque_800ExtraBold');
    expect(fontFamilyFor('display', '600')).toBe('BricolageGrotesque_700Bold');
    expect(fontFamilyFor('mono', '600')).toBe('JetBrainsMono_700Bold');
    expect(fontFamilyFor('mono')).toBe('JetBrainsMono_500Medium');
  });
});
