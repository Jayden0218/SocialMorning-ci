// Shared show lists on DynamoDB: the list item read by its public id, the owner's pointer for export and account deletion.
/**
 * M26 lane LE (gap 1: `shared_lists` had no owning lane and was still SQL). Its own folder (`sl`, src/db/backend.ts) rather
 * than lane SG's or lane DV's: the table is read by three lanes (DV's route, SF's moderation, AC's export and deletion) and
 * written by its own route, so no domain lane owns it more than another; a folder of its own keeps it off the files those
 * lanes edit and gives CUT one place to look.
 *
 *   SL#<id> / LIST              {id, ownerId, title, feedUrls (list, 2–100, in order), createdAt, removedAt}
 *   L#<owner> / SLIST#<id>      {id, createdAt}  — the owner's pointer (data export; the deletion job's `lists` phase)
 *
 * Both are written in one transaction (`attribute_not_exists` on the list: an id clash answers [] as the SQL's
 * ON CONFLICT DO NOTHING RETURNING did). `removedAt` is set and cleared by moderation (lane SF: act / appeal).
 * While the write bridge is on, every write is also made on the Postgres row (backend.ts); nothing reads it there
 * on the DynamoDB path any more. With the bridge off, nothing here touches Postgres.
 */
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, update, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import type { SharedListRow } from '../shared-lists.ts';

const nowIso = (store: Store): string => new Date(store.clock.now()).toISOString();
const urlsOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const PTR = 'SLIST#';

async function listItem(store: Store, id: string): Promise<Item | undefined> {
  return get(store, 'main', K.sharedList(id), { consistent: true });
}

// ---- the dual bodies (social/shared-lists.ts) ----

/** The live list with its owner's name and suspension (the SQL's JOIN listeners: no listener item → no row). */
export async function sharedListRows(store: Store, _db: Db, id: string): Promise<SharedListRow[]> {
  await (await import('../../../backend-ddb.ts')).pgOf(_db).query('SELECT owner_id FROM shared_lists WHERE id = $1', [id]); // LE3 RED
  const it = await listItem(store, id);
  if (!it || it['removedAt']) return [];
  const owner = await get(store, 'main', K.listener(String(it['ownerId'])));
  if (!owner) return [];
  return [{
    id: String(it['id']), title: String(it['title']), feed_urls: urlsOf(it['feedUrls']), created_at: String(it['createdAt']),
    owner_id: String(it['ownerId']), display_name: String(owner['displayName'] ?? ''), suspended_at: (owner['suspendedAt'] as string | null | undefined) ?? null,
  }];
}

/** Returns the id when stored, nothing on an id clash. */
export async function insertSharedList(store: Store, db: Db, id: string, ownerId: string, title: string, feedUrls: string[]): Promise<{ id: string }[]> {
  const createdAt = nowIso(store);
  try {
    await tx(store)
      .put('main', encode('sharedList', K.sharedList(id), { id, ownerId, title, feedUrls, createdAt, removedAt: null }), { condition: 'attribute_not_exists(PK)', label: 'list' })
      .put('main', encode('sharedListPtr', K.sharedListPtr(ownerId, id), { id, createdAt }))
      .commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('list')) return [];
    throw e;
  }
  const raw = bridgeOf(db);
  if (raw) await raw.query('INSERT INTO shared_lists (id, owner_id, title, feed_urls, created_at) VALUES ($1, $2, $3, $4::text[], $5) ON CONFLICT (id) DO NOTHING', [id, ownerId, title, feedUrls, createdAt]);
  return [{ id }];
}

// ---- for the other lanes (called directly from their DynamoDB code) ----

export type ListRow = { owner_id: string; title: string; n: number; removed_at: string | null };

/** Lane SF (reports.ts snapshotTarget): the list as it is now, removed or not. */
export async function sharedListRow(store: Store, id: string): Promise<ListRow | undefined> {
  const it = await listItem(store, id);
  if (!it) return undefined;
  return { owner_id: String(it['ownerId']), title: String(it['title']), n: urlsOf(it['feedUrls']).length, removed_at: (it['removedAt'] as string | null | undefined) ?? null };
}

/** Lane SF (moderation.ts authorOf): who made the list, while it exists. */
export async function sharedListOwner(store: Store, id: string): Promise<string | null> {
  const it = await listItem(store, id);
  return it ? String(it['ownerId']) : null;
}

/**
 * Lane SF (moderation act → remove; an accepted appeal → restore). Remove: only a list not removed yet gets the time (the
 * SQL's `AND removed_at IS NULL`); restore clears it. Idempotent. Returns whether anything changed.
 */
export async function setSharedListRemoved(store: Store, db: Db, id: string, removed: boolean): Promise<boolean> {
  const at = nowIso(store);
  try {
    await update(store, 'main', K.sharedList(id), removed
      ? { update: 'SET #r = :at', condition: 'attribute_exists(PK) AND (attribute_not_exists(#r) OR #r = :null)', names: { '#r': 'removedAt' }, values: { ':at': at, ':null': null } }
      : { update: 'SET #r = :null', condition: 'attribute_exists(PK)', names: { '#r': 'removedAt' }, values: { ':null': null } });
  } catch (e) {
    if (isConditionFailed(e)) return false;
    throw e;
  }
  const raw = bridgeOf(db);
  if (raw) {
    await raw.query(removed ? 'UPDATE shared_lists SET removed_at = $2 WHERE id = $1 AND removed_at IS NULL' : 'UPDATE shared_lists SET removed_at = NULL WHERE id = $1', removed ? [id, at] : [id]);
  }
  return true;
}

/** Lane AC (data export, `sharedLists`): the owner's lists as `SELECT * FROM shared_lists WHERE owner_id = $1` gave them. */
export async function sharedListsOf(store: Store, ownerId: string): Promise<Record<string, unknown>[]> {
  const { items: ptrs } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(ownerId), ':p': PTR }, ConsistentRead: true,
  });
  const out: Record<string, unknown>[] = [];
  for (const p of ptrs) {
    const it = await listItem(store, String(p['id']));
    if (!it || String(it['ownerId']) !== ownerId) continue;
    out.push({ id: String(it['id']), owner_id: ownerId, title: String(it['title']), feed_urls: urlsOf(it['feedUrls']), created_at: String(it['createdAt']), removed_at: (it['removedAt'] as string | null | undefined) ?? null });
  }
  return out;
}

/**
 * Lane AC (the deletion job's `lists` phase, guard G-M26-LE2): the old `owner_id → listeners ON DELETE CASCADE`. Deletes up to
 * `chunk` of the owner's lists with their pointers; true when none is left. Idempotent (a step may run twice).
 */
export async function deleteSharedListsStep(store: Store, ownerId: string, chunk = 12): Promise<boolean> {
  const { items: ptrs } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(ownerId), ':p': PTR }, ConsistentRead: true,
  }, { max: chunk });
  if (ptrs.length === 0) return true;
  await batchWriteAll(store, 'main', ptrs.flatMap((p) => [{ delete: K.sharedList(String(p['id'])) }, { delete: K.sharedListPtr(ownerId, String(p['id'])) }]));
  return false;
}
