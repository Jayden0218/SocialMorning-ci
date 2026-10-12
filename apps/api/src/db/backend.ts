// How a repo function reaches DynamoDB: the Store attached to the Db handle it is given.
/**
 * A repo function keeps one shape, `(db, ...args)`. `viaStore('<lane>/<file>', '<name>')` makes it: it finds the Store
 * attached to `db` (`backend-ddb.ts` `withStore`) and calls the DynamoDB body `ddb/<file>.ts` `<name>(store, db, ...args)`.
 * The DynamoDB module is imported on first call, one literal-prefix `import()` per lane folder (see DDB_LOADERS).
 */
import type { Db } from './db.ts';
import type { Store } from './ddb/store.ts';
import { attachedOf } from './backend-ddb.ts';

export type Attached = { store: Store };

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

/** A DynamoDB body `(store, db, ...args)` seen as the repo function `(db, ...args)`. */
type Bound<D> = D extends (store: Store, db: Db, ...a: infer A) => infer R ? (db: Db, ...a: A) => R : never;

/**
 * A repo function: `mod` names the DynamoDB module as `<lane>/<file>` (e.g. `lb/episodes`); its export `name` takes
 * `(store, db, ...args)`. The `Db` handle a caller holds carries the Store (attached by `backend-ddb.ts`).
 */
export function viaStore<D extends (store: Store, db: Db, ...args: any[]) => Promise<any>>(mod: string, name: string): Bound<D> {
  const wrapped = (db: Db, ...args: unknown[]) => callDdb(mod, name, attachedOf(db), db, args);
  return wrapped as unknown as Bound<D>;
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
