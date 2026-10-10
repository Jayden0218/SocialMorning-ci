// Shared pieces of the social-content lane on DynamoDB: the clock, listener look-ups, comment look-ups by id, retried transactions.
/**
 * M26 lane SC (data-model.md "Lane SC changes"). The bodies in this folder are called by `dual('sc/<file>', …)`
 * (src/db/backend.ts) as `name(store, db, ...args)`. `db` is the app's Postgres handle with the Store attached:
 * - lanes not moved yet (SG follows/mutes/notifications/activity, SF blocks/reports/moderation, ST hosts/held
 *   comments) are reached through THEIR exported repo functions called with `db` (they turn dual when those lanes
 *   move) or, where no such function exists, through the SQL in `sc-foreign.ts`;
 * - lanes already moved (AC listeners, LB episodes/heat/listened) are read through their items and helpers;
 * - every write of this lane also writes its Postgres row while the bridge is on (`sc-bridge.ts`), because the
 *   unmoved lanes still JOIN comments, clips, chat messages, statuses and likes.
 */
import type { Db } from '../../../db.ts';
import { ATTACHED } from '../../../backend.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { withRetry } from '../../../ddb/retry.ts';
import { get, type Item, type Key, type Store } from '../../../ddb/store.ts';
import { tx, type Tx } from '../../../ddb/tx.ts';

export const nowMs = (store: Store): number => store.clock.now();
export const nowIso = (store: Store): string => new Date(store.clock.now()).toISOString();
export const iso = (v: unknown): string => new Date(String(v)).toISOString();
export const keyOf = (i: Item): Key => ({ PK: String(i['PK']), SK: String(i['SK']) });
export const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
export const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));
export const UUID = /^[0-9a-f-]{36}$/i;

/** The bridge is on (backend-ddb.ts): writes also go to the Postgres rows the unmoved lanes read. */
export function rawPg(db: Db): Db | undefined {
  const a = ATTACHED.get(db);
  return a?.bridge ? a.raw : undefined;
}
/** The Postgres side, for reads of lanes that are still there. */
export function pgSide(db: Db): Db {
  const a = ATTACHED.get(db);
  if (!a) throw new Error('social: a DynamoDB body was called without a Store');
  return a.raw;
}

/** The listener item fields this lane shows next to what a listener wrote (lane AC's item, read by key). */
export type Person = {
  id: string; displayName: string; avatarUrl?: string; listenedMs?: number; hideBadge?: boolean; hiddenAt?: string | null;
  suspendedAt?: string | null; likesPublic?: boolean; rulesAcceptedAt?: string;
};

/** Listener items by id (strong BatchGet). A deleted account is simply missing — the old LEFT JOIN's NULLs. */
export async function people(store: Store, ids: Iterable<string | null | undefined>): Promise<Map<string, Person>> {
  const want = [...new Set([...ids].filter((x): x is string => typeof x === 'string' && x.length > 0))];
  if (want.length === 0) return new Map();
  const items = await batchGetAll(store, 'main', want.map((id) => K.listener(id)));
  return new Map(items.map((it) => [String(it['id']), it as unknown as Person]));
}
export async function person(store: Store, id: string): Promise<Person | undefined> {
  return (await get(store, 'main', K.listener(id))) as unknown as Person | undefined;
}
/** Not suspended and not waiting for deletion (the SQL `suspended_at IS NULL AND hidden_at IS NULL`). */
export const visiblePerson = (p: Person | undefined): p is Person => p !== undefined && !p.suspendedAt && !p.hiddenAt;

/** Every item of a partition with a sort-key prefix, strongly consistent (over every 1 MB page). */
export async function prefixItems(store: Store, pk: string, prefix: string, opts: { max?: number; desc?: boolean; keep?: (i: Item) => boolean } = {}): Promise<Item[]> {
  return (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': pk, ':p': prefix }, ConsistentRead: true,
    ...(opts.desc ? { ScanIndexForward: false } : {}),
  }, { ...(opts.max !== undefined ? { max: opts.max } : {}), ...(opts.keep ? { keep: opts.keep } : {}) })).items;
}

/** Every item of a partition, strongly (a whole small partition: a like post, a status). */
export async function partitionAll(store: Store, pk: string): Promise<Item[]> {
  return (await queryAll(store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': pk }, ConsistentRead: true })).items;
}

/** Items whose sort key lies strictly between `lo` and `hi` (both outside the range), strongly; newest first with `desc`. */
export async function rangeItems(store: Store, pk: string, lo: string, hi: string, opts: { max?: number; desc?: boolean; keep?: (i: Item) => boolean } = {}): Promise<Item[]> {
  return (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': pk, ':lo': lo, ':hi': hi }, ConsistentRead: true,
    ...(opts.desc ? { ScanIndexForward: false } : {}),
  }, {
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    keep: (i) => i['SK'] !== lo && i['SK'] !== hi && (opts.keep ? opts.keep(i) : true),
  })).items;
}

/** One transaction, built afresh on each try; a TransactionConflict (two writers on one item) is tried again. */
export async function commitRetry(store: Store, build: (t: Tx) => void | Promise<void>, tries = 6): Promise<void> {
  await withRetry(async () => {
    const t = tx(store);
    await build(t);
    await t.commit();
  }, { tries: 1 }); // RED BREAK G-M26-SC1
}

/** The comment's item from its id (CREF pointer → the item in `EP#<episodeId>`), strongly. */
export async function commentItemById(store: Store, id: string): Promise<Item | undefined> {
  if (!UUID.test(id)) return undefined;
  const ref = await get(store, 'main', K.commentRef(id));
  if (!ref) return undefined;
  return get(store, 'main', { PK: K.EP(String(ref['episodeId'])), SK: String(ref['sk']) });
}

/** The episode's social item update every comment-side change makes (the poll's ETag moves). */
export function bumpSocial(t: Tx, episodeId: string, at: string, extra: { commentCount?: number; likes?: boolean } = {}): void {
  const adds = ['#v :one'];
  const values: Record<string, unknown> = { ':one': 1, ':at': at, ':e': episodeId, ':type': 'episodeSocial' };
  if (extra.commentCount) { adds.push('#cc :cc'); values[':cc'] = extra.commentCount; }
  if (extra.likes) adds.push('#lv :one');
  t.update('main', K.episodeSocial(episodeId), {
    update: `SET #t = if_not_exists(#t, :type), #e = if_not_exists(#e, :e), #u = :at ADD ${adds.join(', ')}`,
    names: { '#t': 't', '#e': 'episodeId', '#u': 'updatedAt', '#v': 'v', ...(extra.commentCount ? { '#cc': 'commentCount' } : {}), ...(extra.likes ? { '#lv': 'likesV' } : {}) },
    values,
    label: 'social',
  });
}

/** Does this comment count on the heat curve (the rebuild's rule: a moment, placed, live, not host-hidden, an author)? */
export const countsOnHeat = (c: Item): boolean =>
  c['offsetMs'] !== undefined && c['offsetMs'] !== null && c['bucket'] !== undefined && c['bucket'] !== null
  && !c['deletedAt'] && !c['hostHiddenAt'] && typeof c['authorId'] === 'string';

/** A top-level comment the episode's count includes (the old `statsFor`: top level, not deleted, removed or host-hidden). */
export const countsAsTop = (c: Item): boolean => !c['parentId'] && !c['deletedAt'] && !c['removedAt'] && !c['hostHiddenAt'];
