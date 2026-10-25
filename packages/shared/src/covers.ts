/** Fondo y texto de las portadas sin imagen; cada par cumple contraste 4.5:1. */
const PALETTE: [string, string][] = [
  ['#c2272d', '#ffffff'],
  ['#1e5bd8', '#ffffff'],
  ['#e8b923', '#141414'],
  ['#6b4ba8', '#ffffff'],
  ['#e9785a', '#141414'],
  ['#4fb3a9', '#141414'],
  ['#5b4fc4', '#ffffff'],
  ['#2f6f94', '#ffffff'],
  ['#a3c46b', '#141414'],
  ['#f09ab8', '#141414'],
  ['#4f5e44', '#ffffff'],
  ['#c9a27e', '#141414'],
];

/**
 * El mismo título da siempre el mismo color, así un álbum se reconoce de un vistazo (y se ve igual en la
 * web y en el celular).
 */
export function coverColors(title: string): { background: string; color: string } {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  const [background, color] = PALETTE[hash % PALETTE.length]!;
  return { background, color };
}

/** Hasta dos iniciales, de las primeras palabras que tengan letras o números ("Persona 5" → "P5"). */
export function initials(title: string): string {
  return title
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
