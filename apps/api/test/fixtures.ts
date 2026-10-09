// Test fixtures for DynamoDB: typed item writers per entity, a test clock, and backdate() instead of SQL UPDATEs.
/**
 * M26 F0-09 (plan.md "test strategy"). Replaces `t.q('INSERT …')` seeds and the 72 back-dating UPDATEs:
 * - writers put the item(s) an entity needs — the row, its uniqueness item, its GSI keys — in ONE transaction,
 *   with the keys of src/db/ddb/keys.ts and the codec (so a fixture can never write a key a repo would not);
 * - `testClock` is the Store's clock: a test moves time instead of rewriting `created_at`;
 * - `backdate(store, type, key, field, iso)` sets one time attribute on an existing item.
 * The attribute names follow data-model.md §3 in camelCase; the domain lane that owns an entity owns its shape
 * and updates the writer here when it changes it.
 *
 * Import ONLY from DynamoDB tests (test/ddb-*.test.ts, behind `DDB_ENDPOINT`), never from a Postgres test:
 * it loads the AWS SDK and src/db/ddb/*.
 */
import { randomUUID } from 'node:crypto';
import { encode, ITEM_TYPES, type ItemType } from '../src/db/ddb/codec.ts';
import * as K from '../src/db/ddb/keys.ts';
import { queryAll } from '../src/db/ddb/paginate.ts';
import { get, update, type Clock, type Item, type Key, type Store } from '../src/db/ddb/store.ts';
import { tx } from '../src/db/ddb/tx.ts';
import { claimUnique } from '../src/db/ddb/unique.ts';

/** True where DynamoDB Local is reachable (ddb-api.yml). DynamoDB tests skip without it. */
export const DDB_ON = Boolean(process.env['DDB_ENDPOINT']);

export type TestClock = Clock & { set(iso: string | number): void; advance(ms: number): void; iso(): string };
export function testClock(start: string | number = '2026-10-10T00:00:00.000Z'): TestClock {
  let now = typeof start === 'number' ? start : Date.parse(start);
  return {
    now: () => now,
    set: (t) => { now = typeof t === 'number' ? t : Date.parse(t); },
    advance: (ms) => { now += ms; },
    iso: () => new Date(now).toISOString(),
  };
}

/** Sets one time attribute of an existing item (replaces `UPDATE … SET created_at = …`). */
export async function backdate(store: Store, type: ItemType, key: Key, field: string, iso: string): Promise<void> {
  const def = ITEM_TYPES[type];
  if (def.attrs !== 'open' && !(def.attrs as readonly string[]).includes(field)) throw new Error(`backdate: ${type}.${field} is not in its allowlist`);
  if (Number.isNaN(Date.parse(iso))) throw new Error(`backdate: not a time: ${iso}`);
  await update(store, def.table, key, {
    update: 'SET #f = :v',
    condition: 'attribute_exists(PK) AND #t = :type',
    names: { '#f': field, '#t': 't' },
    values: { ':v': new Date(iso).toISOString(), ':type': type },
  });
}

const now = (store: Store) => new Date(store.clock.now()).toISOString();

export async function listenerItem(store: Store, l: { id?: string; email: string; displayName: string; flags?: Record<string, unknown>; createdAt?: string }): Promise<string> {
  const id = l.id ?? randomUUID();
  const createdAt = l.createdAt ?? now(store);
  const t = tx(store).put('main', encode('listener', K.listener(id), {
    id, email: l.email.trim().toLowerCase(), displayName: l.displayName, createdAt, listenedMs: 0, followerCount: 0, followingCount: 0,
    rulesAcceptedAt: createdAt, ...(l.flags ?? {}),
  }, { gsi: { ...K.G6(l.displayName, id), ...K.G4('listeners', createdAt, id) } }), { condition: 'attribute_not_exists(PK)' });
  claimUnique(t, K.U.email(l.email), id);
  await t.commit();
  return id;
}

export async function episodeItem(store: Store, e: { id: string; feedUrl: string; guid?: string; title: string; durationMs?: number | null; publishedAt?: string | null; genreId?: number; showTitle?: string }): Promise<void> {
  const guid = e.guid ?? e.id;
  const gsi: Record<string, string> = { ...K.G2eps(e.feedUrl, e.publishedAt ?? null, e.id) };
  if (e.genreId !== undefined && e.publishedAt) Object.assign(gsi, K.G3eps(e.genreId, e.publishedAt, e.id));
  const t = tx(store).put('main', encode('episode', K.episode(e.id), {
    id: e.id, feedUrl: e.feedUrl, feedKey: K.feedKey(e.feedUrl), guid, title: e.title, showTitle: e.showTitle ?? 'The Show',
    enclosureUrl: `https://cdn.example.com/${e.id}.mp3`, durationMs: e.durationMs ?? null, publishedAt: e.publishedAt ?? null,
    commentCount: 0, listenerCount: 0, likeCount: 0, socialV: 0, firstSeenAt: now(store),
  }, { gsi }), { condition: 'attribute_not_exists(PK)' });
  claimUnique(t, K.U.guid(e.feedUrl, guid), e.id);
  await t.commit();
}

/** `addEpisode` of test/studio-harness.ts, on DynamoDB. */
export const addEpisodeItem = (store: Store, feedUrl: string, id: string, title: string, durationMs: number | null, publishedAt: string | null = null) =>
  episodeItem(store, { id, feedUrl, title, durationMs, publishedAt });

export async function commentItem(store: Store, c: { id?: string; episodeId: string; authorId: string; body: string; createdAt?: string; offsetMs?: number | null; root?: { id: string; createdAt: string } }): Promise<{ id: string; key: Key }> {
  const id = c.id ?? randomUUID();
  const createdAt = c.createdAt ?? now(store);
  const key = c.root ? K.reply(c.episodeId, c.root, createdAt, id) : K.comment(c.episodeId, createdAt, id);
  await tx(store).put('main', encode('comment', key, {
    id, episodeId: c.episodeId, authorId: c.authorId, body: c.body, createdAt, offsetMs: c.offsetMs ?? null,
    parentId: c.root?.id ?? null, likeCount: 0, replyCount: 0, unfriendlyCount: 0,
  }, { gsi: K.G1(c.authorId, c.root ? 'reply' : 'comment', createdAt, id) }), { condition: 'attribute_not_exists(PK)' }).commit();
  return { id, key };
}

export async function subscriptionItem(store: Store, s: { listenerId: string; feedUrl: string; createdAt?: string; deletedAt?: string | null; starredAt?: string | null }): Promise<Key> {
  const createdAt = s.createdAt ?? now(store);
  const key = K.subscription(s.listenerId, s.feedUrl);
  const live = !s.deletedAt;
  await tx(store).put('main', encode('subscription', key, {
    listenerId: s.listenerId, feedUrl: s.feedUrl, createdAt, stamp: createdAt, deletedAt: s.deletedAt ?? null, starredAt: s.starredAt ?? null,
  }, live ? { gsi: K.G2subs(s.feedUrl, createdAt, s.listenerId) } : {})).commit();
  return key;
}

export async function purchaseItem(store: Store, p: { id?: string; listenerId: string; purchaseToken: string; orderId: string; product: string; amountMicros?: number; currency?: string; status?: string; createdAt?: string }): Promise<{ id: string; key: Key }> {
  const id = p.id ?? randomUUID();
  const createdAt = p.createdAt ?? now(store);
  const key = K.purchase(p.purchaseToken);
  const t = tx(store).put('main', encode('purchase', key, {
    id, listenerId: p.listenerId, product: p.product, orderId: p.orderId, amountMicros: p.amountMicros ?? 0, currency: p.currency ?? 'USD',
    status: p.status ?? 'verified', createdAt, granted: [],
  }, { gsi: K.G5('purchase', id, createdAt) }), { condition: 'attribute_not_exists(PK)' });
  claimUnique(t, K.U.txn(p.orderId), id);
  await t.commit();
  return { id, key };
}

export async function entitlementItem(store: Store, e: { listenerId: string; kind: 'plus' | 'show'; ref: string; until?: string | null; startsAt?: string; sourcePurchaseId?: string | null }): Promise<Key> {
  const key = K.entitlement(e.listenerId, e.kind, e.ref);
  await tx(store).put('main', encode('entitlement', key, {
    listenerId: e.listenerId, kind: e.kind, ref: e.ref, until: e.until ?? null, startsAt: e.startsAt ?? now(store), sourcePurchaseId: e.sourcePurchaseId ?? null,
  })).commit();
  return key;
}

export async function tipItem(store: Store, tip: { id?: string; fromListener: string; feedUrl: string; purchaseId: string; amountMicros: number; createdAt?: string }): Promise<Key> {
  const id = tip.id ?? randomUUID();
  const createdAt = tip.createdAt ?? now(store);
  const key = K.earning(tip.feedUrl, createdAt, tip.purchaseId);
  await tx(store).put('main', encode('earning', key, { id, kind: 'tip', fromListener: tip.fromListener, purchaseId: tip.purchaseId, amountMicros: tip.amountMicros, createdAt })).commit();
  return key;
}

export async function moderationActionItem(store: Store, a: { id?: string; actorId: string; action: string; targetKind: string; targetId: string; subjectListenerId?: string | null; createdAt?: string; snapshot?: Record<string, unknown> }): Promise<string> {
  const id = a.id ?? randomUUID();
  const createdAt = a.createdAt ?? now(store);
  await tx(store).put('main', encode('moderationAction', K.moderationAction(id), {
    id, actorId: a.actorId, action: a.action, targetKind: a.targetKind, targetId: a.targetId, subjectListenerId: a.subjectListenerId ?? null,
    snapshot: a.snapshot ?? {}, createdAt,
  }, a.subjectListenerId ? { gsi: K.G5('subject', a.subjectListenerId, createdAt) } : {})).commit();
  return id;
}

export async function hiddenFeedItem(store: Store, h: { feedUrl: string; actionId: string; reason?: string }): Promise<void> {
  await tx(store).put('main', encode('hiddenFeed', K.hiddenFeed(h.feedUrl), { feedUrl: h.feedUrl, actionId: h.actionId, reason: h.reason ?? '', createdAt: now(store) })).commit();
}

export async function cacheItem(store: Store, cacheKey: string, body: unknown, fetchedAt?: string): Promise<void> {
  await tx(store).put('cache', encode('cacheEntry', K.cacheEntry(cacheKey), { key: cacheKey, body: body as never, fetchedAt: fetchedAt ?? now(store) })).commit();
}

/** `proveClaim` of test/studio-harness.ts, on DynamoDB: a proven claim + the one-proven-claim-per-feed item. */
export async function proveClaimItem(store: Store, listenerId: string, feedUrl: string, provenAt = now(store)): Promise<string> {
  const id = randomUUID();
  const code = `socialnet-verify-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
  const t = tx(store).put('main', encode('claim', K.claim(feedUrl, id), { id, listenerId, feedUrl, code, status: 'proven', provenAt }));
  claimUnique(t, K.U.claimCode(code), id);
  claimUnique(t, K.U.proven(feedUrl), id);
  await t.commit();
  return K.feedKey(feedUrl);
}

/**
 * The part of `studioLogin` / `studioLoginNoFactor` that was SQL: mark a session's second factor as passed
 * (`at`) or not (`null`). The session item itself is written by the AC lane's session code.
 */
export async function setSecondFactor(store: Store, tokenHash: string, at: string | null): Promise<void> {
  await update(store, 'main', K.session(tokenHash), {
    update: at ? 'SET #f = :at' : 'REMOVE #f',
    condition: 'attribute_exists(PK)',
    names: { '#f': 'secondFactorAt' },
    ...(at ? { values: { ':at': at } } : {}),
  });
}

/** `auditRows` of test/admin-harness.ts, on DynamoDB: every audit item of the given months (default: the clock's), oldest first. */
export async function auditItems(store: Store, months: string[] = [now(store).slice(0, 7)]): Promise<Item[]> {
  const out: Item[] = [];
  for (const m of months) {
    const { items } = await queryAll(store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `AUDIT#${m}` }, ConsistentRead: true });
    out.push(...items);
  }
  return out;
}

/** A test-only getter: one item by key, strongly (replaces `SELECT … WHERE id = …` asserts). */
export const itemAt = (store: Store, type: ItemType, key: Key) => get(store, ITEM_TYPES[type].table, key, { consistent: true });
