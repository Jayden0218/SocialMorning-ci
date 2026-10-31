// Opens the phone's SQLite database and runs the migrations; the shared row helper.
// Split out of sqlite.ts (2026-10-31); sqlite.ts re-exports everything here, so importers are unchanged.
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { migrateSchema } from './schema';

export const DATABASE_NAME = 'socialmorning.db';

/** `{ [key]: v }`, or `{}` when the column is NULL: an optional field is left out, never set to undefined. */
export const put = <K extends string, T>(key: K, v: T | null): { [P in K]?: T } =>
  (v === null ? {} : { [key]: v }) as { [P in K]?: T };

export function openDatabase(name: string = DATABASE_NAME): SQLiteDatabase {
  const db = openDatabaseSync(name);
  db.withTransactionSync(() => {
    migrateSchema({
      exec: (sql) => db.execSync(sql),
      getUserVersion: () => db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0,
      setUserVersion: (v) => db.execSync(`PRAGMA user_version = ${v}`),
    });
  });
  return db;
}
