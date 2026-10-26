// Genera los íconos de la app Android y de la web a partir de la marca de la web (las cuatro barras de sonido
// de `logo` en apps/web/src/components/Icon.tsx), sin dependencias: dibuja con supermuestreo y escribe PNG.
// Uso: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const root = new URL('..', import.meta.url);
const ACCENT = [0xff, 0x5a, 0x3c];
const INK = [0x14, 0x0a, 0x06];
const WHITE = [0xff, 0xff, 0xff];

// Barras en la grilla de 24×24 del ícono: [x, yArriba, yAbajo]. Trazo redondeado más grueso que en la web
// para que se lea chico en el escritorio del celular.
const BARS = [
  [5, 11, 15],
  [9.5, 6, 18],
  [14, 9, 15],
  [18.5, 11, 13],
];
const STROKE = 2.3;
const CENTER = [11.75, 12];

function png(size, pixels) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distancia de un punto al segmento vertical (x, y1)–(x, y2). */
function distToBar(px, py, [x, y1, y2]) {
  const cy = Math.min(Math.max(py, y1), y2);
  return Math.hypot(px - x, py - cy);
}

/**
 * Dibuja el ícono: `scale` píxeles por unidad de la grilla, centrado; `bg` null = fondo transparente.
 */
function draw(size, scale, ink, bg) {
  const pixels = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (x + (sx + 0.5) / SS - size / 2) / scale + CENTER[0];
          const gy = (y + (sy + 0.5) / SS - size / 2) / scale + CENTER[1];
          if (BARS.some((b) => distToBar(gx, gy, b) <= STROKE / 2)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const i = (y * size + x) * 4;
      if (bg) {
        for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(bg[c] * (1 - a) + ink[c] * a);
        pixels[i + 3] = 255;
      } else {
        pixels.set(ink, i);
        pixels[i + 3] = Math.round(a * 255);
      }
    }
  }
  return png(size, pixels);
}

const SIZE = 1024;
const assets = new URL('apps/mobile/assets/', root);
mkdirSync(assets, { recursive: true });
// Ícono clásico (Android viejo y la tienda): cuadrado naranja entero; el lanzador le pone la forma.
writeFileSync(new URL('icon.png', assets), draw(SIZE, 44, INK, ACCENT));
// Ícono adaptable: el dibujo entra en la zona segura (círculo central de 66/108 del lienzo); el fondo es el color.
writeFileSync(new URL('adaptive-icon.png', assets), draw(SIZE, 33.5, INK, null));
// Ícono temático de Android 13+: Android lo pinta con los colores del fondo de pantalla.
writeFileSync(new URL('monochrome-icon.png', assets), draw(SIZE, 33.5, WHITE, null));

// Favicon de la web, en vector.
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const lines = BARS.map(([x, y1, y2]) => `<path d="M${x} ${y1}V${y2}"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${hex(ACCENT)}"/><g transform="translate(${12 - CENTER[0]} 0)" fill="none" stroke="${hex(INK)}" stroke-width="${STROKE}" stroke-linecap="round">${lines}</g></svg>\n`;
const pub = new URL('apps/web/public/', root);
mkdirSync(pub, { recursive: true });
writeFileSync(new URL('favicon.svg', pub), svg);
console.log('Íconos generados.');
