// Tests that dashboard numbers match seeded data and never name a listener.
/**
 * M18 — the admin dashboard's numbers (specs/019-m18-admin-dashboard, data-model.md guards).
 *
 * G-AD1 every number equals the seeded fixture. Break: in `listening`, sum each device's ranges instead of
 *                                              their union (two phones overlapping count twice).
 * G-AD2 nothing names a listener.               Break: add `ids: [...]` to the users section.
 * G-AD3 N visits in a day count once; a Studio session counts 0.
 *                                              Break: remove the `studio-web` filter in listenerForToken.
 * G-AD4 one failing section leaves the others.  Break: rethrow in `section()`.
 * G-AD5 a non-admin is refused.                 Break: register `/metrics` above `admin.use('*', adminOnly)`.
 *
 * M26 lane SF: the same tests on both backends. The seed goes through the app's own (dual) repo functions where
 * they exist, and through test/sf-neutral-metrics.ts where a time must be set by hand; rows of lanes still on
 * Postgres (comments, reactions, clips, follows, shares, voice posts, money, creators) stay SQL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { aCall, adminSetup } from './admin-harness.ts';
import { signUp, TEST_BACKEND, type TestDb } from './harness.ts';
import { seedPurchase, seedTip } from './pd-neutral.ts';
import { rangeDays, type Metrics } from '../src/db/repos/admin/metrics.ts';
import { upsertEpisode } from '../src/db/repos/library/episodes.ts';
import { replaceRanges } from '../src/db/repos/library/listened.ts';
import { observePosition } from '../src/db/repos/library/positions.ts';
import { merge } from '../src/db/repos/library/subscriptions.ts';
import { recordEvents } from '../src/db/repos/library/rec-events.ts';
import { closeReportsFor, createReport } from '../src/db/repos/safety/reports.ts';
import { act } from '../src/db/repos/safety/moderation.ts';
import { block } from '../src/db/repos/safety/blocks.ts';
import { addDailyActive, cacheKeyExists, dailyActiveRows, deleteListener, joinedAndSuspended, lastSeenAgo, subscriptionEventAt } from './sf-neutral-metrics.ts';

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
  await joinedAndSuspended(t, u2.id, noonAgo(3));
  await lastSeenAgo(t, u2.id, 10 * 86_400_000);
  // App use: u1 today three times (one day), and two days ago by hand.
  for (let i = 0; i < 3; i++) assert.equal((await t.call('GET', '/v1/me', undefined, u1.token)).status, 200);
  await addDailyActive(t, dayAgo(2), u1.id);
  // Episodes.
  for (const [id, feed, show] of [['e1', F1, 'Show One'], ['e2', F2, 'Show Two']] as const) {
    await upsertEpisode(t.db, { id, feedUrl: feed, guid: id, title: `Episode ${id}`, showTitle: show, enclosureUrl: 'https://cdn.example.com/a.mp3' });
  }
  // Listening: u1 today on two devices overlapping (union 45 min); u2 yesterday 1 h.
  await replaceRanges(t.db, u1.id, 'd1', [{ episodeId: 'e1', day: dayAgo(0), ranges: [[0, 1_800_000]] }]);
  await replaceRanges(t.db, u1.id, 'd2', [{ episodeId: 'e1', day: dayAgo(0), ranges: [[900_000, 2_700_000]] }]);
  await replaceRanges(t.db, u2.id, 'd1', [{ episodeId: 'e2', day: dayAgo(1), ranges: [[0, 3_600_000]] }]);
  await observePosition(t.db, u2.id, 'd1', { episodeId: 'e2', offsetMs: 3_600_000, finished: true, progressSeq: 1, explicitSeek: false }, new Date());
  // Library: 2 subscribed today, 1 unsubscribed yesterday; F1 has 2 live subscribers, F2 none (deleted).
  // The merge logs each new live subscription as a 'sub' event now; a row born deleted logs nothing.
  const now = new Date().toISOString();
  await merge(t.db, u1.id, [{ feedUrl: F1, createdAt: now }, { feedUrl: F2, createdAt: now, deletedAt: now }]);
  await merge(t.db, u2.id, [{ feedUrl: F1, createdAt: now }]);
  await subscriptionEventAt(t, u1.id, F2, 'unsub', noonAgo(1));
  // Safety: 2 reports (1 closed), 1 action, 1 block — through the app's functions, so the DynamoDB counters move.
  // (Before the follow below: a block removes follows both ways.)
  await createReport(t.db, { kind: 'profile', targetId: u2.id, reporterId: u1.id, reason: 'spam' });
  await createReport(t.db, { kind: 'profile', targetId: u1.id, reporterId: u2.id, reason: 'other' });
  await closeReportsFor(t.db, 'profile', u1.id, null, 'dismiss');
  await act(t.db, u1.id, { kind: 'clip', id: randomUUID() }, 'dismiss');
  assert.equal(await block(t.db, u1.id, u2.id), 'blocked');
  // Social: 4 comments two days ago, none yesterday; 1 reaction, clip, follow, share today; 1 live voice post.
  for (let i = 0; i < 4; i++) await q("INSERT INTO comments (episode_id, author_id, body, created_at) VALUES ('e1', $1, 'hi', $2)", [u1.id, noonAgo(2)]);
  await q("INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms) VALUES ($1, 'e1', 3, 1000)", [u1.id]);
  await q("INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms) VALUES ($1, 'c1', 'e1', 0, 5000)", [u1.id]);
  await q('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)', [u1.id, u2.id]);
  await q("INSERT INTO share_events (listener_id, target_kind, target_id, feed_url) VALUES ($1, 'episode', 'e1', $2)", [u1.id, F1]);
  await q("INSERT INTO voice_posts (listener_id, blob_url, blob_path, duration_ms, bytes) VALUES ($1, 'https://b.example.com/v', 'v', 3000, 1000)", [u1.id]);
  // Recommendations: pick 4 shown / 1 played; chart 2 shown / 0 played.
  const at = new Date().toISOString();
  await recordEvents(t.db, u1.id, [
    ...[0, 1, 2, 3].map((rank) => ({ episodeId: 'e1', channel: 'pick' as const, rank, kind: 'impression' as const, at })),
    { episodeId: 'e1', channel: 'pick', rank: 0, kind: 'play', at },
    ...[0, 1].map((rank) => ({ episodeId: 'e2', channel: 'chart' as const, rank, kind: 'impression' as const, at })),
  ]);
  // Money: 1 active purchase RM 4.90, one tip on it.
  const p = await seedPurchase(t, { listenerId: u1.id, store: 'apple', productId: 'tip.small', orderId: 'txn-1', status: 'active', amountMicros: 4_900_000, currency: 'MYR' });
  await seedTip(t, { fromListener: u1.id, feedUrl: F1, purchaseId: p });
  // Creators: 1 proven claim, 1 hosted show with 2 published episodes + 1 draft, 1 team member.
  await q("INSERT INTO creator_claims (listener_id, feed_url, code, status) VALUES ($1, $2, 'code-1', 'proven')", [u1.id, F1]);
  const [s] = await t.q<{ id: string }>("INSERT INTO hosted_shows (owner_id, feed_url, title) VALUES ($1, 'https://h.example.com/feed.xml', 'Hosted') RETURNING id", [u1.id]);
  for (const [g, status] of [['h1', 'published'], ['h2', 'published'], ['h3', 'draft']]) {
    await q("INSERT INTO hosted_episodes (show_id, guid, episode_id, title, audio_url, audio_bytes, audio_type, status) VALUES ($1, $2, $2, 'T', 'https://h.example.com/a.mp3', 10, 'audio/mpeg', $3)", [s!.id, g, status]);
  }
  await q('INSERT INTO show_members (feed_url, listener_id) VALUES ($1, $2)', [F1, u2.id]);
  return { u1, u2 };
}

test('G-AD1: every number on the dashboard equals the seeded fixture', async () => {
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

test('G-AD2: the response names no listener — no id, email or display name', async () => {
  const { t, owner, other } = await adminSetup();
  const { u1, u2 } = await seed(t);
  const body = JSON.stringify(await metrics(t, owner, 30));
  for (const s of [owner.id, other.id, u1.id, u2.id, 'u1@example.com', 'u2@example.com', 'Uma', 'Vic', 'owner@example.com', 'Owner']) {
    assert.equal(body.includes(s), false, `the dashboard must not contain ${s}`);
  }
  await t.close();
});

test('G-AD3: a person counts once per day however often they come; a Studio session never counts', async () => {
  const { t, owner } = await adminSetup();
  const u = await signUp(t, 'x@example.com', 'Xia');
  for (let i = 0; i < 5; i++) await t.call('GET', '/v1/me', undefined, u.token);
  // The owner used only the Studio — never the app. Their studio-web token, even sent straight to
  // a phone route, must not count as app use (the Studio's own path never reaches listenerForToken).
  await aCall(t, 'GET', '/v1/admin/audit', owner);
  assert.equal((await t.call('GET', '/v1/me', undefined, owner.token)).status, 200);
  const days = [dayAgo(1), dayAgo(0)];
  assert.deepEqual(await dailyActiveRows(t, days), [{ listener_id: u.id, day: dayAgo(0) }]);
  // Deleting the account deletes its days (FR-015).
  await deleteListener(t, u.id);
  assert.equal((await dailyActiveRows(t, days)).length, 0);
  await t.close();
});

test('FR-015: a day of app use is deleted after 400 days by the hourly rebuild', async () => {
  const { t } = await adminSetup({ jobToken: JOB });
  const u = await signUp(t, 'old@example.com', 'Old');
  await addDailyActive(t, dayAgo(401), u.id);
  await addDailyActive(t, dayAgo(399), u.id);
  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'sweep' }, undefined, { authorization: `Bearer ${JOB}` });
  assert.equal(((await res.json()) as { counts: { activeDeleted: number } }).counts.activeDeleted, 1);
  assert.deepEqual((await dailyActiveRows(t, [dayAgo(402), dayAgo(401), dayAgo(400), dayAgo(399), dayAgo(0)])).map((r) => r.day), [dayAgo(399)]);
  await t.close();
});

// On DynamoDB the money section reads lane PD's items, so DROP TABLE breaks nothing there: its G-AD4 is the fault-injection
// guard in test/ddb-sf.test.ts. Here it runs on Postgres.
test('G-AD4: one section failing leaves the other seven; a partial result is not kept', { skip: TEST_BACKEND === 'ddb' ? 'fault-injection version in test/ddb-sf.test.ts' : false }, async () => {
  const { t, owner } = await adminSetup();
  await t.q('DROP TABLE tips');
  const m = await metrics(t, owner);
  assert.equal(m.partial, true);
  assert.equal(m.sections.money.ok, false);
  for (const k of ['users', 'listening', 'library', 'social', 'recs', 'safety', 'creators'] as const) assert.equal(m.sections[k].ok, true, k);
  assert.equal(await cacheKeyExists(t, 'admin-metrics:7'), false, 'a partial result is dropped so Retry recounts');
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

test('G-AD5: an ordinary account, and no session at all, are refused; a bad range is refused (422, like every validation error)', async () => {
  const { t, owner, other } = await adminSetup();
  assert.equal((await aCall(t, 'GET', '/v1/admin/metrics', other)).status, 403);
  assert.ok([401, 403].includes((await aCall(t, 'GET', '/v1/admin/metrics')).status));
  assert.equal((await aCall(t, 'GET', '/v1/admin/metrics?days=14', owner)).status, 422);
  await t.close();
});
