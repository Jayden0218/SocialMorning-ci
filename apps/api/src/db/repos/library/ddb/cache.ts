// The cache on DynamoDB (sm-cache): gzip bodies, chunks over 350 KB, a TTL per key prefix, generations for prefix invalidation.
/**
 * M26 lane LB, LB-T08 (patterns LB-37/38, 41/42, 56, 64, 68/69), data-model.md §12–§13.
 *
 * - Entry `CACHE#<sha(key)> / V`: `key`, `fetchedAt`, `w` (the write's id) and either `gz` (the gzipped JSON,
 *   when ≤ 350 KB) or `chunks` = n, with `CHUNK#0000…` items under the same partition holding the gzipped bytes
 *   in ≤ 350 KB pieces (a feed body can be 20 MB — M23; an item is at most 400 KB). Chunks are written first
 *   and the entry last, every piece tagged with the same `w`: a reader that finds a missing piece, or pieces of
 *   another write, treats the entry as a miss (Principle IV — a feed is fetched again; guard G-M26-LB2).
 * - TTL (backstop only — the reader checks `fetchedAt`): `feed:` and `apple:search:` entries 8 days after
 *   `fetchedAt` (the hourly sweep deletes them at 7, as today).
 * - Prefix invalidation without a Scan: `CGEN#<sha(prefix)> / G` holds a generation number for each prefix in
 *   GENERATION_PREFIXES; an entry records the generation it was written under; `invalidateCachePrefix` bumps it,
 *   and every older entry under that prefix reads as a miss from then on (old entries expire by TTL).
 */
import { randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { batchGetAll, batchWriteAll, type WriteRequest } from '../../../ddb/batch.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { update, type Store } from '../../../ddb/store.ts';
import * as pg from '../../cache.ts';

export const CHUNK_BYTES = 350 * 1024;
const DAY_MS = 86_400_000;
/** Prefixes whose entries a whole-prefix invalidation can drop (lane DV's Discover/For You caches). */
export const GENERATION_PREFIXES = ['discover:', 'foryou:'] as const;
const TTL_DAYS: readonly [string, number][] = [['feed:', 8], ['apple:search:', 8]];

const ttlFor = (key: string, fetchedAtMs: number): number | undefined => {
  const hit = TTL_DAYS.find(([p]) => key.startsWith(p));
  return hit ? ttlAfter(fetchedAtMs, hit[1] * DAY_MS) : undefined;
};
const genPrefixesOf = (key: string): string[] => GENERATION_PREFIXES.filter((p) => key.startsWith(p));
const asBytes = (v: unknown): Buffer => Buffer.from(v as Uint8Array);

export type CacheRow<T> = { body: T; fetchedAt: string };

/** The entry, its chunks joined; undefined on a miss (absent, a piece missing or from another write, an older generation). */
export async function readEntry<T>(store: Store, key: string): Promise<CacheRow<T> | undefined> {
  const gens = genPrefixesOf(key);
  const got = await batchGetAll(store, 'cache', [K.cacheEntry(key), ...gens.map((p) => K.cacheGen(p))]);
  const entry = got.find((it) => it['t'] === 'cacheEntry');
  if (!entry) return undefined;
  const gen = got.filter((it) => it['t'] === 'cacheGen').reduce((s, it) => s + Number(it['gen'] ?? 0), 0);
  if (gens.length > 0 && Number(entry['gen'] ?? 0) !== gen) return undefined;
  let json: string;
  if (entry['body'] !== undefined) {
    // An entry written as plain JSON (test fixtures; a value never gzipped) reads as it is.
    return { body: entry['body'] as T, fetchedAt: String(entry['fetchedAt']) };
  } else if (entry['gz'] !== undefined) {
    json = gunzipSync(asBytes(entry['gz'])).toString('utf8');
  } else {
    const n = Number(entry['chunks'] ?? 0);
    const { items } = await queryAll(store, 'cache', {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :c)',
      ExpressionAttributeValues: { ':pk': K.cacheEntry(key).PK, ':c': 'CHUNK#' },
      ConsistentRead: true,
    });
    const mine = items.filter((it) => it['w'] === entry['w']).sort((a, b) => Number(a['n']) - Number(b['n']));
    if (n === 0 || mine.length !== n || mine.some((it, i) => Number(it['n']) !== i)) return undefined;
    try {
      json = gunzipSync(Buffer.concat(mine.map((it) => asBytes(it['data'])))).toString('utf8');
    } catch {
      return undefined;
    }
  }
  return { body: JSON.parse(json) as T, fetchedAt: String(entry['fetchedAt']) };
}

async function currentGen(store: Store, key: string): Promise<number> {
  const gens = genPrefixesOf(key);
  if (gens.length === 0) return 0;
  const got = await batchGetAll(store, 'cache', gens.map((p) => K.cacheGen(p)));
  return got.reduce((s, it) => s + Number(it['gen'] ?? 0), 0);
}

/** Writes `body` under `key`, stamped `fetchedAtMs`: inline when the gzip fits, else chunks then the entry. */
export async function writeEntry(store: Store, key: string, body: unknown, fetchedAtMs: number): Promise<void> {
  const gz = gzipSync(Buffer.from(JSON.stringify(body), 'utf8'));
  const w = randomUUID();
  const fetchedAt = new Date(fetchedAtMs).toISOString();
  const ttl = ttlFor(key, fetchedAtMs);
  const gen = await currentGen(store, key);
  const old = await queryAll(store, 'cache', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :c)',
    ExpressionAttributeValues: { ':pk': K.cacheEntry(key).PK, ':c': 'CHUNK#' },
    ConsistentRead: true,
  });
  const extra = ttl !== undefined ? { ttl } : {};
  if (gz.length <= CHUNK_BYTES) {
    await batchWriteAll(store, 'cache', [{ put: encode('cacheEntry', K.cacheEntry(key), { key, gz: new Uint8Array(gz), fetchedAt, w, gen }, extra) }]);
  } else {
    const n = Math.ceil(gz.length / CHUNK_BYTES);
    const chunks: WriteRequest[] = [];
    for (let i = 0; i < n; i++) {
      chunks.push({ put: encode('cacheChunk', K.cacheChunk(key, i), { n: i, data: new Uint8Array(gz.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)), w }, extra) });
    }
    await batchWriteAll(store, 'cache', chunks);
    await batchWriteAll(store, 'cache', [{ put: encode('cacheEntry', K.cacheEntry(key), { key, chunks: n, fetchedAt, w, gen }, extra) }]);
  }
  // Pieces of the previous write that the new one did not overwrite (it had more chunks).
  const keep = gz.length <= CHUNK_BYTES ? 0 : Math.ceil(gz.length / CHUNK_BYTES);
  const stale = old.items.filter((it) => Number(it['n']) >= keep);
  await batchWriteAll(store, 'cache', stale.map((it) => ({ delete: { PK: String(it['PK']), SK: String(it['SK']) } })));
}

/** Deletes an entry and its chunks. */
export async function deleteEntry(store: Store, key: string): Promise<void> {
  const { items } = await queryAll(store, 'cache', {
    KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.cacheEntry(key).PK }, ConsistentRead: true,
  });
  await batchWriteAll(store, 'cache', items.map((it) => ({ delete: { PK: String(it['PK']), SK: String(it['SK']) } })));
}

export async function cached<T>(store: Store, db: Db, key: string, ttlMs: number, fetch: () => Promise<T>, now: () => number = Date.now): Promise<{ body: T; stale: boolean }> {
  const row = await readEntry<T>(store, key);
  if (row && now() - Date.parse(row.fetchedAt) < ttlMs) return { body: row.body, stale: false };
  try {
    const body = await fetch();
    const at = now();
    await writeEntry(store, key, body, at);
    const raw = bridgeOf(db);
    // The bridge: other lanes' SQL still reads `cache` rows (public pages, hidden feeds, metrics).
    if (raw) await pg.cached(raw, key, 0, async () => body, () => at);
    return { body, stale: false };
  } catch (e) {
    if (row) return { body: row.body, stale: true };
    throw e;
  }
}

/** A marker entry with an empty body; writing it again only refreshes `fetchedAt`. */
export async function touchCacheMarker(store: Store, db: Db, key: string): Promise<void> {
  const now = store.clock.now();
  const ttl = ttlFor(key, now);
  await update(store, 'cache', K.cacheEntry(key), {
    update: `SET #t = :t, #k = :k, #f = :f, #w = if_not_exists(#w, :w), #gz = if_not_exists(#gz, :gz)${ttl !== undefined ? ', #ttl = :ttl' : ''}`,
    names: { '#t': 't', '#k': 'key', '#f': 'fetchedAt', '#w': 'w', '#gz': 'gz', ...(ttl !== undefined ? { '#ttl': 'ttl' } : {}) },
    values: { ':t': 'cacheEntry', ':k': key, ':f': new Date(now).toISOString(), ':w': randomUUID(), ':gz': new Uint8Array(gzipSync('{}')), ...(ttl !== undefined ? { ':ttl': ttl } : {}) },
  });
  const raw = bridgeOf(db);
  if (raw) await pg.touchCacheMarker(raw, key);
}

export async function deleteCacheKey(store: Store, db: Db, key: string): Promise<void> {
  await deleteEntry(store, key);
  const raw = bridgeOf(db);
  if (raw) await pg.deleteCacheKey(raw, key);
}

/** Drops every entry under `prefix` (one of GENERATION_PREFIXES) by moving its generation on. */
export async function invalidateCachePrefix(store: Store, db: Db, prefix: string): Promise<void> {
  if (!(GENERATION_PREFIXES as readonly string[]).includes(prefix)) throw new Error(`cache: ${prefix} is not a generation prefix (${GENERATION_PREFIXES.join(', ')})`);
  await update(store, 'cache', K.cacheGen(prefix), {
    update: 'SET #t = :t, #p = :p ADD #g :one', names: { '#t': 't', '#p': 'prefix', '#g': 'gen' }, values: { ':t': 'cacheGen', ':p': prefix, ':one': 1 },
  });
  const raw = bridgeOf(db);
  if (raw) await pg.invalidateCachePrefix(raw, prefix);
}

/** The one entry's row as the tint code reads it (`body`, `fetched_at`). */
export async function cacheRows(store: Store, key: string): Promise<{ body: unknown; fetched_at: string }[]> {
  const row = await readEntry(store, key);
  return row ? [{ body: row.body, fetched_at: row.fetchedAt }] : [];
}

