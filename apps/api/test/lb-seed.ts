// Lane LB test helpers that seed and read library/catalog data on whichever backend the test runs (TEST_BACKEND).
/**
 * M26 lane LB (tasks.md "convert the lane's test files from t.q() to fixtures.ts"). The lane's test files run
 * on BOTH backends while the domains move one by one: on Postgres (the gate, postgres-api) each helper is the
 * SQL the test used to hold; under TEST_BACKEND=ddb it writes/reads the DynamoDB items through test/fixtures.ts
 * or the lane's own item code — and, for rows another lane's SQL still reads (the cache, an episode's cover),
 * the Postgres row too, as the bridge does (src/db/backend.ts).
 * DynamoDB modules are imported only on the DynamoDB path, so the Postgres runs never load the AWS SDK.
 */
import type { TestDb } from './harness.ts';
import { TEST_BACKEND } from './harness.ts';

const DDB = TEST_BACKEND === 'ddb';

async function scanType(t: TestDb, table: 'main' | 'events' | 'cache', type: string): Promise<Record<string, unknown>[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const out: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = (await t.store!.send(new ScanCommand({
      TableName: t.store!.tables[table], FilterExpression: '#t = :t', ExpressionAttributeNames: { '#t': 't' }, ExpressionAttributeValues: { ':t': type }, ConsistentRead: true,
      ...(start ? { ExclusiveStartKey: start } : {}),
    }))) as { Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> };
    out.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}

/** A cache row `ageMs` old (replaces `INSERT INTO cache … fetched_at = now() - …`). */
export async function seedCacheRow(t: TestDb, key: string, body: unknown, ageMs = 0): Promise<void> {
  await t.q(`INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, now() - ($3::text || ' milliseconds')::interval)
             ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = EXCLUDED.fetched_at`, [key, JSON.stringify(body), String(ageMs)]);
  if (DDB) {
    const { cacheItem } = await import('./fixtures.ts');
    await cacheItem(t.store!, key, body, new Date(Date.now() - ageMs).toISOString());
  }
}

/** Makes every cache row `ageMs` old (replaces `UPDATE cache SET fetched_at = now() - …`). */
export async function ageAllCache(t: TestDb, ageMs: number): Promise<void> {
  await t.q(`UPDATE cache SET fetched_at = now() - ($1::text || ' milliseconds')::interval`, [String(ageMs)]);
  if (DDB) {
    const { backdate } = await import('./fixtures.ts');
    for (const it of await scanType(t, 'cache', 'cacheEntry')) {
      await backdate(t.store!, 'cacheEntry', { PK: String(it['PK']), SK: String(it['SK']) }, 'fetchedAt', new Date(Date.now() - ageMs).toISOString());
    }
  }
}

/** The cached body under `key` (either jsonb shape on Postgres), or undefined. */
export async function cacheBodyOf(t: TestDb, key: string): Promise<unknown> {
  if (DDB) {
    const { readEntry } = await import('../src/db/repos/library/ddb/cache.ts');
    return (await readEntry(t.store!, key))?.body;
  }
  const [row] = await t.q<{ body: unknown }>('SELECT body FROM cache WHERE key = $1', [key]);
  return typeof row?.body === 'string' ? JSON.parse(row.body) : row?.body;
}

/** Every cache key, sorted. */
export async function cacheKeys(t: TestDb): Promise<string[]> {
  if (DDB) return (await scanType(t, 'cache', 'cacheEntry')).map((it) => String(it['key'])).sort();
  return (await t.q<{ key: string }>('SELECT key FROM cache ORDER BY key')).map((r) => r.key);
}

/** Deletes every cache row under a prefix (replaces `DELETE FROM cache WHERE key LIKE '<prefix>%'`). */
export async function clearCachePrefix(t: TestDb, prefix: string): Promise<void> {
  await t.q('DELETE FROM cache WHERE key LIKE $1', [`${prefix}%`]);
  if (DDB) {
    const { deleteEntry } = await import('../src/db/repos/library/ddb/cache.ts');
    for (const it of await scanType(t, 'cache', 'cacheEntry')) if (String(it['key']).startsWith(prefix)) await deleteEntry(t.store!, String(it['key']));
  }
}

/** How many listened-range rows (one per listener × episode × day × device), optionally one listener's. */
export async function countListenedRanges(t: TestDb, listenerId?: string): Promise<number> {
  if (DDB) return (await scanType(t, 'main', 'listenedRange')).filter((it) => listenerId === undefined || it['listenerId'] === listenerId).length;
  const [r] = listenerId === undefined
    ? await t.q<{ n: number }>('SELECT count(*)::int AS n FROM listened_ranges')
    : await t.q<{ n: number }>('SELECT count(*)::int AS n FROM listened_ranges WHERE listener_id = $1', [listenerId]);
  return Number(r!.n);
}

/** The distinct feed addresses of every registered episode, sorted. */
export async function episodeFeedUrls(t: TestDb): Promise<string[]> {
  if (DDB) return [...new Set((await scanType(t, 'main', 'episode')).map((it) => String(it['feedUrl'])))].sort();
  return (await t.q<{ feed_url: string }>('SELECT DISTINCT feed_url FROM episodes ORDER BY feed_url')).map((r) => r.feed_url);
}

/** How many episodes a feed has registered. */
export async function episodeCountOf(t: TestDb, feedUrl: string): Promise<number> {
  return (await episodeFeedUrlsWithCount(t)).get(feedUrl) ?? 0;
}

async function episodeFeedUrlsWithCount(t: TestDb): Promise<Map<string, number>> {
  const urls = DDB
    ? (await scanType(t, 'main', 'episode')).map((it) => String(it['feedUrl']))
    : (await t.q<{ feed_url: string }>('SELECT feed_url FROM episodes')).map((r) => r.feed_url);
  const m = new Map<string, number>();
  for (const u of urls) m.set(u, (m.get(u) ?? 0) + 1);
  return m;
}

/** A listener's live subscriptions (feed addresses, sorted). */
export async function liveFeedsOf(t: TestDb, listenerId: string): Promise<string[]> {
  if (DDB) {
    return (await scanType(t, 'main', 'subscription')).filter((it) => it['listenerId'] === listenerId && !it['deletedAt']).map((it) => String(it['feedUrl'])).sort();
  }
  return (await t.q<{ feed_url: string }>('SELECT feed_url FROM subscriptions WHERE listener_id = $1 AND deleted_at IS NULL ORDER BY feed_url', [listenerId])).map((r) => r.feed_url);
}

/** The subscription events of one kind for a feed. */
export async function subscriptionEventCount(t: TestDb, feedUrl: string, kind: 'sub' | 'unsub'): Promise<number> {
  if (DDB) return (await scanType(t, 'events', 'subscriptionEvent')).filter((it) => it['feedUrl'] === feedUrl && it['kind'] === kind).length;
  return (await t.q('SELECT 1 FROM subscription_events WHERE kind = $2 AND feed_url = $1', [feedUrl, kind])).length;
}

/** A recommendation event at a given time (replaces `INSERT INTO rec_events …`). */
export async function seedRecEvent(t: TestDb, e: { listenerId: string; episodeId: string; at: string }): Promise<void> {
  if (DDB) {
    const { recEventItem } = await import('./fixtures.ts');
    await recEventItem(t.store!, e);
    return;
  }
  await t.q(`INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind, at) VALUES ($1, $2, 'pick', 0, 'open', $3)`, [e.listenerId, e.episodeId, e.at]);
}

/** The episode ids of every stored recommendation event. */
export async function recEventEpisodeIds(t: TestDb): Promise<string[]> {
  if (DDB) return (await scanType(t, 'events', 'recEvent')).map((it) => String(it['episodeId'])).sort();
  return (await t.q<{ episode_id: string }>('SELECT episode_id FROM rec_events ORDER BY episode_id')).map((r) => r.episode_id);
}

/** Sets an episode's cover address (replaces `UPDATE episodes SET image_url = …`). */
export async function setEpisodeImage(t: TestDb, episodeId: string, imageUrl: string): Promise<void> {
  await t.q('UPDATE episodes SET image_url = $2 WHERE id = $1', [episodeId, imageUrl]);
  if (DDB) {
    const { update } = await import('../src/db/ddb/store.ts');
    const K = await import('../src/db/ddb/keys.ts');
    await update(t.store!, 'main', K.episode(episodeId), { update: 'SET #i = :i', condition: 'attribute_exists(PK)', names: { '#i': 'imageUrl' }, values: { ':i': imageUrl } });
  }
}
