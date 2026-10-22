import { describe, expect, it } from 'vitest';
import { createPairing } from '../../src/pairing/pairing.ts';
import { makeDb } from '../helpers/fixtures.ts';

describe('pairing', () => {
  it('el código tiene 6 caracteres sin ambiguos', () => {
    expect(createPairing(makeDb()).createCode().code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('el código se canjea una sola vez', () => {
    const p = createPairing(makeDb());
    const { code, expiresAt } = p.createCode(0);
    expect(expiresAt).toBe(300_000);
    const r = p.redeem(code, 'Pixel', 1000);
    expect(r).not.toBeNull();
    expect(p.redeem(code, 'Otro', 1000)).toBeNull();
    expect(p.verifyToken(r!.token)?.name).toBe('Pixel');
  });

  it('el código vence a los 5 minutos', () => {
    const p = createPairing(makeDb());
    const { code } = p.createCode(0);
    expect(p.redeem(code, 'Pixel', 300_001)).toBeNull();
  });

  it('revocar invalida el token y no se guarda el token en claro', () => {
    const db = makeDb();
    const p = createPairing(db);
    const r = p.redeem(p.createCode().code, 'Pixel')!;
    const row = db.prepare('SELECT token_hash FROM devices').get() as { token_hash: string };
    expect(row.token_hash).not.toBe(r.token);
    expect(p.listDevices()).toHaveLength(1);
    expect(p.revokeDevice(r.deviceId)).toBe(true);
    expect(p.verifyToken(r.token)).toBeNull();
    expect(p.revokeDevice(r.deviceId)).toBe(false);
  });

  it('verifyToken actualiza lastSeenAt y rechaza tokens desconocidos', () => {
    const p = createPairing(makeDb());
    const r = p.redeem(p.createCode().code, 'Pixel')!;
    expect(p.listDevices()[0]!.lastSeenAt).toBeNull();
    p.verifyToken(r.token);
    expect(p.listDevices()[0]!.lastSeenAt).not.toBeNull();
    expect(p.verifyToken('cualquiera')).toBeNull();
  });
});
