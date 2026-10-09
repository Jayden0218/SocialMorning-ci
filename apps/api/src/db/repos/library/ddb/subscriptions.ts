// Subscriptions on DynamoDB: L#<id>/SUB#<feedKey> merged item by item, the order list, events, the show's subscriber count.
/**
 * M26 lane LB, LB-T03 (patterns LB-26…36), data-model.md §3, §7, §10.
 *
 * - `L#<id> / SUB#<feedKey>`: `feedUrl`, `starred`, `createdAt`, `deletedAt`, `starredAt`, version `v`; while
 *   live it carries G2 `SHSUBS#<feedKey>` / `<createdAt>#<listenerId>` (sparse — Studio list, push fan-out,
 *   the moved-feed job).
 * - The merge is the M8/M12 rule, per feed (the old one-transaction merge becomes one conditional write per
 *   feed — the rule never needed more than the one row): read, decide in code, write with `v = :seen`; a
 *   racing write makes us decide again from what is there now.
 * - A live-state flip writes, in the SAME transaction, the `SE#<feedKey>` event (sm-events, numeric id from
 *   `SEQ#subscription_events`) and `ADD subscriberCount ±1` on the show's META (§7 A). Then the show is put on
 *   (or taken off) the sparse G4 list `Q#feeds` — the hourly feed job's list (LB-53).
 * - `L#<id> / SUBORDER`: the saved order as one list (replaces up to 1 000 row updates).
 */
import type { Db } from '../../../db.ts';
import { bridgeOf, pgOf } from '../../../backend-ddb.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { get, isoNow, put, update, type Item, type Store } from '../../../ddb/store.ts';
import { tx, type Tx } from '../../../ddb/tx.ts';
import * as pg from '../subscriptions.ts';
import type { PublicShow, SubscriptionIn, SubscriptionRow } from '../subscriptions.ts';

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

export function subscriptionRow(it: Item): SubscriptionRow {
  return { feed_url: String(it['feedUrl']), starred: it['starred'] === true, created_at: String(it['createdAt']), deleted_at: str(it['deletedAt']), starred_at: str(it['starredAt']) };
}

const byCreatedDesc = (a: SubscriptionRow, b: SubscriptionRow) => b.created_at.localeCompare(a.created_at);
const iso = (s: string) => new Date(s).toISOString();

export async function subscriptionItems(store: Store, listenerId: string): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': K.LISTENER_SK.subs },
    ConsistentRead: true,
  });
  return items;
}

export async function listAll(store: Store, _db: Db, listenerId: string): Promise<SubscriptionRow[]> {
  return (await subscriptionItems(store, listenerId)).map(subscriptionRow).sort(byCreatedDesc);
}

/** The item for a subscription, with its G2 key while live. */
export function subscriptionItem(listenerId: string, r: SubscriptionRow, v: number): Item {
  const live = r.deleted_at === null;
  return encode('subscription', K.subscription(listenerId, r.feed_url), {
    listenerId, feedUrl: r.feed_url, starred: r.starred, createdAt: r.created_at, deletedAt: r.deleted_at, starredAt: r.starred_at, v,
  }, live ? { gsi: K.G2subs(r.feed_url, r.created_at, listenerId) } : {});
}

/** Adds to `t` what a live-state flip writes besides the row: the event and the show's count. */
export function addFlip(t: Tx, store: Store, listenerId: string, feedUrl: string, kind: 'sub' | 'unsub', eventId: number, at: string): void {
  t.put('events', encode('subscriptionEvent', K.ev.subscriptionEvent(feedUrl, at, eventId), { id: eventId, listenerId, feedUrl, kind, at }, { gsi: K.E1(at.slice(0, 10), 'se', `${K.feedKey(feedUrl)}#${eventId}`) }));
  t.update('main', K.show(feedUrl), {
    update: 'SET #t = if_not_exists(#t, :show), #f = if_not_exists(#f, :f) ADD #c :d',
    names: { '#t': 't', '#f': 'feedUrl', '#c': 'subscriberCount' },
    values: { ':show': 'show', ':f': feedUrl, ':d': kind === 'sub' ? 1 : -1 },
  });
}

/** After a flip: the show is on `Q#feeds` exactly while it has a live subscriber (conditioned on the count read). */
export async function syncFeedQueue(store: Store, feedUrl: string): Promise<void> {
  await withVersionRetry(async () => {
    const meta = await get(store, 'main', K.show(feedUrl));
    if (!meta) return;
    const count = Number(meta['subscriberCount'] ?? 0);
    const listed = meta['G4PK'] !== undefined;
    if (count > 0 && !listed) {
      const g = K.G4feeds(feedUrl);
      await update(store, 'main', K.show(feedUrl), {
        update: 'SET G4PK = :p, G4SK = :s', condition: '#c = :n', names: { '#c': 'subscriberCount' }, values: { ':p': g.G4PK, ':s': g.G4SK, ':n': count },
      });
    } else if (count <= 0 && listed) {
      await update(store, 'main', K.show(feedUrl), { update: 'REMOVE G4PK, G4SK', condition: '#c = :n', names: { '#c': 'subscriberCount' }, values: { ':n': count } });
    }
  });
}

/** Decides one feed by the merge rule; undefined = nothing to write. */
function decide(cur: SubscriptionRow | undefined, next: SubscriptionIn): { row: SubscriptionRow; flip?: 'sub' | 'unsub' } | undefined {
  const nextDeleted = next.deletedAt ? iso(next.deletedAt) : null;
  if (cur === undefined) {
    const row: SubscriptionRow = { feed_url: next.feedUrl, starred: next.starred ?? false, created_at: iso(next.createdAt), deleted_at: nextDeleted, starred_at: next.starredAt ? iso(next.starredAt) : null };
    // A new live row is a subscribe; a row born as a tombstone changes nothing (M11 R4).
    return nextDeleted === null ? { row, flip: 'sub' } : { row };
  }
  const curStamp = pg.stampOf({ createdAt: cur.created_at, deletedAt: cur.deleted_at });
  const nextStamp = pg.stampOf(next);
  const nextIsTombstone = nextDeleted !== null;
  const curIsTombstone = cur.deleted_at !== null;
  const takeNext = nextStamp > curStamp || (nextStamp === curStamp && nextIsTombstone && !curIsTombstone);
  const takeStar = next.starred !== undefined && next.starredAt !== undefined
    && (cur.starred_at === null || new Date(next.starredAt).getTime() > new Date(cur.starred_at).getTime());
  if (!takeNext && !takeStar) return undefined;
  const row: SubscriptionRow = { ...cur };
  if (takeStar) { row.starred = next.starred!; row.starred_at = iso(next.starredAt!); }
  if (!takeNext) return { row };
  const legacyStar = next.starredAt === undefined && cur.starred_at === null ? (next.starred ?? cur.starred) : takeStar ? next.starred! : cur.starred;
  row.created_at = iso(next.createdAt);
  row.deleted_at = nextDeleted;
  row.starred = legacyStar;
  return curIsTombstone !== nextIsTombstone ? { row, flip: nextIsTombstone ? 'unsub' : 'sub' } : { row };
}

/** Writes one decided feed (conditional on the version read); returns the flip it made, if any. */
async function mergeOne(store: Store, listenerId: string, next: SubscriptionIn, first: Item | undefined): Promise<'sub' | 'unsub' | undefined> {
  let known: Item | undefined | null = first ?? null;
  return withVersionRetry(async (attempt) => {
    const cur = attempt === 1 && known !== null ? known : await get(store, 'main', K.subscription(listenerId, next.feedUrl));
    known = null;
    const d = decide(cur ? subscriptionRow(cur) : undefined, next);
    if (!d) return undefined;
    const v = Number(cur?.['v'] ?? 0);
    const t = tx(store).put('main', subscriptionItem(listenerId, d.row, v + 1), cur
      ? (cur['v'] === undefined ? { condition: 'attribute_exists(PK) AND attribute_not_exists(#v)', names: { '#v': 'v' }, label: 'sub' } : { condition: '#v = :seen', names: { '#v': 'v' }, values: { ':seen': v }, label: 'sub' })
      : { condition: 'attribute_not_exists(PK)', label: 'sub' });
    if (d.flip) addFlip(t, store, listenerId, next.feedUrl, d.flip, await nextSeq(store, 'subscription_events'), isoNow(store.clock));
    await t.commit();
    return d.flip;
  });
}

export async function merge(store: Store, db: Db, listenerId: string, items: readonly SubscriptionIn[]): Promise<SubscriptionRow[]> {
  if (items.length > 0) {
    const incoming = new Map<string, SubscriptionIn>();
    for (const i of items) {
      const prev = incoming.get(i.feedUrl);
      if (prev === undefined || pg.stampOf(i) >= pg.stampOf(prev)) incoming.set(i.feedUrl, i);
    }
    const found = await batchGetAll(store, 'main', [...incoming.keys()].map((u) => K.subscription(listenerId, u)));
    const have = new Map(found.map((it) => [String(it['feedUrl']), it]));
    for (const [feedUrl, next] of incoming) {
      const flip = await mergeOne(store, listenerId, next, have.get(feedUrl));
      if (flip) await syncFeedQueue(store, feedUrl);
    }
    const raw = bridgeOf(db);
    if (raw) await pg.merge(raw, listenerId, items);
  }
  return listAll(store, db, listenerId);
}

/** The saved order (feeds the account holds, in the order sent). */
export async function setOrder(store: Store, db: Db, listenerId: string, feedUrls: readonly string[]): Promise<void> {
  const held = new Set((await subscriptionItems(store, listenerId)).map((it) => String(it['feedUrl'])));
  const order = [...new Set(feedUrls)].filter((u) => held.has(u));
  await put(store, 'main', encode('subOrder', K.subOrder(listenerId), { listenerId, feedUrls: order, updatedAt: isoNow(store.clock) }));
  const raw = bridgeOf(db);
  if (raw) await pg.setOrder(raw, listenerId, feedUrls);
}

async function orderOf(store: Store, listenerId: string): Promise<string[]> {
  const it = await get(store, 'main', K.subOrder(listenerId));
  return ((it?.['feedUrls'] as string[] | undefined) ?? []).map(String);
}

export async function getOrder(store: Store, _db: Db, listenerId: string): Promise<string[]> {
  const live = new Set((await subscriptionItems(store, listenerId)).filter((it) => !it['deletedAt']).map((it) => String(it['feedUrl'])));
  return (await orderOf(store, listenerId)).filter((u) => live.has(u));
}

/**
 * LB-36: another listener's public subscriptions — live, in their order then newest first, ≤ 500, hidden
 * feeds left out; title/cover = the host's override, else the newest episode's (the show META, LB-T02).
 * The override (lane ST) and hidden feeds (lane SF) are still Postgres rows: read through `pgOf` until
 * those lanes land (data-model.md "Lane LB changes").
 */
export async function publicSubscriptions(store: Store, db: Db, listenerId: string): Promise<PublicShow[]> {
  const live = (await subscriptionItems(store, listenerId)).map(subscriptionRow).filter((r) => r.deleted_at === null);
  const order = await orderOf(store, listenerId);
  const pos = new Map(order.map((u, i) => [u, i]));
  const urls = live.map((r) => r.feed_url);
  if (urls.length === 0) return [];
  const raw = pgOf(db);
  const hidden = new Set((await raw.query<{ feed_url: string }>('SELECT feed_url FROM hidden_feeds WHERE feed_url = ANY($1::text[])', [urls])).map((r) => r.feed_url));
  const over = new Map((await raw.query<{ feed_url: string; title: string | null; cover_url: string | null }>(
    'SELECT feed_url, title, cover_url FROM show_overrides WHERE feed_url = ANY($1::text[])', [urls])).map((r) => [r.feed_url, r]));
  const shows = new Map((await batchGetAll(store, 'main', urls.map((u) => K.show(u)))).map((it) => [String(it['feedUrl']), it]));
  const rows = live.filter((r) => !hidden.has(r.feed_url)).sort((a, b) => {
    const pa = pos.get(a.feed_url); const pb = pos.get(b.feed_url);
    if (pa !== pb) return pa === undefined ? 1 : pb === undefined ? -1 : pa - pb;
    return byCreatedDesc(a, b);
  }).slice(0, 500);
  return rows.map((r) => {
    const o = over.get(r.feed_url); const s = shows.get(r.feed_url);
    return { feedUrl: r.feed_url, title: o?.title ?? str(s?.['newestTitle']), imageUrl: o?.cover_url ?? str(s?.['newestImage']) };
  });
}
