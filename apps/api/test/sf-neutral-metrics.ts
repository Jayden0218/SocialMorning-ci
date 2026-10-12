// Dashboard test helpers: seeds and reads of the items the admin dashboard counts, on DynamoDB.
/**
 * M26 lane SF (admin-metrics.test.ts). The dashboard's seed sets times the app's own functions cannot (a listener
 * who joined 3 days ago, a session last seen 10 days ago, a day of app use 2 days ago, an unsubscribe yesterday)
 * and reads items of lane AC/LB (`dailyActive`, `cache`). Each helper writes or reads those items through `t.store`.
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
  const { K, update } = await ddb();
  const at = new Date(createdAtIso).toISOString();
  await update(t.store, 'main', K.listener(id), {
    update: 'SET #c = :c, #s = :s, G4SK = :g', condition: 'attribute_exists(PK)',
    names: { '#c': 'createdAt', '#s': 'suspendedAt' },
    values: { ':c': at, ':s': new Date().toISOString(), ':g': K.G4('listeners', at, id).G4SK },
  });
}

/** Every session of the listener was last seen `msAgo` ago. */
export async function lastSeenAgo(t: TestDb, listenerId: string, msAgo: number): Promise<void> {
  const iso = new Date(Date.now() - msAgo).toISOString();
  const { K, queryPage, update } = await ddb();
  const ptrs = (await queryPage(t.store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': K.LISTENER_SK.sessions }, ConsistentRead: true,
  })).Items ?? [];
  for (const p of ptrs) {
    await update(t.store, 'main', K.session(String(p['tokenHash'])), { update: 'SET lastSeenAt = :v', condition: 'attribute_exists(PK)', values: { ':v': iso } });
  }
}

/** A day of app use (UTC+8 day `yyyy-mm-dd`). */
export async function addDailyActive(t: TestDb, day: string, listenerId: string): Promise<void> {
  const { K, put, encode } = await ddb();
  await put(t.store, 'events', encode('dailyActive', K.ev.dailyActive(day, listenerId), { day, listenerId }));
}

/**
 * The stored days of app use, oldest first. There is no table to list without a Scan, so this reads the
 * day partitions `days` (pass every day the test could have written).
 */
export async function dailyActiveRows(t: TestDb, days: readonly string[]): Promise<{ listener_id: string; day: string }[]> {
  const { K, queryPage } = await ddb();
  const out: { listener_id: string; day: string }[] = [];
  for (const day of [...days].sort()) {
    const items = (await queryPage(t.store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.ev.dailyActive(day, '-').PK }, ConsistentRead: true })).Items ?? [];
    for (const it of items) out.push({ listener_id: String(it['SK']), day });
  }
  return out;
}

/** A subscription event at a given time (the app's merge stamps its events "now"). */
export async function subscriptionEventAt(t: TestDb, listenerId: string, feedUrl: string, kind: 'sub' | 'unsub', atIso: string): Promise<void> {
  const { K, put, encode, nextSeq } = await ddb();
  const at = new Date(atIso).toISOString();
  const id = await nextSeq(t.store, 'subscription_events');
  await put(t.store, 'events', encode('subscriptionEvent', K.ev.subscriptionEvent(feedUrl, at, id), { id, listenerId, feedUrl, kind, at }, {
    gsi: K.E1(at.slice(0, 10), 'se', `${K.feedKey(feedUrl)}#${id}`),
  }));
}

/** Whether a cache entry is stored under `key`. */
export async function cacheKeyExists(t: TestDb, key: string): Promise<boolean> {
  const { K, get } = await ddb();
  return Boolean(await get(t.store, 'cache', K.cacheEntry(key)));
}

/** The account is deleted (the app's own deletion). */
export async function deleteListener(t: TestDb, id: string): Promise<void> {
  await deleteAccount(t.db, id);
}

/**
 * M26 lane LE: the dashboard's social seed — `comments` comments by `a` at `commentsAt`, and now one reaction, one clip, one
 * follow a → b and one live status. Writes the items the dashboard counts
 * (safety/ddb/metrics.ts `socialFromItems`: author pointers `CMT#` / `CLP#` / `VPOST#`, `REACT#`, `FOLLOW#`).
 */
export async function seedSocial(t: TestDb, a: string, b: string, comments: number, commentsAt: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { K, put, encode } = await ddb();
  const { randomUUID } = await import('node:crypto');
  for (let i = 0; i < comments; i++) {
    const id = randomUUID();
    const key = K.comment('e1', commentsAt, id);
    await put(t.store, 'main', encode('comment', key, { id, episodeId: 'e1', authorId: a, body: 'hi', createdAt: commentsAt, parentId: null, likeCount: 0, replyCount: 0, unfriendlyCount: 0 }));
    await put(t.store, 'main', encode('authorComment', K.authorComment(a, commentsAt, id), { id, episodeId: 'e1', sk: key.SK, parentId: null, createdAt: commentsAt }));
  }
  await put(t.store, 'main', encode('reaction', K.reaction(a, 'e1', 3), { listenerId: a, episodeId: 'e1', bucket: 3, offsetMs: 1000, createdAt: nowIso }));
  const clipId = randomUUID();
  await put(t.store, 'main', encode('authorClip', K.authorClip(a, nowIso, clipId), { id: clipId, episodeId: 'e1', sk: `CLIP#${clipId}`, createdAt: nowIso, deletedAt: null }));
  await put(t.store, 'main', encode('follow', K.follow(a, b), { otherId: b, createdAt: nowIso }));
  const postId = randomUUID();
  await put(t.store, 'main', encode('voicePostPtr', K.voicePostPtr(a, nowIso, postId), { id: postId, createdAt: nowIso, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }));
}
