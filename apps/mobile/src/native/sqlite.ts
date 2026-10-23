import { openDatabaseSync } from 'expo-sqlite';
import type { SqlDb } from '../core/types.ts';

/** Base local de la app sobre expo-sqlite. */
export function openSqlDb(): SqlDb {
  const db = openDatabaseSync('dontstopmenow.db');
  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, ...params) => void db.runSync(sql, ...params),
    all: (sql, ...params) => db.getAllSync(sql, ...params),
    first: (sql, ...params) => db.getFirstSync(sql, ...params),
  };
}
