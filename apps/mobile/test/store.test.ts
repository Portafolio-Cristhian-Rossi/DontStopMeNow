import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { LocalStore } from '../src/core/store.ts';
import { makeCatalog, sqliteDb } from './helpers.ts';

const server = { serverId: 'srv', name: 'PC', url: 'http://192.168.1.10:4747', token: 'tok' };

describe('LocalStore', () => {
  it('guarda y lee servidor, catálogo y selección', () => {
    const store = new LocalStore(sqliteDb());
    expect(store.getServer()).toBeNull();
    store.setServer(server);
    store.updateServerUrl('http://192.168.1.77:4747');
    expect(store.getServer()).toEqual({ ...server, url: 'http://192.168.1.77:4747' });
    store.setCatalog(makeCatalog(), '"7"');
    expect(store.getCatalog()).toEqual({ catalog: makeCatalog(), etag: '"7"' });
    store.setSelected({ kind: 'album', id: 'al1' }, true);
    store.setSelected({ kind: 'playlist', id: 'p1' }, true);
    expect(store.getSelection()).toEqual([
      { kind: 'album', id: 'al1' },
      { kind: 'playlist', id: 'p1' },
    ]);
    store.replaceSelection([{ kind: 'playlist', id: 'p1' }]);
    expect(store.getSelection()).toEqual([{ kind: 'playlist', id: 'p1' }]);
  });

  it('setSelected es idempotente', () => {
    const store = new LocalStore(sqliteDb());
    store.setSelected({ kind: 'album', id: 'al1' }, true);
    store.setSelected({ kind: 'album', id: 'al1' }, true);
    expect(store.getSelection()).toHaveLength(1);
    store.setSelected({ kind: 'album', id: 'al1' }, false);
    expect(store.getSelection()).toHaveLength(0);
  });

  it('descargas, parciales y fallas', () => {
    const store = new LocalStore(sqliteDb());
    store.addDownload({ trackId: 't1', fingerprint: 'f1', path: '/m/t1.mp3', size: 10 });
    store.addDownload({ trackId: 't1', fingerprint: 'f2', path: '/m/t1.mp3', size: 11 });
    expect(store.getDownloads()).toEqual([{ trackId: 't1', fingerprint: 'f2', path: '/m/t1.mp3', size: 11 }]);
    store.removeDownload('t1');
    expect(store.getDownloads()).toEqual([]);
    store.setPartial('t2', 'f2', '{"x":1}');
    expect(store.getPartial('t2')).toEqual({ fingerprint: 'f2', state: '{"x":1}' });
    store.removePartial('t2');
    expect(store.getPartial('t2')).toBeNull();
    store.setFailures([{ trackId: 't3', error: 'boom' }]);
    expect(store.getFailures()).toEqual([{ trackId: 't3', error: 'boom' }]);
    store.setFailures([]);
    expect(store.getFailures()).toEqual([]);
  });

  it('clearServer conserva las descargas y la selección', () => {
    const store = new LocalStore(sqliteDb());
    store.setServer(server);
    store.setCatalog(makeCatalog(), '"1"');
    store.setSelected({ kind: 'album', id: 'al1' }, true);
    store.addDownload({ trackId: 't1', fingerprint: 'f1', path: '/m/t1.mp3', size: 10 });
    store.clearServer();
    expect(store.getServer()).toBeNull();
    expect(store.getCatalog()).toBeNull();
    expect(store.getSelection()).toEqual([{ kind: 'album', id: 'al1' }]);
    expect(store.getDownloads()).toHaveLength(1);
  });

  it('reabrir la base conserva los datos (migración idempotente)', () => {
    const raw = new DatabaseSync(':memory:');
    new LocalStore(sqliteDb(raw)).setServer(server);
    expect(new LocalStore(sqliteDb(raw)).getServer()).toEqual(server);
  });

  it('guarda el estado del reproductor y desvincular no lo borra', () => {
    const raw = new DatabaseSync(':memory:');
    const store = new LocalStore(sqliteDb(raw));
    expect(store.getPlayerState()).toBeNull();
    const state = {
      queue: {
        order: ['t2', 't1'],
        original: ['t1', 't2'],
        index: 1,
        shuffle: true,
        repeat: 'all' as const,
        nextCount: 0,
      },
      positionMs: 42_000,
    };
    store.setPlayerState(state);
    store.clearServer();
    expect(new LocalStore(sqliteDb(raw)).getPlayerState()).toEqual(state);
    store.setPlayerState(null);
    expect(store.getPlayerState()).toBeNull();
  });

  it('ajustes y ruta nueva de una descarga', () => {
    const store = new LocalStore(sqliteDb());
    expect(store.getSetting('musicFolder')).toBeNull();
    store.setSetting('musicFolder', 'content://sd/carpeta');
    expect(store.getSetting('musicFolder')).toBe('content://sd/carpeta');
    store.setSetting('musicFolder', null);
    expect(store.getSetting('musicFolder')).toBeNull();
    store.addDownload({ trackId: 't1', fingerprint: 'f1', path: '/m/t1.mp3', size: 10 });
    store.updateDownloadPath('t1', 'content://sd/Uno.mp3');
    expect(store.getDownloads()[0]?.path).toBe('content://sd/Uno.mp3');
  });
});
