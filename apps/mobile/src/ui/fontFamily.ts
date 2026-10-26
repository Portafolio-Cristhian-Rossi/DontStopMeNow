export type FontKind = 'body' | 'display' | 'mono';

/** Pesos cargados de cada tipografía (ver fonts.ts) y el nombre de su familia. */
const FAMILIES: Record<FontKind, Record<number, string>> = {
  body: { 400: 'Inter_400Regular', 500: 'Inter_500Medium', 600: 'Inter_600SemiBold', 700: 'Inter_700Bold' },
  display: { 700: 'BricolageGrotesque_700Bold', 800: 'BricolageGrotesque_800ExtraBold' },
  mono: { 500: 'JetBrainsMono_500Medium', 700: 'JetBrainsMono_700Bold' },
};

const NAMED: Record<string, number> = { normal: 400, bold: 700 };

/**
 * Familia para un tipo de letra y un peso. En Android una tipografía cargada con expo-font no cambia de
 * peso con `fontWeight`: cada peso es una familia aparte. Si no está ese peso, usa el más cercano (y ante
 * un empate, el más pesado).
 */
export function fontFamilyFor(kind: FontKind, fontWeight?: string | number): string {
  const wanted = NAMED[String(fontWeight)] ?? (Number(fontWeight) || (kind === 'display' ? 800 : 400));
  const weights = Object.keys(FAMILIES[kind]).map(Number);
  const best = weights.reduce((a, b) =>
    Math.abs(b - wanted) < Math.abs(a - wanted) || (Math.abs(b - wanted) === Math.abs(a - wanted) && b > a)
      ? b
      : a,
  );
  return FAMILIES[kind][best]!;
}
