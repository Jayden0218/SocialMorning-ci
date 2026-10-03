/**
 * M18 — the admin dashboard's numbers (specs/019-m18-admin-dashboard, data-model.md guards).
 *
 * G-M1 every number equals the seeded fixture. Break: drop `WHERE ${col} >= $1` from `perDay`.
 * G-M2 nothing names a listener.               Break: add `ids: [...]` to the users section.
 * G-M3 N visits in a day count once; a Studio session counts 0.
 *                                              Break: remove the `studio-web` filter in listenerForToken.
 * G-M4 one failing section leaves the others.  Break: rethrow in `section()`.
 * G-M5 a non-admin is refused.                 Break: register `/metrics` above `admin.use('*', adminOnly)`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup } from './admin-harness.ts';
import { signUp, type TestDb } from './harness.ts';
import { rangeDays, type Metrics } from '../src/db/repos/metrics.ts';

const JOB = 'job-token-metrics';
/** The UTC+8 calendar day `n` days ago, and noon on it. */
const dayAgo = (n: number) => rangeDays(n + 1, Date.now())[0]!;
const noonAgo = (n: number) => `${dayAgo(n)}T12:00:00+08:00`;
const F1 = 'https://feeds.example.com/one.xml';
const F2 = 'https://feeds.example.com/two.xml';

async function metrics(t: TestDb, who: Parameters<typeof aCall>[3], days = 7): Promise<Metrics> {
  const res = await aCall(t, 'GET', `/v1/admin/metrics?days=${days}`, who);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as Metrics;
}
const point = (s: { date: string; value: number }[], n: number) => s.find((p) => p.date === dayAgo(n))?.value;

async function seed(t: TestDb) {
  const u1 = await signUp(t, 'u1@example.com', 'Uma');
  const u2 = await signUp(t, 'u2@example.com', 'Vic');
  const q = (sql: string, p: unknown[] = []) => t.q(sql, p);
  // Users: u2 joined 3 days ago, is suspended, and was last seen 10 days ago.
  await q('UPDATE listeners SET created_at = $2, suspended_at = now() WHERE id = $1', [u2.id, noonAgo(3)]);
  await q("UPDATE sessions SET last_seen_at = now() - interval '10 days' WHERE listener_id = $1", [u2.id]);
  // App use: u1 today three times (one day), and two days ago by hand.
  for (let i = 0; i < 3; i++) assert.equal((await t.call('GET', '/v1/me', undefined, u1.token)).status, 200);
  await q('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $2)', [dayAgo(2), u1.id]);
  // Episodes.
  for (const [id, feed, show] of [['e1', F1, 'Show One'], ['e2', F2, 'Show Two']]) {
    await q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ($1, $2, $1, $3, $4, 'https://cdn.example.com/a.mp3')", [id, feed, `Episode ${id}`, show]);
  }
  // Listening: u1 today on two devices overlapping (union 45 min); u2 yesterday 1 h.
  await q("INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, 'e1', $2::date, 'd1', '[[0,1800000]]'::jsonb), ($1, 'e1', $2::date, 'd2', '[[900000,2700000]]'::jsonb)", [u1.id, dayAgo(0)]);
  await q("INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, 'e2', $2::date, 'd1', '[[0,3600000]]'::jsonb)", [u2.id, dayAgo(1)]);
  await q("INSERT INTO positions (listener_id, episode_id, offset_ms, finished, progress_seq, device_id) VALUES ($1, 'e2', 3600000, true, 1, 'd1')", [u2.id]);
  // Library: 2 subscribed today, 1 unsubscribed yesterday; F1 has 2 live subscribers, F2 none (deleted).
  await q("INSERT INTO subscription_events (listener_id, feed_url, kind, at) VALUES ($1, $3, 'sub', $4), ($2, $3, 'sub', $4), ($1, $5, 'unsub', $6)", [u1.id, u2.id, F1, noonAgo(0), F2, noonAgo(1)]);
  await q('INSERT INTO subscriptions (listener_id, feed_url) VALUES ($1, $3), ($2, $3)', [u1.id, u2.id, F1]);
  await q('INSERT INTO subscriptions (listener_id, feed_url, deleted_at) VALUES ($1, $2, now())', [u1.id, F2]);
  // Social: 4 comments two days ago, none yesterday; 1 reaction, clip, follow, share today; 1 live voice post.
  for (let i = 0; i < 4; i++) await q("INSERT INTO comments (episode_id, author_id, body, created_at) VALUES ('e1', $1, 'hi', $2)", [u1.id, noonAgo(2)]);
  await q("INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms) VALUES ($1, 'e1', 3, 1000)", [u1.id]);
  await q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms) VALUES ($1, 'c1', 'e1', 0, 5000)", [u1.id]);
  await q('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)', [u1.id, u2.id]);
  await q("INSERT INTO share_events (listener_id, target_kind, target_id, feed_url) VALUES ($1, 'episode', 'e1', $2)", [u1.id, F1]);
  await q("INSERT INTO voice_posts (listener_id, blob_url, blob_path, duration_ms, bytes) VALUES ($1, 'https://b.example.com/v', 'v', 3000, 1000)", [u1.id]);
  // Recommendations: pick 4 shown / 1 played; chart 2 shown / 0 played.
  for (let i = 0; i < 4; i++) await q("INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind) VALUES ($1, 'e1', 'pick', $2, 'impression')", [u1.id, i]);
  await q("INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind) VALUES ($1, 'e1', 'pick', 0, 'play')", [u1.id]);
  for (let i = 0; i < 2; i++) await q("INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind) VALUES ($1, 'e2', 'chart', $2, 'impression')", [u1.id, i]);
  // Safety: 2 reports (1 closed), 1 action, 1 block.
  await q("INSERT INTO reports (target_kind, target_id, reporter_id, reason, snapshot) VALUES ('profile', $1, $2, 'spam', '{}'::jsonb)", [u2.id, u1.id]);
  await q("INSERT INTO reports (target_kind, target_id, reporter_id, reason, snapshot, closed_at) VALUES ('profile', $1, $2, 'other', '{}'::jsonb, now())", [u1.id, u2.id]);
  await q("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'suspend', 'profile', $2)", [u1.id, u2.id]);
  await q('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [u1.id, u2.id]);
  // Money: 1 active purchase RM 4.90, one tip on it.
  const [p] = await t.q<{ id: string }>("INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, amount_micros, currency) VALUES ($1, 'apple', 'tip.small', 'txn-1', 'active', 4900000, 'MYR') RETURNING id", [u1.id]);
  await q('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [u1.id, F1, p!.id]);
  // Creators: 1 proven claim, 1 hosted show with 2 published episodes + 1 draft, 1 team member.
  await q("INSERT INTO creator_claims (listener_id, feed_url, code, status) VALUES ($1, $2, 'code-1', 'proven')", [u1.id, F1]);
  const [s] = await t.q<{ id: string }>("INSERT INTO hosted_shows (owner_id, feed_url, title) VALUES ($1, 'https://h.example.com/feed.xml', 'Hosted') RETURNING id", [u1.id]);
  for (const [g, status] of [['h1', 'published'], ['h2', 'published'], ['h3', 'draft']]) {
    await q("INSERT INTO hosted_episodes (show_id, guid, episode_id, title, audio_url, audio_bytes, audio_type, status) VALUES ($1, $2, $2, 'T', 'https://h.example.com/a.mp3', 10, 'audio/mpeg', $3)", [s!.id, g, status]);
  }
  await q('INSERT INTO show_members (feed_url, listener_id) VALUES ($1, $2)', [F1, u2.id]);
  return { u1, u2 };
}

test('G-M1: every number on the dashboard equals the seeded fixture', async () => {
  const { t, owner } = await adminSetup();
  await seed(t);
  const m = await metrics(t, owner);
  assert.equal(m.days, 7);
  assert.equal(m.partial, false);
  assert.deepEqual([m.from, m.to], [dayAgo(6), dayAgo(0)]);
  const { users, listening, library, social, recs, safety, money, creators } = m.sections;
  assert.ok(users.ok && listening.ok && library.ok && social.ok && recs.ok && safety.ok && money.ok && creators.ok);

  // owner + other (adminSetup) + u1 + u2; every sign-up session is fresh except u2's (10 days).
  assert.equal(users.total, 4);
  assert.equal(users.suspended, 1);
  assert.deepEqual(users.active, { d1: 3, d7: 3, d30: 4 });
  assert.equal(users.newPerDay.length, 7);
  assert.deepEqual([point(users.newPerDay, 0), point(users.newPerDay, 3), point(users.newPerDay, 1)], [3, 1, 0]);
  assert.deepEqual([point(users.dauPerDay, 0), point(users.dauPerDay, 2), point(users.dauPerDay, 1)], [1, 1, 0]);
  assert.equal(users.recordedSince, dayAgo(2));

  assert.deepEqual([point(listening.listenersPerDay, 0), point(listening.listenersPerDay, 1), point(listening.listenersPerDay, 2)], [1, 1, 0]);
  assert.deepEqual([point(listening.hoursPerDay, 0), point(listening.hoursPerDay, 1)], [0.75, 1]);
  assert.equal(listening.finished, 1);
  assert.deepEqual(listening.topShows, [{ feedUrl: F2, title: 'Show Two', hours: 1 }, { feedUrl: F1, title: 'Show One', hours: 0.75 }]);
  assert.deepEqual(listening.topEpisodes.map((e) => [e.episodeId, e.hours]), [['e2', 1], ['e1', 0.75]]);

  assert.deepEqual([point(library.addedPerDay, 0), point(library.removedPerDay, 1), point(library.removedPerDay, 0)], [2, 1, 0]);
  assert.deepEqual(library.topShows, [{ feedUrl: F1, title: 'Show One', subscribers: 2 }]);

  assert.deepEqual([point(social.commentsPerDay, 2), point(social.commentsPerDay, 1), point(social.commentsPerDay, 0)], [4, 0, 0]);
  assert.deepEqual([point(social.reactionsPerDay, 0), point(social.clipsPerDay, 0), point(social.followsPerDay, 0), point(social.sharesPerDay, 0)], [1, 1, 1, 1]);
  assert.equal(social.voicePostsLive, 1);

  assert.deepEqual(recs.byChannel, [{ channel: 'chart', shown: 2, played: 0 }, { channel: 'pick', shown: 4, played: 1 }]);
  assert.deepEqual({ ...safety, ok: undefined }, { ok: undefined, openReports: 1, reports: 2, actions: 1, blocks: 1 });
  assert.deepEqual({ ...money, ok: undefined }, { ok: undefined, activePurchases: 1, purchases: 1, tips: 1, amounts: [{ currency: 'MYR', micros: 4900000 }] });
  assert.deepEqual({ ...creators, ok: undefined }, { ok: undefined, claimedShows: 1, hostedShows: 1, hostedEpisodes: 2, teamMembers: 1 });

  // 90 days: every series has 90 points; an empty database day is 0, not missing (FR-018).
  const wide = await metrics(t, owner, 90);
  assert.ok(wide.sections.social.ok);
  assert.equal(wide.sections.social.commentsPerDay.length, 90);
  assert.equal(wide.sections.social.commentsPerDay[0]!.value, 0);
  await t.close();
});

test('G-M2: the response names no listener — no id, email or display name', async () => {
  const { t, owner, other } = await adminSetup();
  const { u1, u2 } = await seed(t);
  const body = JSON.stringify(await metrics(t, owner, 30));
  for (const s of [owner.id, other.id, u1.id, u2.id, 'u1@example.com', 'u2@example.com', 'Uma', 'Vic', 'owner@example.com', 'Owner']) {
    assert.equal(body.includes(s), false, `the dashboard must not contain ${s}`);
  }
  await t.close();
});

test('G-M3: a person counts once per day however often they come; a Studio session never counts', async () => {
  const { t, owner } = await adminSetup();
  const u = await signUp(t, 'x@example.com', 'Xia');
  for (let i = 0; i < 5; i++) await t.call('GET', '/v1/me', undefined, u.token);
  // The owner used only the Studio (studio-web sessions) — never the app.
  await aCall(t, 'GET', '/v1/admin/audit', owner);
  const rows = await t.q<{ listener_id: string; day: string }>('SELECT listener_id, day::text AS day FROM daily_active');
  assert.deepEqual(rows, [{ listener_id: u.id, day: dayAgo(0) }]);
  // Deleting the account deletes its days (FR-015).
  await t.q('DELETE FROM listeners WHERE id = $1', [u.id]);
  assert.equal((await t.q('SELECT 1 FROM daily_active')).length, 0);
  await t.close();
});

test('FR-015: a day of app use is deleted after 400 days by the hourly rebuild', async () => {
  const { t } = await adminSetup({ jobToken: JOB });
  const u = await signUp(t, 'old@example.com', 'Old');
  await t.q('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $3), ($2::date, $3)', [dayAgo(401), dayAgo(399), u.id]);
  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` });
  assert.equal(((await res.json()) as { counts: { activeDeleted: number } }).counts.activeDeleted, 1);
  assert.deepEqual((await t.q<{ day: string }>('SELECT day::text AS day FROM daily_active')).map((r) => r.day), [dayAgo(399)]);
  await t.close();
});

test('G-M4: one section failing leaves the other seven; a partial result is not kept', async () => {
  const { t, owner } = await adminSetup();
  await t.q('DROP TABLE tips');
  const m = await metrics(t, owner);
  assert.equal(m.partial, true);
  assert.equal(m.sections.money.ok, false);
  for (const k of ['users', 'listening', 'library', 'social', 'recs', 'safety', 'creators'] as const) assert.equal(m.sections[k].ok, true, k);
  assert.equal((await t.q("SELECT 1 FROM cache WHERE key = 'admin-metrics:7'")).length, 0, 'a partial result is dropped so Retry recounts');
  await t.close();
});

test('the numbers are kept 5 minutes: a second open shows the same count and the same time', async () => {
  const { t, owner } = await adminSetup();
  const a = await metrics(t, owner);
  await signUp(t, 'late@example.com', 'Late');
  const b = await metrics(t, owner);
  assert.equal(b.countedAt, a.countedAt);
  assert.ok(a.sections.users.ok && b.sections.users.ok);
  assert.equal(b.sections.users.total, a.sections.users.total);
  await t.close();
});

test('G-M5: an ordinary account, and no session at all, are refused; a bad range is a 400', async () => {
  const { t, owner, other } = await adminSetup();
  assert.equal((await aCall(t, 'GET', '/v1/admin/metrics', other)).status, 403);
  assert.ok([401, 403].includes((await aCall(t, 'GET', '/v1/admin/metrics')).status));
  assert.equal((await aCall(t, 'GET', '/v1/admin/metrics?days=14', owner)).status, 400);
  await t.close();
});
