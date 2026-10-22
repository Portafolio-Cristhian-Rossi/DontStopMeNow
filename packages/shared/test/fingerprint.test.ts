import { describe, expect, it } from 'vitest';
import { FINGERPRINT_WINDOW, fingerprintFromWindows } from '../src/index.ts';

describe('fingerprintFromWindows', () => {
  it('archivo chico: hash del contenido completo', () => {
    const data = new TextEncoder().encode('0123456789');
    expect(fingerprintFromWindows(10, data, new Uint8Array())).toBe(
      '10:87acec17cd9dcd20a716cc2cf67417b71c8a7016',
    );
  });
  it('la ventana es de 64 KiB', () => {
    expect(FINGERPRINT_WINDOW).toBe(65536);
  });
});
