import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { PAIRING_CODE_TTL_MS, type Device } from '@dsmn/shared';

export interface Pairing {
  createCode(now?: number): { code: string; expiresAt: number };
  redeem(code: string, deviceName: string, now?: number): { token: string; deviceId: string } | null;
  verifyToken(token: string): Device | null;
  listDevices(): Device[];
  revokeDevice(id: string): boolean;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface DeviceRow {
  id: string;
  name: string;
  created_at: number;
  last_seen_at: number | null;
}

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
});

export function createPairing(db: DatabaseSync): Pairing {
  // Los códigos viven solo en memoria: vencen en minutos y no hace falta que sobrevivan a un reinicio.
  const codes = new Map<string, number>();

  return {
    createCode(now = Date.now()) {
      let code: string;
      do {
        code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      } while (codes.has(code));
      const expiresAt = now + PAIRING_CODE_TTL_MS;
      codes.set(code, expiresAt);
      return { code, expiresAt };
    },

    redeem(code, deviceName, now = Date.now()) {
      const expiresAt = codes.get(code);
      codes.delete(code);
      if (expiresAt === undefined || now > expiresAt) return null;
      const token = randomBytes(32).toString('base64url');
      const deviceId = randomUUID();
      db.prepare('INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)').run(
        deviceId,
        deviceName,
        sha256(token),
        now,
      );
      return { token, deviceId };
    },

    verifyToken(token) {
      const row = db
        .prepare('SELECT id, name, created_at, last_seen_at FROM devices WHERE token_hash = ?')
        .get(sha256(token)) as DeviceRow | undefined;
      if (!row) return null;
      const now = Date.now();
      db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, row.id);
      return toDevice({ ...row, last_seen_at: now });
    },

    listDevices() {
      const rows = db
        .prepare('SELECT id, name, created_at, last_seen_at FROM devices ORDER BY created_at')
        .all() as unknown as DeviceRow[];
      return rows.map(toDevice);
    },

    revokeDevice(id) {
      return db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
    },
  };
}
