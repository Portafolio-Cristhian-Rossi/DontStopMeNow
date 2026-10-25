/** Los mismos tokens que la web (apps/web/src/styles.css). */
export const colors = {
  bg: '#0E0F11',
  surface: '#16171A',
  surfaceSide: '#121316',
  surface2: '#1F2024',
  surface3: '#26272C',
  border: '#24252A',
  borderStrong: '#2E2F35',
  text: '#F2F1EE',
  textSoft: '#C9C9CF',
  muted: '#A3A3AA',
  faint: '#8B8B93',
  accent: '#FF5A3C',
  accentText: '#140A06',
  ok: '#3CCB8A',
  okSoft: '#14301F',
  okText: '#7FE0AE',
  warn: '#F2B33D',
  warnSoft: '#221C10',
  warnText: '#F5C46B',
  danger: '#FF6B60',
} as const;

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

/** Mínimo para que algo se pueda tocar con el dedo sin errarle. */
export const TOUCH = 44;
