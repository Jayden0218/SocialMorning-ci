// Lane NB helper h2: test reads and seeds of the rows the app wrote (DynamoDB items).
/**
 * M26 lane NB. Each helper reads the DynamoDB items (activity: lane SG's `ACT#` items in sm-events; comments, clips,
 * reactions: lane SC; episodes, listened ranges, subscriptions, rec events, positions: lane LB; reports: lane SF).
 * Names keep the old column vocabulary (snake_case rows) so the tests read the same.
 */
import assert from 'node:assert/strict';
import type { TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');
const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));

async function activityItems(t: TestDb): Promise<Row[]> {
  return (await (await fx()).acScan(t.store, 'events', 'activity')).sort((a, b) => Number(a['id']) - Number(b['id']));
}

/** How many activity rows (optionally of one kind). */
export async function activityCount(t: TestDb, kind?: string): Promise<number> {
  return (await activityItems(t)).filter((a) => kind === undefined || a['kind'] === kind).length;
}

/** `SELECT kind, day::text AS day FROM activity ORDER BY id`. */
export async function activityKindDays(t: TestDb): Promise<{ kind: string; day: string | null }[]> {
  return (await activityItems(t)).map((a) => ({ kind: String(a['kind']), day: str(a['day']) }));
}

/** `SELECT kind, moment_ms, ref_id::text AS ref FROM activity`. */
export async function activityMoments(t: TestDb): Promise<{ kind: string; moment_ms: number | null; ref: string | null }[]> {
  return (await activityItems(t)).map((a) => ({ kind: String(a['kind']), moment_ms: num(a['momentMs']), ref: str(a['refId']) }));
}

/**
 * G6: a second `listened` row for the same (listener, episode, day) is refused by the store — the conditional
 * `U#ACT#…` item (lane SG's writeAct).
 */
export async function assertListenedDayUnique(t: TestDb, actorId: string, episodeId: string, day: string): Promise<void> {
  const [K, { encode }, { tx }, { get }] = await Promise.all([
    import('../src/db/ddb/keys.ts'), import('../src/db/ddb/codec.ts'), import('../src/db/ddb/tx.ts'), import('../src/db/ddb/store.ts'),
  ]);
  const key = K.ev.activityDedupe(actorId, 'listened', episodeId, day);
  assert.ok(await get(t.store, 'events', key, { consistent: true }), 'the day item exists');
  await assert.rejects(tx(t.store).put('events', encode('unique', key, { owner: 'test', hidden: false }), { condition: 'attribute_not_exists(PK)' }).commit());
}

const TABLES = {
  clips: ['main', 'clip'], follows: ['main', 'follow'], listened_ranges: ['main', 'listenedRange'], activity: ['events', 'activity'],
  reactions: ['main', 'reaction'], positions: ['main', 'position'],
} as const;

/** `SELECT count(*)::int AS n FROM <table>` (the items of the table's type). */
export async function rowCount(t: TestDb, table: keyof typeof TABLES): Promise<number> {
  return (await fx()).acCount(t.store, TABLES[table][0], TABLES[table][1]);
}

/** A recommendation event now (replaces `INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind) …`). */
export async function seedRecEventNow(t: TestDb, e: { listenerId: string; episodeId: string; channel: string; rank: number; kind: string }): Promise<void> {
  await (await fx()).recEventItem(t.store, { ...e, at: new Date().toISOString() });
}

/** `SELECT 1 FROM rec_events WHERE listener_id = $1` — how many. */
export async function recEventCountOf(t: TestDb, listenerId: string): Promise<number> {
  return (await (await fx()).acScan(t.store, 'events', 'recEvent')).filter((r) => r['listenerId'] === listenerId).length;
}

/** `SELECT 1 FROM subscriptions WHERE listener_id = $1` — how many (deleted ones included). */
export async function subscriptionCountOf(t: TestDb, listenerId: string): Promise<number> {
  return (await (await fx()).acScan(t.store, 'main', 'subscription')).filter((s) => s['listenerId'] === listenerId).length;
}

const COMMENT_FULL = { body: 'body', transcript: 'transcript', country: 'country', voice_url: 'voiceUrl', voice_path: 'voicePath', voice_ms: 'voiceMs', image_url: 'imageUrl', image_path: 'imagePath', image_w: 'imageW', image_h: 'imageH', image_bytes: 'imageBytes' } as const;

async function commentItems(t: TestDb): Promise<Row[]> {
  return (await fx()).acScan(t.store, 'main', 'comment');
}

/** `SELECT id, author_id, deleted_at, <full> FROM comments WHERE id = ANY($1)` (`full` = the comment's content columns). */
export async function commentFullRows(t: TestDb, ids: string[], full: string): Promise<Row[]> {
  return (await commentItems(t)).filter((c) => ids.includes(String(c['id']))).map((c) => {
    const row: Row = { id: String(c['id']), author_id: str(c['authorId']), deleted_at: str(c['deletedAt']) };
    for (const col of full.split(', ') as (keyof typeof COMMENT_FULL)[]) row[col] = c[COMMENT_FULL[col]] ?? null;
    return row;
  });
}

/** `SELECT 1 FROM comments WHERE id = $1` — how many. */
export async function commentIdCount(t: TestDb, id: string): Promise<number> {
  return (await commentItems(t)).filter((c) => c['id'] === id).length;
}

/** `SELECT 1 FROM comments WHERE body = $1` — how many. */
export async function commentBodyCount(t: TestDb, body: string): Promise<number> {
  return (await commentItems(t)).filter((c) => c['body'] === body).length;
}

/** The snapshot of the (first) report on a target — `SELECT snapshot FROM reports WHERE target_id = $1`. */
export async function reportSnapshotOf(t: TestDb, targetId: string): Promise<{ snapshot: unknown } | undefined> {
  const r = (await (await fx()).acScan(t.store, 'main', 'report')).find((i) => i['targetId'] === targetId);
  return r ? { snapshot: r['snapshot'] } : undefined;
}

/** `SELECT title, image_url, published_at, duration_ms FROM episodes WHERE id = $1` (lane LB's episode item). */
export async function episodeFields(t: TestDb, id: string): Promise<{ title: string; image_url: string | null; published_at: Date | string | null; duration_ms: number | null } | undefined> {
  const { getEpisode } = await import('../src/db/repos/library/ddb/episodes.ts');
  const e = await getEpisode(t.store, t.db, id);
  return e ? { title: e.title, image_url: e.image_url, published_at: e.published_at, duration_ms: e.duration_ms } : undefined;
}
