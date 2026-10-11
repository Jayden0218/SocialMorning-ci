// adminWrite on DynamoDB: the change and its one audit item in ONE TransactWriteItems; a change too big for one goes audit-first.
/**
 * M26 lane AC (AC-T04; data-model.md §8 "adminWrite"; guard G-A2 keeps its meaning). The admin routes are
 * lanes SF/DV's and still call the Postgres `adminWrite` (auth/admin.ts → db/repos/admin/admin-access.ts);
 * this is what they call when they move:
 *
 *   adminTx(store, ctx, meta, { before, after, write: (t) => { t.update(…); t.put(…) } })
 *
 * - The audit item is `AUDIT#<yyyy-mm>/<id padded>` with a numeric id from `SEQ#audit` (ids stay numbers,
 *   §2), bumped INSIDE the same transaction with a version condition (`seqTxUpdate`) — a racing admin
 *   write cancels the transaction and it is retried, so ids never repeat or skip.
 * - ≤ 98 change items: one transaction (change + audit + sequence ≤ 100): the change cannot happen without
 *   its record and a failed record undoes the change.
 * - More (redeem batch, list replace-all, word bulk-add): the audit item is written FIRST, naming every key
 *   the change will touch and `complete: false`; then the change in chunks; then `complete: true`. The
 *   record is never missing; an interrupted change is visible as an incomplete record.
 * Loaded only by DynamoDB code and its tests (never by the Postgres build).
 */
import type { Store, Item, Key } from '../db/ddb/store.ts';
import { encode } from '../db/ddb/codec.ts';
import * as K from '../db/ddb/keys.ts';
import { tx, type Tx } from '../db/ddb/tx.ts';
import { readSeq, seqTxUpdate } from '../db/ddb/seq.ts';
import { withVersionRetry } from '../db/ddb/retry.ts';
import type { AuditCtx, AuditMeta } from './admin.ts';

export const ADMIN_TX_MAX = 98;

export type AdminChange = {
  before: unknown;
  after: unknown;
  /** Adds the change's writes to `t` (the audit and sequence items are added after it). */
  write: (t: Tx) => void;
};

/** Every (table, key) the change writes, read off a dry-run Tx (for the audit-first record). */
function plannedKeys(store: Store, write: (t: Tx) => void): { t: Tx; keys: string[] } {
  const t = tx(store);
  write(t);
  const keys = (t as unknown as { keys: string[] }).keys.map((k) => k.split('|').slice(1).join('|'));
  return { t, keys };
}

async function auditItem(store: Store, id: number, at: string, ctx: AuditCtx, meta: AuditMeta, before: unknown, after: unknown, extra: Record<string, unknown> = {}): Promise<Item> {
  return encode('audit', K.audit(at, id), {
    id, adminId: ctx.adminId, actingAs: ctx.actingAs ?? null, area: meta.area, action: meta.action, target: meta.target.slice(0, 2048),
    before: before ?? null, after: after ?? null, device: ctx.device ?? null, createdAt: at, ...extra,
  });
}

/** Returns the audit id. */
export async function adminTx(store: Store, ctx: AuditCtx, meta: AuditMeta, change: AdminChange): Promise<number> {
  const at = new Date(store.clock.now()).toISOString();
  const { keys } = plannedKeys(store, change.write);
  if (keys.length <= ADMIN_TX_MAX) {
    return withVersionRetry(async () => {
      const seen = await readSeq(store, 'audit');
      const t = tx(store);
      change.write(t);
      t.put('main', await auditItem(store, seen + 1, at, ctx, meta, change.before, change.after), { condition: 'attribute_not_exists(PK)', label: 'audit' });
      seqTxUpdate(t, 'audit', seen);
      await t.commit();
      return seen + 1;
    });
  }
  // Audit first: the record names every key before any of them changes.
  const id = await withVersionRetry(async () => {
    const seen = await readSeq(store, 'audit');
    const t = tx(store);
    t.put('main', await auditItem(store, seen + 1, at, ctx, meta, change.before, change.after, { keys, complete: false }), { condition: 'attribute_not_exists(PK)', label: 'audit' });
    seqTxUpdate(t, 'audit', seen);
    await t.commit();
    return seen + 1;
  });
  const all = tx(store);
  change.write(all);
  const actions = (all as unknown as { actions: unknown[] }).actions;
  for (let i = 0; i < actions.length; i += ADMIN_TX_MAX) {
    // The Tx builder has no "split" yet: copy a slice of its (TypeScript-private) action list into a new one.
    type Internals = { actions: unknown[]; labels: unknown[]; keys: string[] };
    const part = tx(store);
    const into = part as unknown as Internals;
    const src = all as unknown as Internals;
    into.actions.push(...src.actions.slice(i, i + ADMIN_TX_MAX));
    into.labels.push(...src.labels.slice(i, i + ADMIN_TX_MAX));
    into.keys.push(...src.keys.slice(i, i + ADMIN_TX_MAX));
    await part.commit();
  }
  // The audit item itself is append-only (never updated — lane SF's guard): completion is its own item beside it.
  const key: Key = K.audit(at, id);
  await tx(store).put('main', encode('audit', { PK: key.PK, SK: `${key.SK}#done` }, { id, complete: true, createdAt: new Date(store.clock.now()).toISOString() }), { condition: 'attribute_not_exists(PK)' }).commit();
  return id;
}
