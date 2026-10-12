// Attaches a DynamoDB Store to a Db handle, so a repo function runs on DynamoDB (backend.ts).
import { ATTACHED, type Attached } from './backend.ts';
import type { Db } from './db.ts';
import type { Store } from './ddb/store.ts';

/** A new Db handle carrying `store`. Re-attaching a handle that already has a Store (a test's fault-injecting Store) replaces it. */
export function withStore(_given: Db | undefined, store: Store): Db {
  const wrapped: Db = { transaction: (fn) => fn(wrapped) };
  ATTACHED.set(wrapped, { store });
  return wrapped;
}

/** What `withStore` attached to this handle (throws on a plain object — a repo function was called without a Store). */
export function attachedOf(db: Db): Attached {
  const a = ATTACHED.get(db);
  if (!a) throw new Error('backend: this Db has no Store attached');
  return a;
}
