// Lane NB (helper h3) test helpers: seeds and reads that must work with the write bridge off (TEST_BACKEND=ddb, BRIDGE=off).
/**
 * M26 lane NB. On Postgres (the gate, postgres-api) and on DynamoDB with the bridge on, each helper is the SQL the test
 * used to hold (the bridge keeps the Postgres rows). With BRIDGE=off the app writes no Postgres row and the listener is
 * only an item, so the helper writes/reads the owning lane's DynamoDB items instead. DynamoDB modules load only there.
 */
import { BRIDGE_OFF, type TestDb } from './harness.ts';

const DAY = 86_400_000;
const itemsOnly = (t: TestDb) => Boolean(t.store) && BRIDGE_OFF;

/**
 * A "never twice" push record sent `daysAgo` days back (replaces `INSERT INTO push_sent … now() - interval 'n days'`).
 * Bridge off: lane AC's `PUSHSENT#` item in sm-events with the app's 31-day TTL (account/ddb/push.ts `pushSentItem`).
 */
export async function seedPushSent(t: TestDb, listenerId: string, episodeId: string, kind: string, daysAgo: number): Promise<void> {
  if (!itemsOnly(t)) {
    await t.q(`INSERT INTO push_sent (listener_id, episode_id, kind, sent_at) VALUES ($1, $2, $3, now() - make_interval(days => $4::int))`, [listenerId, episodeId, kind, daysAgo]);
    return;
  }
  const [K, { encode, ttlAfter }, { put }] = await Promise.all([import('../src/db/ddb/keys.ts'), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/store.ts')]);
  const at = Date.now() - daysAgo * DAY;
  await put(t.store!, 'events', encode('pushSent', K.ev.pushSent(listenerId, episodeId, kind), { listenerId, episodeId, kind, sentAt: new Date(at).toISOString() }, { ttl: ttlAfter(at, 31 * DAY) }));
}

/**
 * The episode ids of the stored push records, sorted (replaces `SELECT episode_id FROM push_sent`). Bridge off: the
 * items; with `unexpired`, only those whose TTL has not passed — DynamoDB deletes the others itself (the sweep's job on
 * Postgres), and DynamoDB Local runs no TTL.
 */
export async function pushSentEpisodeIds(t: TestDb, o: { unexpired?: boolean } = {}): Promise<string[]> {
  if (!itemsOnly(t)) return (await t.q<{ episode_id: string }>('SELECT episode_id FROM push_sent ORDER BY episode_id')).map((r) => r.episode_id);
  const { acScan } = await import('./fixtures.ts');
  const now = Date.now() / 1000;
  return (await acScan(t.store!, 'events', 'pushSent'))
    .filter((i) => !o.unexpired || typeof i['ttl'] !== 'number' || i['ttl'] > now)
    .map((i) => String(i['episodeId'])).sort();
}

/** What the sweep step reports for push records: with the bridge off nothing is deleted by it (the items expire by TTL — lane LE, `push-sweep.ts`). */
export const sweptPushSent = (t: TestDb, postgresCount: number): number => (itemsOnly(t) ? 0 : postgresCount);

/**
 * An episode hidden by guid: its reason and who hid it (replaces `SELECT reason, hidden_by::text AS hidden_by FROM
 * hidden_episodes WHERE feed_url = $1 AND guid = $2`). Bridge off: lane ST's `HIDDENEP#` item (studio/ddb/page.ts).
 */
export async function hiddenEpisodeRow(t: TestDb, feedUrl: string, guid: string): Promise<{ reason: string; hidden_by: string } | undefined> {
  if (!itemsOnly(t)) return (await t.q<{ reason: string; hidden_by: string }>('SELECT reason, hidden_by::text AS hidden_by FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [feedUrl, guid]))[0];
  const [K, { get }] = await Promise.all([import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts')]);
  const h = await get(t.store!, 'main', K.hiddenEp(feedUrl, guid), { consistent: true });
  return h ? { reason: String(h['reason']), hidden_by: String(h['hiddenBy']) } : undefined;
}

/**
 * 1 when the comment exists and is (`removed`) / is not removed by moderation, else 0 (replaces
 * `SELECT 1 FROM comments WHERE id = $1 AND removed_at IS [NOT] NULL`). Bridge off: lane SC's `getComment` on the item.
 */
export async function commentRemovedCount(t: TestDb, id: string, removed: boolean): Promise<number> {
  if (!itemsOnly(t)) return (await t.q(`SELECT 1 FROM comments WHERE id = $1 AND removed_at IS ${removed ? 'NOT ' : ''}NULL`, [id])).length;
  const { getComment } = await import('../src/db/repos/social/comments.ts');
  const c = await getComment(t.db, id);
  return c && Boolean(c.removed_at) === removed ? 1 : 0;
}
