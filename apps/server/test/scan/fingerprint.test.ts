import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fingerprintFile } from '../../src/scan/fingerprint.ts';
import { writeTmp } from '../helpers/fixtures.ts';

describe('fingerprintFile', () => {
  it('igual contenido → igual huella; un byte distinto al final → distinta', async () => {
    const data = randomBytes(300 * 1024);
    const a = await fingerprintFile(await writeTmp('a.bin', data), data.length);
    const b = await fingerprintFile(await writeTmp('b.bin', data), data.length);
    expect(a).toBe(b);
    const changed = Buffer.from(data);
    changed.writeUInt8(changed.readUInt8(changed.length - 1) ^ 0xff, changed.length - 1);
    expect(await fingerprintFile(await writeTmp('c.bin', changed), changed.length)).not.toBe(a);
  });

  it('archivos chicos se hashean completos', async () => {
    const data = Buffer.from('0123456789');
    const a = await fingerprintFile(await writeTmp('a.bin', data), 10);
    expect(a.startsWith('10:')).toBe(true);
    const changed = Buffer.from('01234X6789');
    expect(await fingerprintFile(await writeTmp('b.bin', changed), 10)).not.toBe(a);
  });
});
