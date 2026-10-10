// Attaches a DynamoDB Store to a Postgres Db handle, so the converted repo functions run on DynamoDB (backend.ts).
/**
 * M26 lane LB. Loaded only on the DynamoDB path (test/harness.ts under TEST_BACKEND=ddb), never on Postgres.
 * `withStore(db, store)` returns a Db that behaves exactly like `db` for SQL (the domains not converted yet)
 * and carries the Store for the converted ones; a transaction opened on it hands the Store on to `tx`.
 * `bridge` (default on while any domain is still on Postgres): converted writes also write their Postgres
 * row, so the unconverted domains' SQL still finds it (backend.ts).
 */
import { ATTACHED, type Attached } from './backend.ts';
import type { Db } from './db.ts';
import type { Store } from './ddb/store.ts';

export function withStore(db: Db, store: Store, opts: { bridge?: boolean } = {}): Db {
  const bridge = opts.bridge ?? true;
  const wrapped: Db = {
    query: (sql, params) => db.query(sql, params) as never,
    exec: (sql) => db.exec(sql),
    transaction: (fn) => db.transaction((tx) => fn(withStore(tx, store, { bridge }))) as never,
  };
  ATTACHED.set(wrapped, { store, raw: db, bridge });
  return wrapped;
}

/** What `withStore` attached to this handle (throws on a plain Postgres handle — a DynamoDB body was called without one). */
export function attachedOf(db: Db): Attached {
  const a = ATTACHED.get(db);
  if (!a) throw new Error('backend: this Db has no Store attached');
  return a;
}

/** The plain Postgres handle behind `db` (for the bridge), or undefined when the bridge is off. */
export function bridgeOf(db: Db): Db | undefined {
  const a = attachedOf(db);
  return a.bridge ? a.raw : undefined;
}

/** The plain Postgres handle behind `db`, for reads of tables another lane still owns on Postgres. */
export const pgOf = (db: Db): Db => attachedOf(db).raw;
