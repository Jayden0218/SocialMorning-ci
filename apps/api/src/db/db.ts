/**
 * The one database interface the repositories use. Two adapters satisfy it:
 * `fromPostgres` (production, the `postgres` driver on Neon) and `fromPglite`
 * (tests, in-process). Repositories never see which — that is what lets the
 * pglite suite be evidence about the real SQL (research R8).
 */
import type { Sql } from './client.ts';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /** Runs `fn` inside BEGIN/COMMIT; rolls back on throw. `fn` receives a Db bound to the transaction. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export function fromPostgres(sql: Sql): Db {
  const bind = (s: Sql): Db => ({
    query: (q, params) => s.unsafe(q, (params ?? []) as never) as unknown as Promise<never[]>,
    exec: async (q) => { await s.unsafe(q); },
    transaction: (fn) => s.begin((tx) => fn(bind(tx as unknown as Sql))) as Promise<never>,
  });
  return bind(sql);
}

/** Minimal shape of a pglite instance we rely on (kept structural so the test dep stays dev-only). */
export interface PgliteTxLike {
  query<T>(q: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(q: string): Promise<unknown>;
}
export interface PgliteLike extends PgliteTxLike {
  transaction<T>(fn: (tx: PgliteTxLike) => Promise<T>): Promise<T>;
}

export function fromPglite(db: PgliteLike): Db {
  // pglite's Transaction object cannot open a nested transaction; inside one, a
  // nested `transaction()` just runs in the same transaction (savepoints are not needed here).
  const bindTx = (d: PgliteTxLike): Db => ({
    query: async (q, params) => (await d.query(q, params)).rows as never[],
    exec: async (q) => { await d.exec(q); },
    transaction: (fn) => fn(bindTx(d)),
  });
  return {
    ...bindTx(db),
    transaction: (fn) => db.transaction((tx) => fn(bindTx(tx))),
  };
}
