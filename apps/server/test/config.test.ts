import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('usa APPDATA en Windows', () => {
    const c = loadConfig({ APPDATA: 'C:\\Users\\cris\\AppData\\Roaming' }, 'win32', 'C:\\Users\\cris');
    expect(c.dataDir).toBe('C:\\Users\\cris\\AppData\\Roaming\\DontStopMeNow');
    expect(c.dbPath).toBe('C:\\Users\\cris\\AppData\\Roaming\\DontStopMeNow\\library.db');
    expect(c.port).toBe(4747);
  });
  it('usa ~/.local/share en Linux y respeta overrides', () => {
    expect(loadConfig({}, 'linux', '/home/c').dataDir).toBe('/home/c/.local/share/dontstopmenow');
    const c = loadConfig({ DSMN_DATA_DIR: '/data', DSMN_PORT: '8000' }, 'linux', '/home/c');
    expect([c.dataDir, c.coversDir, c.port]).toEqual(['/data', '/data/covers', 8000]);
  });
  it('rechaza puertos inválidos', () => {
    expect(() => loadConfig({ DSMN_PORT: 'abc' }, 'linux', '/h')).toThrow(/DSMN_PORT/);
    expect(() => loadConfig({ DSMN_PORT: '70000' }, 'linux', '/h')).toThrow(/DSMN_PORT/);
  });

  it('webDir es null si no hay index.html', () => {
    expect(loadConfig({}, 'linux', '/h', () => false).webDir).toBeNull();
    expect(loadConfig({ DSMN_WEB_DIR: '/w' }, 'linux', '/h', () => true).webDir).toBe('/w');
    expect(loadConfig({}, 'linux', '/h', () => true).webDir).toMatch(/web[\\/]dist$/);
  });

  it('usa el directorio web por defecto que recibe', () => {
    expect(loadConfig({}, 'linux', '/h', () => true, '/opt/dsmn/web').webDir).toBe('/opt/dsmn/web');
    expect(loadConfig({ DSMN_WEB_DIR: '/w' }, 'linux', '/h', () => true, '/opt/dsmn/web').webDir).toBe('/w');
  });
});
