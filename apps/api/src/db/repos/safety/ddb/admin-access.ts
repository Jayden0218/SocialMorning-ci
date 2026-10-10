// Who is admin and the admin record on DynamoDB: one admins item, and every admin write recorded through lane AC's adminTx.
/**
 * M26 lane SF (SF-T05; AC-T04's adminTx adopted).
 * - Admins: ONE item `CFG#admins` / `V`, a map listenerId → { grantedAt, grantedBy }. "Is admin" is one GetItem;
 *   the M15 rule "there is always at least one admin" (trigger `admins_keep_one`) is one condition on the map's
 *   size when a role is removed (`removeAdmin`). An account deletion takes its entry out without that condition
 *   (the trigger let a deleted listener's row go too).
 * - The record: `adminTx` (src/auth/admin-tx.ts) puts `AUDIT#<yyyy-mm>/<id>` with a numeric id from `SEQ#audit` in
 *   the same TransactWriteItems as the change (≤ 98 items). `adminWrite` runs the route's `write` in an admin
 *   scope (admin-scope.ts): every lane-SF change made there joins that transaction, so change and record commit
 *   together. Its `after` is read once the change has committed and kept beside the record as `<id>#after` —
 *   the record itself is never updated (append-only, store.ts / append-only.ts, guard G-M26-SF3).
 *   A route whose change is not deferrable (lane AC's listener items, lanes still on Postgres) is recorded
 *   right after it, inside adminWrite's Postgres transaction (the Postgres part rolls back if the record fails).
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, put, update } from '../../../ddb/store.ts';
import { adminTx } from '../../../../auth/admin-tx.ts';
import type { AuditCtx, AuditMeta } from '../../../../auth/admin.ts';
import { asObject } from '../../admin/admin-access.ts';
import { inAdminScope, mapFailure, moveActions } from './admin-scope.ts';
import { isUuid, nowIso, type Db, type Store } from './common.ts';

const LAST_ADMIN = 'admins_keep_one: there must always be at least one admin';

async function admins(store: Store): Promise<Record<string, unknown>> {
  return ((await get(store, 'main', K.adminSet()))?.['admins'] as Record<string, unknown> | undefined) ?? {};
}

/** The owner becomes the first admin when there is none; a missing listener is skipped. */
export async function insertOwnerAdmin(store: Store, _db: Db, ownerId: string): Promise<void> {
  if (!isUuid(ownerId) || !(await get(store, 'main', K.listener(ownerId)))) return;
  if (Object.keys(await admins(store)).length > 0) return;
  try {
    await put(store, 'main', encode('adminSet', K.adminSet(), { admins: { [ownerId]: { grantedAt: nowIso(store), grantedBy: null } } }), {
      condition: 'attribute_not_exists(PK) OR size(#a) = :zero', names: { '#a': 'admins' }, values: { ':zero': 0 },
    });
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e; // someone seeded first
  }
}

export async function countAdminsRows(store: Store, _db: Db): Promise<{ n: number }[]> {
  return [{ n: Object.keys(await admins(store)).length }];
}

export async function isAdminRows(store: Store, _db: Db, listenerId: string): Promise<{ ok: boolean }[]> {
  return [{ ok: Object.hasOwn(await admins(store), listenerId) }];
}

/** Removes an admin role; the last one cannot go (the M15 trigger's rule, now one condition). */
export async function removeAdmin(store: Store, _db: Db, listenerId: string): Promise<void> {
  try {
    await update(store, 'main', K.adminSet(), {
      update: 'REMOVE #a.#id', condition: 'attribute_exists(#a.#id) AND size(#a) > :one', names: { '#a': 'admins', '#id': listenerId }, values: { ':one': 0 }, // RED CHECK (G-M26-SF5)
    });
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
    if (Object.hasOwn(await admins(store), listenerId)) throw new Error(LAST_ADMIN);
  }
}

/** Account deletion: the listener's role goes with it (no ≥ 1 check — as the trigger allowed). */
export async function dropAdminOf(store: Store, listenerId: string): Promise<void> {
  try {
    await update(store, 'main', K.adminSet(), { update: 'REMOVE #a.#id', condition: 'attribute_exists(#a.#id)', names: { '#a': 'admins', '#id': listenerId } });
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
  }
}

export async function insertAudit(store: Store, _db: Db, ctx: AuditCtx, meta: AuditMeta, before: unknown, after: unknown): Promise<void> {
  await adminTx(store, ctx, meta, { before: asObject(before), after: asObject(after), write: () => {} });
}

/** The `after` of a record whose change was in its own transaction, beside it (the record is never updated). */
async function putAfter(store: Store, id: number, after: unknown): Promise<void> {
  // The record's month is the month adminTx stamped: now, or (across a month boundary) the one before.
  const now = nowIso(store);
  let at = now;
  if (!(await get(store, 'main', K.audit(now, id)))) {
    const d = new Date(now);
    at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0, 12)).toISOString();
  }
  await put(store, 'main', encode('audit', K.auditAfter(at, id), { id, after: asObject(after), createdAt: now }), { condition: 'attribute_not_exists(PK)' });
}

/**
 * M15 T003 on DynamoDB: read before → write → read after → ONE record. The lane-SF changes `write` makes go into
 * the record's own transaction (see the file comment).
 */
export async function adminWrite<T>(store: Store, db: Db, ctx: AuditCtx, meta: AuditMeta, read: (tx: Db) => Promise<unknown>, write: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (txdb) => {
    const before = await read(txdb);
    const { result, scope } = await inAdminScope(store, () => write(txdb));
    if (scope.t.size === 0) {
      const after = await read(txdb);
      await adminTx(store, ctx, meta, { before: asObject(before), after: asObject(after), write: () => {} });
      return result;
    }
    let id: number;
    try {
      id = await adminTx(store, ctx, meta, { before: asObject(before), after: null, write: (t) => moveActions(scope.t, t) });
    } catch (e) {
      throw mapFailure(e, scope.errors);
    }
    await putAfter(store, id, await read(txdb));
    return result;
  });
}
