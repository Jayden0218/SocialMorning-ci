// The dual-backend switch: a repo function runs on Postgres, or on DynamoDB when a Store is attached to the Db handle.
/**
 * M26 lane LB (plan.md "Branch and lane method"): while the lanes convert domain by domain, the app must
 * run on BOTH backends. A repo function keeps its name, parameters and return type; `dual()` wraps the
 * Postgres body and, when the `Db` handle it is given carries a DynamoDB `Store` (attached by
 * `backend-ddb.ts` — the harness under TEST_BACKEND=ddb; later DATA_BACKEND=ddb), calls the DynamoDB body
 * instead: `ddb/<mod>.ts` export `<name>(store, db, ...args)`.
 *
 * Nothing here loads the AWS SDK on Postgres: the DynamoDB module is imported only when a Store is
 * attached (the PGlite coverage run counts loaded files — apps/api/.c8rc.json).
 *
 * The bridge (hybrid only): domains not yet converted still read and JOIN the Postgres tables, so a
 * converted write ALSO writes its Postgres row while `bridge` is on (`rawOf(db)` is the plain Postgres
 * handle). Reads come from DynamoDB. Lane CUT removes the bridge and the Postgres bodies.
 */
import type { Db } from './db.ts';
import type { Store } from './ddb/store.ts';

export type Attached = { store: Store; raw: Db; bridge: boolean };

/** Db handle → its Store. Set only by backend-ddb.ts `withStore`. */
export const ATTACHED = new WeakMap<object, Attached>();

/**
 * Which folder holds the DynamoDB bodies of a module name used with `dual` (one per owning lane).
 * M27: one literal-prefix `import()` per folder, NOT a computed path — esbuild turns a literal prefix into a bundled glob, but a
 * path built from a variable stays a runtime import of a `.ts` file that the Lambda/Vercel bundle does not contain
 * (found by running the Lambda bundle, 2026-10-12: "Cannot find module .../repos/discover/ddb/catalog.ts").
 */
type Loaded = Record<string, (store: Store, db: Db, ...a: unknown[]) => Promise<unknown>>;
const DDB_LOADERS: Readonly<Record<string, (file: string) => Promise<unknown>>> = {
  lb: (f) => import(`./repos/library/ddb/${f}.ts`),
  ac: (f) => import(`./repos/account/ddb/${f}.ts`),
  sc: (f) => import(`./repos/social/ddb/${f}.ts`),
  sg: (f) => import(`./repos/social/graph-ddb/${f}.ts`),
  pd: (f) => import(`./repos/account/paid-ddb/${f}.ts`),
  sf: (f) => import(`./repos/safety/ddb/${f}.ts`),
  st: (f) => import(`./repos/studio/ddb/${f}.ts`),
  dv: (f) => import(`./repos/discover/ddb/${f}.ts`),
  sl: (f) => import(`./repos/social/lists-ddb/${f}.ts`),
};

/**
 * Wraps a Postgres repo body. `mod` names the DynamoDB module as `<lane>/<file>` (e.g. `lb/episodes`);
 * its export `name` takes `(store, db, ...args)` and returns what `pg` returns.
 */
export function dual<F extends (db: any, ...args: any[]) => Promise<any>>(mod: string, name: string, pg: F): F {
  const wrapped = (db: Db, ...args: unknown[]) => {
    const on = ATTACHED.get(db);
    return on ? callDdb(mod, name, on, db, args) : pg(db, ...args);
  };
  return wrapped as unknown as F;
}

async function callDdb(mod: string, name: string, on: Attached, db: Db, args: unknown[]): Promise<unknown> {
  const [lane, file] = mod.split('/') as [string, string];
  const load = DDB_LOADERS[lane];
  if (!load) throw new Error(`backend: unknown lane ${lane} in ${mod}`);
  const m = (await load(file)) as Loaded;
  const fn = m[name];
  if (!fn) throw new Error(`backend: ${mod} has no DynamoDB body ${name}`);
  return fn(on.store, db, ...args);
}
