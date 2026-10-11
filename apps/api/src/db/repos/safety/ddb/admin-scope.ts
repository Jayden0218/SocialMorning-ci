// Inside an admin write, a small change joins the admin record's own transaction instead of committing alone.
/**
 * M26 lane SF (adopts lane AC's `adminTx`, src/auth/admin-tx.ts). The admin routes call
 * `adminWrite(db, ctx, meta, read, write)`; on DynamoDB (admin-access.ts) `write` runs inside an admin scope.
 * A repo body that makes one bounded change (a setting, a page, the word list, an appeal decision) builds its
 * Tx and calls `commitOrDefer`: outside a scope it commits as usual; inside one its items are handed to the
 * scope, and adminWrite commits them TOGETHER with the audit item and `SEQ#audit` (adminTx) — the change cannot
 * happen without its record, and a failed record undoes it (guard G-A2 keeps its meaning).
 * A failed condition of a deferred item surfaces as the error the body registered for its label (e.g. a
 * version race → 409 `changed`), exactly as the body would have thrown it alone.
 * Writes that are not deferred (lane AC's listener items, the Postgres tables of lanes not moved yet) commit in
 * the request: the Postgres ones inside adminWrite's Postgres transaction (rolled back if the record fails).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { tx, TxCancelled, type Tx } from '../../../ddb/tx.ts';
import type { Store } from '../../../ddb/store.ts';

export type AdminScope = { store: Store; t: Tx; errors: Map<string, () => Error> };
const als = new AsyncLocalStorage<AdminScope>();

/** Runs `fn` in a new admin scope; returns its result and the collected Tx (empty when nothing deferred). */
export async function inAdminScope<T>(store: Store, fn: () => Promise<T>): Promise<{ result: T; scope: AdminScope }> {
  const scope: AdminScope = { store, t: tx(store), errors: new Map() };
  const result = await als.run(scope, fn);
  return { result, scope };
}

type Internals = { actions: unknown[]; labels: (string | undefined)[]; keys: string[]; bytes: number };
const inner = (t: Tx): Internals => t as unknown as Internals;

/** Appends every item of `from` to `into` (the Tx builder keeps them private; adminTx does the same). */
export function moveActions(from: Tx, into: Tx): void {
  const a = inner(from);
  const b = inner(into);
  b.actions.push(...a.actions);
  b.labels.push(...a.labels);
  b.keys.push(...a.keys);
  b.bytes = (b.bytes ?? 0) + (a.bytes ?? 0);
}

/**
 * Commits `t`, or hands it to the current admin scope. `onFail` maps an item label to the error to throw when
 * that item's condition fails (alone: right here; deferred: when adminWrite commits).
 */
export async function commitOrDefer(store: Store, t: Tx, onFail: Record<string, () => Error> = {}): Promise<void> {
  const scope = als.getStore();
  if (scope && scope.store.tables.main === store.tables.main) {
    moveActions(t, scope.t);
    for (const [label, err] of Object.entries(onFail)) scope.errors.set(label, err);
    return;
  }
  try {
    await t.commit();
  } catch (e) {
    throw mapFailure(e, new Map(Object.entries(onFail)));
  }
}

/** A cancelled transaction whose failed item has a registered error → that error; anything else unchanged. */
export function mapFailure(e: unknown, errors: Map<string, () => Error>): unknown {
  if (!(e instanceof TxCancelled)) return e;
  for (const label of e.failedLabels()) {
    const err = errors.get(label);
    if (err) return err();
  }
  return e;
}
