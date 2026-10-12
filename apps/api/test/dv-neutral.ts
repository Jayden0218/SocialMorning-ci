/**
 * Lane DV test helpers: seed and read Discover data (episodes, listens, similarity, promotions, search requests, cache
 * ages) as DynamoDB items, through the owning lane's repo or item code (test/fixtures.ts). Seeds of safety rows (hidden
 * feeds, moderation, blocks) are test/sf-neutral.ts; comments are test/sc-neutral.ts; cache rows are test/lb-seed.ts.
 */
import type { Db } from '../src/db/db.ts';
import { upsertEpisode } from '../src/db/repos/library/episodes.ts';
import { appDb, type TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');
const keys = () => import('../src/db/ddb/keys.ts');
const keyOf = (i: Row) => ({ PK: String(i['PK']), SK: String(i['SK']) });
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/**
 * The backend for a test that builds its own app: a fresh table set and the `Db` over it. `call` must `drain()` after
 * each request (the outbox), and `close()` drops the table set.
 */
export async function ownBackend(): Promise<{ db: Db; store: TestDb['store']; drain(): Promise<unknown>; close(): Promise<void> }> {
  return appDb();
}

/** An episode as the app registers it (lane LB's `upsertEpisode`). */
export async function seedEpisode(t: Pick<TestDb, 'db'>, e: {
  id: string; feedUrl: string; guid: string; title: string; showTitle?: string | null; enclosureUrl?: string; imageUrl?: string | null;
  publishedAt?: string | null; durationMs?: number | null; genreId?: number | null; mediaKind?: 'video';
}): Promise<string> {
  await upsertEpisode(t.db, {
    id: e.id, feedUrl: e.feedUrl, guid: e.guid, title: e.title, enclosureUrl: e.enclosureUrl ?? `https://cdn.example.com/${e.guid}.mp3`,
    ...(e.showTitle ? { showTitle: e.showTitle } : {}), ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
    ...(e.publishedAt ? { publishedAt: new Date(e.publishedAt).toISOString() } : {}), ...(e.durationMs ? { durationMs: e.durationMs } : {}),
    ...(e.genreId ? { genreId: e.genreId } : {}), ...(e.mediaKind ? { mediaKind: e.mediaKind } : {}),
  });
  return e.id;
}

/** `n` days before now, ISO (the old `now() - interval 'n days'`). */
export const daysAgo = (n: number) => ago(n * 86_400_000);

/**
 * A `listened` activity row: lane SG's `recordActivity` (the item and its listen-index entry).
 */
export async function seedListen(t: TestDb, actorId: string, episodeId: string, o: { day?: string; hidden?: boolean } = {}): Promise<void> {
  const day = o.day ?? new Date().toISOString().slice(0, 10);
  const { recordActivity } = await import('../src/db/repos/social/graph-ddb/activity.ts');
  await recordActivity(t.store, t.db, { actorId, kind: 'listened', episodeId, day, hidden: o.hidden ?? false });
}

/** A subscription as an old client left it; `deleted` = a tombstone. */
export async function seedSubscription(t: TestDb, listenerId: string, feedUrl: string, o: { deleted?: boolean } = {}): Promise<void> {
  await (await fx()).subscriptionItem(t.store, { listenerId, feedUrl, ...(o.deleted ? { deletedAt: new Date().toISOString() } : {}) });
}

/** A listener with a chosen id (or a generated one), as the item. */
export async function seedListener(t: TestDb, l: { id?: string; email: string; displayName: string }): Promise<string> {
  return (await fx()).listenerItem(t.store, { ...(l.id ? { id: l.id } : {}), email: l.email, displayName: l.displayName });
}

// ---- similarity (lane DV) ----

type SimRow = { show_a: string; show_b: string; sim: number; computed_at: string };

/**
 * A standing neighbourhood (`show_similarity`) and a half-built one (`show_similarity_next`). A current
 * generation with the standing rows and the pointer, and a `building` generation holding the staging rows.
 */
export async function seedSimilarity(t: TestDb, standing: [string, string, number][], staging: [string, string, number][]): Promise<void> {
  const [K, { encode }, { batchWriteAll }, { update }] = await Promise.all([keys(), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/batch.ts'), import('../src/db/ddb/store.ts')]);
  const at = new Date().toISOString();
  const put = (gen: string, rows: [string, string, number][]) => rows.map(([a, b, s]) => ({ put: encode('similarity', K.similarity(gen, a, s, b), { generation: gen, showA: a, showB: b, sim: s, computedAt: at }) }));
  await batchWriteAll(t.store, 'main', [...put('g-standing', standing), ...put('g-staging', staging)]);
  await update(t.store, 'main', K.simPointer(), {
    update: 'SET #t = :t, #g = :g, #c = :c, #b = :b, #n = :n',
    names: { '#t': 't', '#g': 'generation', '#c': 'computedAt', '#b': 'building', '#n': 'buildingRows' },
    values: { ':t': 'simPointer', ':g': 'g-standing', ':c': at, ':b': 'g-staging', ':n': staging.length },
  });
}

/**
 * What readers see as the old rows; `raw` is every stored field of them (the G-R3
 * check: no listener id anywhere).
 */
export async function similarityRows(t: TestDb): Promise<{ rows: SimRow[]; raw: string }> {
  const [{ get }, K] = await Promise.all([import('../src/db/ddb/store.ts'), keys()]);
  const p = await get(t.store, 'main', K.simPointer());
  const gen = p?.['generation'];
  if (typeof gen !== 'string') return { rows: [], raw: '[]' };
  const items = (await (await fx()).acScan(t.store, 'main', 'similarity')).filter((i) => i['generation'] === gen);
  return {
    rows: items.map((i) => ({ show_a: String(i['showA']), show_b: String(i['showB']), sim: Number(i['sim']), computed_at: String(i['computedAt']) })),
    raw: JSON.stringify(items),
  };
}

/** Rows staged by a rebuild that has not swapped yet (`show_similarity_next`). */
export async function similarityStagingCount(t: TestDb): Promise<number> {
  const [{ get }, K] = await Promise.all([import('../src/db/ddb/store.ts'), keys()]);
  const building = (await get(t.store, 'main', K.simPointer()))?.['building'];
  if (typeof building !== 'string') return 0;
  return (await (await fx()).acScan(t.store, 'main', 'similarity')).filter((i) => i['generation'] === building).length;
}

// ---- recommendation events (lane LB's items) ----

/** A recommendation event at a given time. */
export async function seedRecEvent(t: TestDb, e: { listenerId: string; episodeId: string; channel?: string; kind: 'impression' | 'open'; at: string }): Promise<void> {
  await (await fx()).recEventItem(t.store, { listenerId: e.listenerId, episodeId: e.episodeId, channel: e.channel ?? 'sub-new', rank: 0, kind: e.kind, at: e.at });
}

/** Moves every event of a listener `ms` back: each item is re-keyed. */
export async function shiftRecEvents(t: TestDb, listenerId: string, ms: number): Promise<void> {
  const f = await fx();
  const { del } = await import('../src/db/ddb/store.ts');
  for (const i of await f.acScan(t.store, 'events', 'recEvent')) {
    if (i['listenerId'] !== listenerId) continue;
    await del(t.store, 'events', keyOf(i));
    await f.recEventItem(t.store, { listenerId, episodeId: String(i['episodeId']), channel: String(i['channel']), rank: Number(i['rank'] ?? 0), kind: String(i['kind']), at: new Date(Date.parse(String(i['at'])) - ms).toISOString() });
  }
}

// ---- promotions (lane DV) ----

/** One promotion's totals. */
export async function promotionCounts(t: TestDb, id: string): Promise<{ impressions: number; taps: number }> {
  const [{ get }, K] = await Promise.all([import('../src/db/ddb/store.ts'), keys()]);
  const it = await get(t.store, 'main', K.promotion(id));
  return { impressions: Number(it?.['impressions'] ?? 0), taps: Number(it?.['taps'] ?? 0) };
}

/** Everything stored about every promotion, as one string (the "no IP stored" check). */
export async function promotionsDump(t: TestDb): Promise<string> {
  return JSON.stringify(await (await fx()).acScan(t.store, 'main', 'promotion'));
}

/** The promotions' stored field names (G-L2: none may identify a person). */
export async function promotionColumns(t: TestDb): Promise<string[]> {
  const { ITEM_TYPES } = await import('../src/db/ddb/codec.ts');
  return [...(ITEM_TYPES.promotion.attrs as readonly string[])];
}

/** `n` live promotions of `bytes` each . */
export async function seedLivePromotions(t: TestDb, n: number, bytes: number): Promise<void> {
  const { createPromotion } = await import('../src/db/repos/discover/promotions.ts');
  for (let i = 0; i < n; i++) {
    await createPromotion(t.db, {
      imageUrl: `https://store.example/launch/${i}.png`, imagePath: `launch/${i}.png`, imageBytes: bytes, targetKind: 'route', target: '/', label: 'Promotion',
      startsAt: ago(3_600_000), endsAt: ago(-86_400_000), weight: 1, dailyCap: 1,
    });
  }
}

/** Every promotion over (ended a minute ago, started two hours ago). */
export async function endAllPromotions(t: TestDb): Promise<void> {
  const { update } = await import('../src/db/ddb/store.ts');
  for (const p of await (await fx()).acScan(t.store, 'main', 'promotion')) {
    await update(t.store, 'main', keyOf(p), { update: 'SET #e = :e, #s = :s', names: { '#e': 'endsAt', '#s': 'startsAt' }, values: { ':e': ago(60_000), ':s': ago(7_200_000) } });
  }
}

/** The total of all taps (one promotion in the test). */
export async function allTaps(t: TestDb): Promise<number> {
  return (await (await fx()).acScan(t.store, 'main', 'promotion')).reduce((s, p) => s + Number(p['taps'] ?? 0), 0);
}

/** sessions + admin records + rec events + share events — "an event wrote a row somewhere" (G-L2). */
export async function eventSideRows(t: TestDb): Promise<number> {
  const f = await fx();
  const counts = await Promise.all([f.acCount(t.store, 'main', 'session'), f.acCount(t.store, 'main', 'audit'), f.acCount(t.store, 'events', 'recEvent'), f.acCount(t.store, 'events', 'shareEvent')]);
  return counts.reduce((a, b) => a + b, 0);
}

// ---- admin catalogue (lane DV) ----

/** Every saved pick quote, in day then slot order. */
export async function pickWhys(t: TestDb): Promise<string[]> {
  const { listPickItems } = await import('../src/db/repos/library/catalog.ts');
  return (await listPickItems(t.db)).map((r) => r.why);
}

/** Is there an admin row for this day? */
export async function pickDayExists(t: TestDb, day: string): Promise<boolean> {
  const { getPickDay } = await import('../src/db/repos/admin/admin-picks.ts');
  return (await getPickDay(t.db, day)) !== undefined;
}

// ---- search requests (lane DV) ----

/** How many requests are stored. */
export async function searchRequestCount(t: TestDb): Promise<number> {
  return (await (await fx()).acCount(t.store, 'main', 'searchRequest'));
}

// ---- other lanes' rows the Discover tests read ----

/** "Not liking these?" answers of a listener (lane AC's items). */
export async function recFeedbackRows(t: TestDb, listenerId: string): Promise<{ reason: string; note: string | null }[]> {
  return (await (await fx()).acScan(t.store, 'main', 'recFeedback')).filter((i) => String(i['PK']) === `L#${listenerId}`)
    .map((i) => ({ reason: String(i['reason']), note: (i['note'] as string | null | undefined) ?? null }));
}

// ---- helper A (lane DV test conversion) ----

/** [A] One cache item `ms` old. */
export async function ageCacheKey(t: TestDb, key: string, ms: number): Promise<void> {
  const [{ backdate }, K] = await Promise.all([fx(), keys()]);
  await backdate(t.store, 'cacheEntry', K.cacheEntry(key), 'fetchedAt', ago(ms));
}
