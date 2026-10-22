/** Interpreta un header Range de un solo rango. null = sin header; 'invalid' = responder 416. */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (header === undefined) return null;
  const m = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
