/**
 * M11 — SC-002: every number on Home equals a hand count of a seeded show, and nothing from
 * another show leaks in. The seed is small enough to count on paper; each expected value
 * below says where it comes from.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, type TestDb } from './harness.ts';
import { addEpisode, day, noon, proveClaim, sCall, studioLogin, type StudioUser } from './studio-harness.ts';

const F = 'https://feeds.example.com/f.xml';
const G = 'https://feeds.example.com/g.xml';

async function seed(t: TestDb) {
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const [l1, l2, l3] = await Promise.all(['l1', 'l2', 'l3'].map((n) => studioLogin(t, `${n}@example.com`, n.toUpperCase())));
  const key = await proveClaim(t, owner.id, F, noon(10));
  await addEpisode(t, F, 'E1', 'Episode one', 1_000_000, noon(9));
  await addEpisode(t, F, 'E2', 'Episode two', 2_000_000, noon(5));
  await addEpisode(t, F, 'E3', 'Episode three', null, noon(1));
  await addEpisode(t, G, 'G1', 'Not mine', 1_000_000, noon(1));
  const L = { l1: l1!.id, l2: l2!.id, l3: l3!.id };

  // Plays: 5 on F (l1 E1 ×2 days, l2 E1, l3 E2, l1 E3 hidden) + 1 on G.
  const listened = (who: string, ep: string, d: number, hidden = false) =>
    t.q("INSERT INTO activity (actor_id, kind, episode_id, day, hidden, created_at) VALUES ($1, 'listened', $2, $3, $4, $5)", [who, ep, day(d), hidden, noon(d)]);
  await listened(L.l1, 'E1', 0); await listened(L.l1, 'E1', 1); await listened(L.l2, 'E1', 1);
  await listened(L.l3, 'E2', 2); await listened(L.l1, 'E3', 0, true); await listened(L.l1, 'G1', 0);

  // Completion: l1/E1 two days → 950 000 of 1 000 000 = complete; l2/E1 100 000 = not;
  // l3/E2 finished = complete; l1/E3 no length = unknown. → 2 / 3.
  const ranges = (who: string, ep: string, d: number, r: [number, number][]) =>
    t.q("INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, $2, $3, 'phone', $4)", [who, ep, day(d), JSON.stringify(r)]);
  await ranges(L.l1, 'E1', 1, [[0, 500_000]]); await ranges(L.l1, 'E1', 0, [[500_000, 950_000]]);
  await ranges(L.l2, 'E1', 1, [[0, 100_000]]);
  await t.q("INSERT INTO positions (listener_id, episode_id, offset_ms, finished, progress_seq, device_id) VALUES ($1, 'E2', 2000000, true, 1, 'phone')", [L.l3]);

  // Subscribers: l1, l2 live; l3 unsubscribed → 2. Events: subs on days 0, 1, 3.
  await t.q('INSERT INTO subscriptions (listener_id, feed_url, created_at) VALUES ($1, $3, $4), ($2, $3, $5)', [L.l1, L.l2, F, noon(0), noon(1)]);
  await t.q('INSERT INTO subscriptions (listener_id, feed_url, created_at, deleted_at) VALUES ($1, $2, $3, $4)', [L.l3, F, noon(3), noon(2)]);
  await t.q("INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $4, 'sub', $5), ($2, $4, 'sub', $6), ($3, $4, 'sub', $7), ($3, $4, 'unsub', $8)",
    [L.l1, L.l2, L.l3, F, noon(0), noon(1), noon(3), noon(2)]);

  // Comments: 2 visible (days 0 and 1); removed, host-hidden and deleted ones do not count; G's never.
  const comment = (who: string, ep: string, d: number, extra = '') =>
    t.q(`INSERT INTO comments (episode_id, author_id, body, offset_ms, created_at${extra ? ', ' + extra : ''}) VALUES ($1, $2, 'hi', 60000, $3${extra ? ', now()' : ''})`, [ep, who, noon(d)]);
  await comment(L.l1, 'E1', 0); await comment(L.l2, 'E2', 1);
  await comment(L.l1, 'E1', 0, 'removed_at'); await comment(L.l1, 'E1', 0, 'host_hidden_at'); await comment(L.l1, 'E1', 0, 'deleted_at');
  await comment(L.l1, 'G1', 0);

  // Likes: l1 E1 (3 buckets = 1 like), l2 E1, l2 E2 → 3.
  const react = (who: string, ep: string, b: number, d: number) =>
    t.q('INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms, created_at) VALUES ($1, $2, $3, 0, $4)', [who, ep, b, noon(d)]);
  await react(L.l1, 'E1', 3, 0); await react(L.l1, 'E1', 4, 0); await react(L.l1, 'E1', 5, 0);
  await react(L.l2, 'E1', 3, 1); await react(L.l2, 'E2', 3, 1); await react(L.l2, 'G1', 3, 1);

  // Clips: 1 live (a deleted one does not count).
  await t.q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms) VALUES ($1, 'c1', 'E1', 0, 30000)", [L.l1]);
  await t.q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms, deleted_at) VALUES ($1, 'c2', 'E1', 0, 30000, now())", [L.l1]);

  // Saves: l1 E1 live; l2 E1 removed → 1.
  await t.q("INSERT INTO library_items (listener_id, kind, item_key, updated_at) VALUES ($1, 'fav_episode', 'E1', $2)", [L.l1, noon(0)]);
  await t.q("INSERT INTO library_items (listener_id, kind, item_key, updated_at, deleted_at) VALUES ($1, 'fav_episode', 'E1', $2, now())", [L.l2, noon(0)]);

  // Shares: 2 on F (days 0, 2), 1 on G.
  await t.q("INSERT INTO share_events (listener_id, target_kind, target_id, feed_url, at) VALUES ($1, 'episode', 'E1', $2, $3), (NULL, 'show', $2, $2, $4), ($1, 'episode', 'G1', $5, $3)",
    [L.l1, F, noon(0), noon(2), G]);
  return { owner, key };
}

async function get<T>(t: TestDb, who: StudioUser, path: string): Promise<T> {
  const r = await sCall(t, 'GET', path, who);
  assert.equal(r.status, 200, `${path}: ${r.status}`);
  return (await r.json()) as T;
}

test('SC-002: overview totals equal the hand count; the other show never leaks', async () => {
  const t = await freshDb();
  const { owner, key } = await seed(t);
  const o = await get<{ totals: Record<string, number | null>; claimedAt: string; recentComments: { body: string }[]; recentEpisodes: { id: string; plays: number; comments: number }[] }>(t, owner, `/v1/studio/shows/${key}/overview`);
  assert.deepEqual(o.totals, { plays: 5, completionRate: 2 / 3, subscribers: 2, comments: 2, likes: 3, clips: 1, saves: 1, shares: 2 });
  assert.equal(o.claimedAt.slice(0, 10), day(10));
  assert.equal(o.recentComments.length, 2);
  assert.deepEqual(o.recentEpisodes.map((e) => [e.id, e.plays, e.comments]), [['E3', 1, 0], ['E2', 1, 1], ['E1', 3, 1]]);
  await t.close();
});

test('SC-002: a 7-day trend has 7 points, 0-filled, each equal to that day\'s count', async () => {
  const t = await freshDb();
  const { owner, key } = await seed(t);
  const series = async (metric: string) =>
    (await get<{ days: { date: string; value: number }[] }>(t, owner, `/v1/studio/shows/${key}/trend?metric=${metric}&days=7&tz=UTC`)).days;
  const byDay = (s: { date: string; value: number }[]) => Object.fromEntries(s.filter((d) => d.value).map((d) => [d.date, d.value]));

  const plays = await series('plays');
  assert.equal(plays.length, 7);
  assert.equal(plays[6]!.date, day(0));
  assert.deepEqual(byDay(plays), { [day(0)]: 2, [day(1)]: 2, [day(2)]: 1 });
  assert.deepEqual(byDay(await series('subs')), { [day(0)]: 1, [day(1)]: 1, [day(3)]: 1 });
  assert.deepEqual(byDay(await series('comments')), { [day(0)]: 1, [day(1)]: 1 });
  // One like per listener per episode, dated by their first reaction: l1/E1 on day 0; l2/E1, l2/E2 on day 1.
  assert.deepEqual(byDay(await series('likes')), { [day(0)]: 1, [day(1)]: 2 });
  assert.deepEqual(byDay(await series('saves')), { [day(0)]: 1 });
  assert.deepEqual(byDay(await series('shares')), { [day(0)]: 1, [day(2)]: 1 });
  assert.equal((await series('plays')).length, 7);
  assert.equal((await get<{ days: unknown[] }>(t, owner, `/v1/studio/shows/${key}/trend?metric=plays&days=90`)).days.length, 90);
  await t.close();
});

test('a show with nothing yet answers zeros and a flat line, never an error', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, F);
  const o = await get<{ totals: Record<string, number | null> }>(t, owner, `/v1/studio/shows/${key}/overview`);
  assert.deepEqual(o.totals, { plays: 0, completionRate: null, subscribers: 0, comments: 0, likes: 0, clips: 0, saves: 0, shares: 0 });
  const tr = await get<{ days: { value: number }[] }>(t, owner, `/v1/studio/shows/${key}/trend?metric=comments&days=30&tz=Asia/Kuala_Lumpur`);
  assert.equal(tr.days.length, 30);
  assert.ok(tr.days.every((d) => d.value === 0));
  // A made-up zone falls back to UTC instead of reaching SQL.
  assert.equal((await get<{ tz: string }>(t, owner, `/v1/studio/shows/${key}/trend?tz=Not/AZone`)).tz, 'UTC');
  await t.close();
});
