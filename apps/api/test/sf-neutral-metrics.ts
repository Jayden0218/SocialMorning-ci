// Dashboard test helpers that work on both backends: Postgres SQL by default, DynamoDB items when the test runs hybrid (TEST_BACKEND=ddb).
/**
 * M26 lane SF (admin-metrics.test.ts). The dashboard's seed sets times the app's own functions cannot (a listener
 * who joined 3 days ago, a session last seen 10 days ago, a day of app use 2 days ago, an unsubscribe yesterday)
 * and reads tables that are lane AC/LB items in the hybrid run (`daily_active`, `cache`). Each helper does the SQL
 * the test used to inline, or — with `t.store` — the same on the items (DynamoDB modules loaded dynamically, so the
 * Postgres coverage run never loads them). Rows of lanes still on Postgres stay `t.q` in the test.
 */
import type { TestDb } from './harness.ts';
import { deleteAccount } from '../src/db/repos/account/delete-account.ts';

const ddb = async () => {
  const [K, store, codec, seq] = await Promise.all([
    import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts'), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/seq.ts'),
  ]);
  return { K, ...store, ...codec, ...seq };
};

/** The listener joined at `createdAtIso` and is suspended now. */
export async function joinedAndSuspended(t: TestDb, id: string, createdAtIso: string): Promise<void> {
  if (t.store) {
    const { K, update } = await ddb();
    const at = new Date(createdAtIso).toISOString();
    await update(t.store, 'main', K.listener(id), {
      update: 'SET #c = :c, #s = :s, G4SK = :g', condition: 'attribute_exists(PK)',
      names: { '#c': 'createdAt', '#s': 'suspendedAt' },
      values: { ':c': at, ':s': new Date().toISOString(), ':g': K.G4('listeners', at, id).G4SK },
    });
    return;
  }
  await t.q('UPDATE listeners SET created_at = $2, suspended_at = now() WHERE id = $1', [id, createdAtIso]);
}

/** Every session of the listener was last seen `msAgo` ago. */
export async function lastSeenAgo(t: TestDb, listenerId: string, msAgo: number): Promise<void> {
  const iso = new Date(Date.now() - msAgo).toISOString();
  if (t.store) {
    const { K, queryPage, update } = await ddb();
    const ptrs = (await queryPage(t.store, 'main', {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': K.LISTENER_SK.sessions }, ConsistentRead: true,
    })).Items ?? [];
    for (const p of ptrs) {
      await update(t.store, 'main', K.session(String(p['tokenHash'])), { update: 'SET lastSeenAt = :v', condition: 'attribute_exists(PK)', values: { ':v': iso } });
    }
    return;
  }
  await t.q('UPDATE sessions SET last_seen_at = $2 WHERE listener_id = $1', [listenerId, iso]);
}

/** A day of app use (UTC+8 day `yyyy-mm-dd`). */
export async function addDailyActive(t: TestDb, day: string, listenerId: string): Promise<void> {
  if (t.store) {
    const { K, put, encode } = await ddb();
    await put(t.store, 'events', encode('dailyActive', K.ev.dailyActive(day, listenerId), { day, listenerId }));
    return;
  }
  await t.q('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $2)', [day, listenerId]);
}

/**
 * The stored days of app use, oldest first. Postgres: the whole table. DynamoDB has no table to list without a
 * Scan, so it reads the day partitions `days` (pass every day the test could have written).
 */
export async function dailyActiveRows(t: TestDb, days: readonly string[]): Promise<{ listener_id: string; day: string }[]> {
  if (t.store) {
    const { K, queryPage } = await ddb();
    const out: { listener_id: string; day: string }[] = [];
    for (const day of [...days].sort()) {
      const items = (await queryPage(t.store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.ev.dailyActive(day, '-').PK }, ConsistentRead: true })).Items ?? [];
      for (const it of items) out.push({ listener_id: String(it['SK']), day });
    }
    return out;
  }
  return t.q<{ listener_id: string; day: string }>('SELECT listener_id, day::text AS day FROM daily_active ORDER BY day, listener_id');
}

/** A subscription event at a given time (the app's merge stamps its events "now"). */
export async function subscriptionEventAt(t: TestDb, listenerId: string, feedUrl: string, kind: 'sub' | 'unsub', atIso: string): Promise<void> {
  if (t.store) {
    const { K, put, encode, nextSeq } = await ddb();
    const at = new Date(atIso).toISOString();
    const id = await nextSeq(t.store, 'subscription_events');
    await put(t.store, 'events', encode('subscriptionEvent', K.ev.subscriptionEvent(feedUrl, at, id), { id, listenerId, feedUrl, kind, at }, {
      gsi: K.E1(at.slice(0, 10), 'se', `${K.feedKey(feedUrl)}#${id}`),
    }));
    return;
  }
  await t.q('INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $2, $3, $4)', [listenerId, feedUrl, kind, atIso]);
}

/** Whether a cache entry is stored under `key`. */
export async function cacheKeyExists(t: TestDb, key: string): Promise<boolean> {
  if (t.store) {
    const { K, get } = await ddb();
    return Boolean(await get(t.store, 'cache', K.cacheEntry(key)));
  }
  return (await t.q('SELECT 1 FROM cache WHERE key = $1', [key])).length > 0;
}

/** The account is deleted (Postgres: the row, its rows cascade; DynamoDB: the app's own deletion). */
export async function deleteListener(t: TestDb, id: string): Promise<void> {
  if (t.store) { await deleteAccount(t.db, id); return; }
  await t.q('DELETE FROM listeners WHERE id = $1', [id]);
}
