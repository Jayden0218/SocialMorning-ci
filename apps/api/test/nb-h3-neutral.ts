// Lane NB (helper h3) test helpers: seeds and reads of push, hidden-episode and comment items on DynamoDB.
/**
 * Each helper writes or reads the owning lane's DynamoDB items.
 */
import type { TestDb } from './harness.ts';

const DAY = 86_400_000;

/**
 * A "never twice" push record sent `daysAgo` days back: lane AC's `PUSHSENT#` item in sm-events with the app's 31-day TTL
 * (account/ddb/push.ts `pushSentItem`).
 */
export async function seedPushSent(t: TestDb, listenerId: string, episodeId: string, kind: string, daysAgo: number): Promise<void> {
  const [K, { encode, ttlAfter }, { put }] = await Promise.all([import('../src/db/ddb/keys.ts'), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/store.ts')]);
  const at = Date.now() - daysAgo * DAY;
  await put(t.store, 'events', encode('pushSent', K.ev.pushSent(listenerId, episodeId, kind), { listenerId, episodeId, kind, sentAt: new Date(at).toISOString() }, { ttl: ttlAfter(at, 31 * DAY) }));
}

/**
 * The episode ids of the stored push records, sorted; with `unexpired`, only those whose TTL has not passed
 * (DynamoDB deletes the others itself, and DynamoDB Local runs no TTL).
 */
export async function pushSentEpisodeIds(t: TestDb, o: { unexpired?: boolean } = {}): Promise<string[]> {
  const { acScan } = await import('./fixtures.ts');
  const now = Date.now() / 1000;
  return (await acScan(t.store, 'events', 'pushSent'))
    .filter((i) => !o.unexpired || typeof i['ttl'] !== 'number' || i['ttl'] > now)
    .map((i) => String(i['episodeId'])).sort();
}

/** What the sweep step reports for push records: nothing is deleted by it (the items expire by TTL — lane LE, `push-sweep.ts`). The count argument is ignored. */
export const sweptPushSent = (_t: TestDb, _count: number): number => 0;

/** An episode hidden by guid: its reason and who hid it — lane ST's `HIDDENEP#` item (studio/ddb/page.ts). */
export async function hiddenEpisodeRow(t: TestDb, feedUrl: string, guid: string): Promise<{ reason: string; hidden_by: string } | undefined> {
  const [K, { get }] = await Promise.all([import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts')]);
  const h = await get(t.store, 'main', K.hiddenEp(feedUrl, guid), { consistent: true });
  return h ? { reason: String(h['reason']), hidden_by: String(h['hiddenBy']) } : undefined;
}

/** 1 when the comment exists and is (`removed`) / is not removed by moderation, else 0 — lane SC's `getComment` on the item. */
export async function commentRemovedCount(t: TestDb, id: string, removed: boolean): Promise<number> {
  const { getComment } = await import('../src/db/repos/social/comments.ts');
  const c = await getComment(t.db, id);
  return c && Boolean(c.removed_at) === removed ? 1 : 0;
}
