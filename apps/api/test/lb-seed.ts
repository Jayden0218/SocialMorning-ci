/**
 * Lane LB test helpers: seed and read library/catalog data (cache entries, listened ranges, episodes, subscriptions,
 * recommendation events) as DynamoDB items, through test/fixtures.ts or the lane's own item code.
 */
import type { TestDb } from './harness.ts';

async function scanType(t: TestDb, table: 'main' | 'events' | 'cache', type: string): Promise<Record<string, unknown>[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const out: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = (await t.store.send(new ScanCommand({
      TableName: t.store.tables[table], FilterExpression: '#t = :t', ExpressionAttributeNames: { '#t': 't' }, ExpressionAttributeValues: { ':t': type }, ConsistentRead: true,
      ...(start ? { ExclusiveStartKey: start } : {}),
    }))) as { Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> };
    out.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}

/** A cache entry `ageMs` old. */
export async function seedCacheRow(t: TestDb, key: string, body: unknown, ageMs = 0): Promise<void> {
  const { cacheItem } = await import('./fixtures.ts');
  await cacheItem(t.store, key, body, new Date(Date.now() - ageMs).toISOString());
}

/** Makes every cache entry `ageMs` old. */
export async function ageAllCache(t: TestDb, ageMs: number): Promise<void> {
  const { backdate } = await import('./fixtures.ts');
  for (const it of await scanType(t, 'cache', 'cacheEntry')) {
    await backdate(t.store, 'cacheEntry', { PK: String(it['PK']), SK: String(it['SK']) }, 'fetchedAt', new Date(Date.now() - ageMs).toISOString());
  }
}

/** The cached body under `key`, or undefined. */
export async function cacheBodyOf(t: TestDb, key: string): Promise<unknown> {
  const { readEntry } = await import('../src/db/repos/library/ddb/cache.ts');
  return (await readEntry(t.store, key))?.body;
}

/** Every cache key, sorted. */
export async function cacheKeys(t: TestDb): Promise<string[]> {
  return (await scanType(t, 'cache', 'cacheEntry')).map((it) => String(it['key'])).sort();
}

/** Deletes every cache entry under a prefix. */
export async function clearCachePrefix(t: TestDb, prefix: string): Promise<void> {
  const { deleteEntry } = await import('../src/db/repos/library/ddb/cache.ts');
  for (const it of await scanType(t, 'cache', 'cacheEntry')) if (String(it['key']).startsWith(prefix)) await deleteEntry(t.store, String(it['key']));
}

/** How many listened-range rows (one per listener × episode × day × device), optionally one listener's. */
export async function countListenedRanges(t: TestDb, listenerId?: string): Promise<number> {
  return (await scanType(t, 'main', 'listenedRange')).filter((it) => listenerId === undefined || it['listenerId'] === listenerId).length;
}

/** The distinct feed addresses of every registered episode, sorted. */
export async function episodeFeedUrls(t: TestDb): Promise<string[]> {
  return [...new Set((await scanType(t, 'main', 'episode')).map((it) => String(it['feedUrl'])))].sort();
}

/** M26 lane NB: one registered episode of a feed — its publisher date and genre. */
export async function oneEpisodeOf(t: TestDb, feedUrl: string): Promise<{ published_at: string | null; genre_id: number | null } | undefined> {
  const it = (await scanType(t, 'main', 'episode')).find((e) => e['feedUrl'] === feedUrl);
  return it ? { published_at: it['publishedAt'] == null ? null : String(it['publishedAt']), genre_id: it['genreId'] == null ? null : Number(it['genreId']) } : undefined;
}

/** How many episodes a feed has registered. */
export async function episodeCountOf(t: TestDb, feedUrl: string): Promise<number> {
  return (await episodeFeedUrlsWithCount(t)).get(feedUrl) ?? 0;
}

async function episodeFeedUrlsWithCount(t: TestDb): Promise<Map<string, number>> {
  const urls = (await scanType(t, 'main', 'episode')).map((it) => String(it['feedUrl']));
  const m = new Map<string, number>();
  for (const u of urls) m.set(u, (m.get(u) ?? 0) + 1);
  return m;
}

/** A listener's live subscriptions (feed addresses, sorted). */
export async function liveFeedsOf(t: TestDb, listenerId: string): Promise<string[]> {
  return (await scanType(t, 'main', 'subscription')).filter((it) => it['listenerId'] === listenerId && !it['deletedAt']).map((it) => String(it['feedUrl'])).sort();
}

/** The subscription events of one kind for a feed. */
export async function subscriptionEventCount(t: TestDb, feedUrl: string, kind: 'sub' | 'unsub'): Promise<number> {
  return (await scanType(t, 'events', 'subscriptionEvent')).filter((it) => it['feedUrl'] === feedUrl && it['kind'] === kind).length;
}

/** A recommendation event at a given time. */
export async function seedRecEvent(t: TestDb, e: { listenerId: string; episodeId: string; at: string }): Promise<void> {
  const { recEventItem } = await import('./fixtures.ts');
  await recEventItem(t.store, e);
}

/** The episode ids of every stored recommendation event. */
export async function recEventEpisodeIds(t: TestDb): Promise<string[]> {
  return (await scanType(t, 'events', 'recEvent')).map((it) => String(it['episodeId'])).sort();
}

/** Sets an episode's cover address. */
export async function setEpisodeImage(t: TestDb, episodeId: string, imageUrl: string): Promise<void> {
  const { update } = await import('../src/db/ddb/store.ts');
  const K = await import('../src/db/ddb/keys.ts');
  await update(t.store, 'main', K.episode(episodeId), { update: 'SET #i = :i', condition: 'attribute_exists(PK)', names: { '#i': 'imageUrl' }, values: { ':i': imageUrl } });
}
