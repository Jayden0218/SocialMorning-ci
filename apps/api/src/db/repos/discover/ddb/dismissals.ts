// "Not interested" on DynamoDB: one item per turned-down episode or show, in the listener's own partition.
/**
 * M26 lane DV (DV-15…DV-19). `L#<id> / DISMISS#<kind>#<episodeId | feedKey>` (type `dismissal`): `kind`, `itemKey`,
 * `createdAt`. One strongly consistent Query reads the set (For You reads it on every request — own write, so never a
 * GSI). Account deletion takes them with the listener partition. Titles for Settings come from lane LB's episode
 * META and show META at read time.
 */
import type { Db } from '../../../db.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { del, put, type Store } from '../../../ddb/store.ts';
import type { Dismissal, DismissalKind, Dismissed } from '../dismissals.ts';
import { nowIso, partitionItems } from './common.ts';

const mine = (store: Store, listenerId: string) => partitionItems(store, K.L(listenerId), { prefix: K.DV_SK.dismissals });

export async function dismissedFor(store: Store, _db: Db, listenerId: string): Promise<Dismissed> {
  const out: Dismissed = { episodes: new Set(), shows: new Set() };
  for (const r of await mine(store, listenerId)) (r['kind'] === 'episode' ? out.episodes : out.shows).add(String(r['itemKey']));
  return out;
}

export async function listDismissals(store: Store, _db: Db, listenerId: string): Promise<Dismissal[]> {
  const rows = (await mine(store, listenerId)).sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? 1 : String(a['createdAt']) > String(b['createdAt']) ? -1 : 0)).slice(0, 500);
  const eps = rows.filter((r) => r['kind'] === 'episode').map((r) => K.episode(String(r['itemKey'])));
  const shows = rows.filter((r) => r['kind'] === 'show').map((r) => K.show(String(r['itemKey'])));
  const got = await batchGetAll(store, 'main', [...eps, ...shows], { consistent: false });
  const epTitle = new Map(got.filter((i) => i['t'] === 'episode').map((i) => [String(i['id']), i['title']]));
  const showTitle = new Map(got.filter((i) => i['t'] === 'show').map((i) => [String(i['feedUrl']), i['newestTitle']]));
  return rows.map((r) => {
    const kind = r['kind'] as DismissalKind;
    const t = kind === 'episode' ? epTitle.get(String(r['itemKey'])) : showTitle.get(String(r['itemKey']));
    return { kind, itemKey: String(r['itemKey']), ...(typeof t === 'string' && t ? { title: t } : {}), createdAt: String(r['createdAt']) };
  });
}

export async function addDismissal(store: Store, _db: Db, listenerId: string, kind: DismissalKind, itemKey: string): Promise<void> {
  try {
    await put(store, 'main', encode('dismissal', K.dismissal(listenerId, kind, itemKey), { kind, itemKey, createdAt: nowIso(store) }), { condition: 'attribute_not_exists(PK)' });
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e; // ON CONFLICT DO NOTHING
  }
}

export async function removeDismissal(store: Store, _db: Db, listenerId: string, kind: DismissalKind, itemKey: string): Promise<void> {
  await del(store, 'main', K.dismissal(listenerId, kind, itemKey));
}

/** Part of For You's cache key: the count and the newest time — any add or restore changes it. */
export async function dismissalStamp(store: Store, _db: Db, listenerId: string): Promise<string> {
  const rows = await mine(store, listenerId);
  const newest = rows.reduce<string | null>((m, r) => (m === null || String(r['createdAt']) > m ? String(r['createdAt']) : m), null);
  return `${rows.length}.${newest ?? '-'}`;
}
