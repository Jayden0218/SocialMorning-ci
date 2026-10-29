// A stand-in for `expo-sqlite` built on Node's own `node:sqlite`, so src/storage/sqlite.ts runs in Jest.
// Implements only what sqlite.ts uses: openDatabaseSync, execSync, runSync, getAllSync, getFirstSync,
// withTransactionSync. Mirrors expo-sqlite's value rules: undefined binds as NULL, booleans as 1/0,
// getFirstSync returns null when there is no row.
const { DatabaseSync } = require('node:sqlite');

const bind = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const params = (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args).map(bind);

function openDatabaseSync() {
  const db = new DatabaseSync(':memory:');
  return {
    execSync: (sql) => db.exec(sql),
    runSync: (sql, ...args) => {
      const r = db.prepare(sql).run(...params(args));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getAllSync: (sql, ...args) => db.prepare(sql).all(...params(args)).map((r) => ({ ...r })),
    getFirstSync: (sql, ...args) => {
      const r = db.prepare(sql).get(...params(args));
      return r === undefined ? null : { ...r };
    },
    withTransactionSync: (fn) => {
      db.exec('BEGIN');
      try {
        fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

module.exports = { openDatabaseSync };
