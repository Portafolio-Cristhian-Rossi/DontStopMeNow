import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const WINDOW = 64 * 1024;

/** Huella rápida: tamaño + SHA-1 de los primeros y últimos 64 KiB. */
export async function fingerprintFile(absPath: string, size: number): Promise<string> {
  const hash = createHash('sha1');
  const file = await open(absPath, 'r');
  try {
    const read = async (position: number, length: number) => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await file.read(buf, 0, length, position);
      hash.update(buf.subarray(0, bytesRead));
    };
    if (size <= WINDOW * 2) {
      await read(0, size);
    } else {
      await read(0, WINDOW);
      await read(size - WINDOW, WINDOW);
    }
  } finally {
    await file.close();
  }
  return `${size}:${hash.digest('hex')}`;
}
