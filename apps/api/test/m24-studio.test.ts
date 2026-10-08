// Tests the M24 Studio rows: earnings, feed sync, hiding an episode, milestones, free preview, polls, search, like and report.
/**
 * M24 lane A2 (specs/025-m24-gaps-and-look): US9–US14 on the server.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { proveClaim, sCall, studioLogin, type StudioUser } from './studio-harness.ts';
import { sendMilestones, milestoneText } from '../src/db/repos/studio/milestones.ts';

const FEED = 'https://feeds.example.com/m24.xml';
const EP = fnv1a64(FEED + '\u0001' + 'g1');
const JOB = 'job-token-not-secret';
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>M24 Show</title><item><title>One</title><guid>g1</guid><pubDate>Tue, 10 Sep 2024 09:00:00 GMT</pubDate><enclosure url="https://cdn/1.mp3" type="audio/mpeg"/></item></channel></rss>`;

async function claimed(t: TestDb): Promise<{ owner: StudioUser; key: string }> {
  await putEpisode(t, EP, { feedUrl: FEED, guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3', durationMs: 1_000_000 });
  const owner = await studioLogin(t, 'o@example.com', 'Host');
  return { owner, key: await proveClaim(t, owner.id, FEED) };
}

async function buy(t: TestDb, who: string, product: string, micros: number | null, status: 'active' | 'refunded', at: string): Promise<string> {
  const [p] = await t.q<{ id: string }>(
    `INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, amount_micros, currency, ref, created_at)
     VALUES ($1, 'google', $2, gen_random_uuid()::text, $3, $4, $5, $6, $7) RETURNING id`,
    [who, product, status, micros, micros === null ? null : 'USD', FEED, at]);
  return p!.id;
}

test('US9: Earnings counts paid-show sales, gifts and tips per month, refunds apart; CSV; owner only', async () => {
  const t = await freshDb();
  const { owner, key } = await claimed(t);
  const a = await signUp(t, 'a@example.com', 'Ann');
  await buy(t, a.id, 'show_tier_2', 2_990_000, 'active', '2026-09-03T10:00:00Z');
  await buy(t, a.id, 'show_tier_2', 2_990_000, 'refunded', '2026-09-04T10:00:00Z');
  const g = await buy(t, a.id, 'gift_tier_2', 2_990_000, 'active', '2026-10-01T10:00:00Z');
  await t.q("INSERT INTO gifts (code, buyer_id, feed_url, purchase_id) VALUES ('ABCDEFGH12345678', $1, $2, $3)", [a.id, FEED, g]);
  const tip = await buy(t, a.id, 'tip_small', null, 'active', '2026-10-02T10:00:00Z');
  await t.q('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [a.id, FEED, tip]);
  // Someone else's show is never counted.
  await t.q("UPDATE purchases SET ref = 'https://other.example/x.xml' WHERE id = (SELECT id FROM purchases WHERE product_id = 'show_tier_2' AND status = 'active' LIMIT 1)");
  await buy(t, a.id, 'show_tier_2', 1_000_000, 'active', '2026-09-05T10:00:00Z');

  type B = { count: number; refunded: number; totalMicrosByCurrency: Record<string, number> };
  const e = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/earnings`, owner)).json()) as { months: { month: string; sale: B; gift: B; tip: B }[]; items: unknown[] };
  assert.deepEqual(e.months.map((m) => [m.month, m.sale.count, m.sale.refunded, m.sale.totalMicrosByCurrency, m.gift.count, m.tip.count, m.tip.totalMicrosByCurrency]), [
    ['2026-10', 0, 0, {}, 1, 1, {}],
    ['2026-09', 1, 1, { USD: 1_000_000 }, 0, 0, {}],
  ]);
  assert.equal(e.items.length, 4);
  const csv = await sCall(t, 'GET', `/v1/studio/shows/${key}/export/earnings.csv`, owner);
  assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
  const lines = (await csv.text()).replace(/^﻿/, '').trim().split('\r\n');
  assert.deepEqual(lines, ['Date,Type,Amount,Currency,Refunded', '2026-10-02,Tip,,,no', '2026-10-01,Gift,2.99,USD,no', '2026-09-05,Paid show,1,USD,no', '2026-09-04,Paid show,2.99,USD,yes']);
  const op = await studioLogin(t, 'op@example.com', 'Helper');
  await t.q('INSERT INTO show_members (feed_url, listener_id) VALUES ($1, $2)', [FEED, op.id]);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/earnings`, op)).status, 403);
  await t.close();
});

test('US10: the job records each fetch; Sync now fetches at once, then waits 10 minutes', async () => {
  let fail = true;
  const catalogFetch = (async () => (fail ? new Response('nope', { status: 500 }) : new Response(RSS, { status: 200, headers: { 'content-type': 'application/rss+xml' } }))) as typeof fetch;
  const t = await freshDb({ jobToken: JOB, catalogFetch });
  const { owner, key } = await claimed(t);
  type S = { fetchedAt: string | null; ok: boolean | null; error: string | null; nextManualAt: string | null };
  const before = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/feed-sync`, owner)).json()) as S;
  assert.deepEqual([before.fetchedAt, before.ok], [null, null]);

  const sub = await signUp(t, 's@example.com', 'Sub');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FEED, createdAt: '2026-10-01T00:00:00.000Z' }] }, sub.token);
  assert.equal((await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` })).status, 200);
  const failed = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/feed-sync`, owner)).json()) as S;
  assert.equal(failed.ok, false);
  assert.match(failed.error ?? '', /500/);

  fail = false;
  const now = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/feed-sync`, owner)).json()) as S;
  assert.deepEqual([now.ok, now.error], [true, null]);
  assert.ok(now.nextManualAt && Date.parse(now.nextManualAt) > Date.now());
  const again = await sCall(t, 'POST', `/v1/studio/shows/${key}/feed-sync`, owner);
  assert.equal(again.status, 429);
  assert.ok(((await again.json()) as { retryAfterSeconds: number }).retryAfterSeconds > 500);
  await t.q("UPDATE feed_sync SET manual_at = now() - interval '11 minutes'");
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/feed-sync`, owner)).status, 200);
  await t.close();
});

test('US11: the host hides an episode; the app learns its guid; showing it again takes it back', async () => {
  const t = await freshDb();
  const { owner, key } = await claimed(t);
  const guids = async () => ((await (await t.call('GET', `/v1/shows/hidden-episodes?feedUrl=${encodeURIComponent(FEED)}`)).json()) as { guids: string[] }).guids;
  assert.deepEqual(await guids(), []);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/episodes/${EP}/hidden`, owner, { hidden: true })).status, 200);
  assert.deepEqual(await guids(), ['g1']);
  const list = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/hidden-episodes`, owner)).json()) as { items: { episodeId: string; title: string }[] };
  assert.deepEqual(list.items.map((i) => [i.episodeId, i.title]), [[EP, 'Ep 1']]);
  const extras = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}`)).json()) as { hiddenGuids: string[] };
  assert.deepEqual(extras.hiddenGuids, ['g1']);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/episodes/nope/hidden`, owner, { hidden: true })).status, 404);
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/episodes/${EP}/hidden`, owner, { hidden: false });
  assert.deepEqual(await guids(), []);
  await t.close();
});

test('US12: the milestone message reaches the 100th subscriber once, as a From hosts notice; an old crossing is not sent', async () => {
  const t = await freshDb();
  const { owner } = await claimed(t);
  await t.q("INSERT INTO show_overrides (feed_url, milestone_message, updated_by) VALUES ($1, 'Thank you, our {n}th listener!', $2)", [FEED, owner.id]);
  const hundredth = await signUp(t, 'h@example.com', 'Hundredth');
  // 99 earlier subscribers, then the 100th; the 101st is later still.
  await t.q(`INSERT INTO listeners (email, password_hash, display_name) SELECT 'l' || i || '@x', 'h', 'L' || i FROM generate_series(1, 100) i`);
  await t.q(`INSERT INTO subscriptions (listener_id, feed_url, created_at)
             SELECT id, $1, now() - interval '2 days' + (row_number() OVER (ORDER BY email))::int * interval '1 second' FROM listeners WHERE email LIKE 'l%@x' AND email <> 'l100@x'`, [FEED]);
  await t.q("INSERT INTO subscriptions (listener_id, feed_url, created_at) VALUES ($1, $2, now() - interval '1 day')", [hundredth.id, FEED]);
  await t.q("INSERT INTO subscriptions (listener_id, feed_url, created_at) SELECT id, $1, now() FROM listeners WHERE email = 'l100@x'", [FEED]);
  assert.equal(await sendMilestones(t.db), 1);
  assert.equal(await sendMilestones(t.db), 0, 'once per milestone');
  const notices = (await (await t.call('GET', '/v1/me/host-notices', undefined, hundredth.token)).json()) as { items: { body: string; feedUrl: string }[] };
  assert.deepEqual(notices.items.map((n) => [n.body, n.feedUrl]), [['Thank you, our 100th listener!', FEED]]);
  assert.equal(milestoneText('{n} of you', 1000), '1,000 of you');

  // A show that crossed 100 long ago sends nothing now.
  const OLD = 'https://feeds.example.com/old.xml';
  await t.q("INSERT INTO show_overrides (feed_url, milestone_message) VALUES ($1, 'Hi')", [OLD]);
  await t.q(`INSERT INTO subscriptions (listener_id, feed_url, created_at) SELECT id, $1, now() - interval '400 days' FROM listeners WHERE email LIKE 'l%@x'`, [OLD]);
  assert.equal(await sendMilestones(t.db), 0);
  await t.close();
});

test('US13: a paid episode\'s free preview — set by the owner, read by anyone, only on a paid episode', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Host');
  const HOSTED = 'https://socialmorning-api.vercel.app/feeds/m24.xml';
  const key = await proveClaim(t, owner.id, HOSTED);
  const [s] = await t.q<{ id: string }>('INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, 2) RETURNING id', [owner.id, HOSTED, 'Hosted']);
  const ep = async (paid: boolean) => (await t.q<{ id: string }>(
    `INSERT INTO hosted_episodes (show_id, guid, episode_id, title, audio_url, audio_bytes, audio_type, status, published_at, paid, created_at, duration_ms)
     VALUES ($1, gen_random_uuid()::text, gen_random_uuid()::text, 'Ep', 'https://blob.example/a.mp3', 10, 'audio/mpeg', 'published', now() - interval '1 minute', $2, now(), 1800000) RETURNING id`, [s!.id, paid]))[0]!.id;
  const paidId = await ep(true);
  const freeId = await ep(false);
  const set = (id: string, preview: unknown) => sCall(t, 'PUT', `/v1/studio/shows/${key}/hosted-episodes/${id}/preview`, owner, { preview });
  assert.equal((await t.call('GET', `/v1/hosted/episodes/${paidId}/preview`)).status, 402, 'no preview set yet');
  assert.equal((await set(freeId, { startMs: 0, endMs: 60_000 })).status, 422, 'a free episode is free whole');
  assert.equal((await set(paidId, { startMs: 0, endMs: 700_000 })).status, 422, 'at most 10 minutes');
  assert.equal((await set(paidId, { startMs: 1_790_000, endMs: 1_850_000 })).status, 422, 'not past the end');
  const ok = (await (await set(paidId, { startMs: 60_000, endMs: 180_000 })).json()) as { episode: { preview: { startMs: number; endMs: number } } };
  assert.deepEqual(ok.episode.preview, { startMs: 60_000, endMs: 180_000 });
  const p = (await (await t.call('GET', `/v1/hosted/episodes/${paidId}/preview`)).json()) as { url: string; startMs: number; endMs: number };
  assert.deepEqual([p.startMs, p.endMs], [60_000, 180_000]);
  // M25 S1: a preview link is its own kind, never the buyer's /audio link (test/m25-security.test.ts).
  assert.match(p.url, new RegExp(`/v1/hosted/episodes/${paidId}/preview-audio\\?exp=\\d+&sig=`));
  const list = (await (await t.call('GET', `/v1/hosted/paid?feedUrl=${encodeURIComponent(HOSTED)}`)).json()) as { items: { id: string; preview?: unknown }[] };
  assert.deepEqual(list.items.map((i) => [i.id, i.preview]), [[paidId, { startMs: 60_000, endMs: 180_000 }]]);
  assert.equal((await set(paidId, null)).status, 200);
  assert.equal((await t.call('GET', `/v1/hosted/episodes/${paidId}/preview`)).status, 402);
  await t.close();
});

test('US14: polls — multiple choice toggles options, single choice stays one vote; delete removes it', async () => {
  const t = await freshDb();
  const { owner, key } = await claimed(t);
  const sub = await signUp(t, 's@example.com', 'Sub');
  const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const made = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/polls`, owner, { question: 'Which?', options: ['A', 'B', 'C'], endsAt, multi: true })).json()) as { poll: { id: string; multi: boolean } };
  assert.equal(made.poll.multi, true);
  const vote = async (b: unknown) => ((await (await t.call('POST', `/v1/polls/${made.poll.id}/vote`, b, sub.token)).json()) as { poll: { myVotes: number[]; total: number; voters: number } }).poll;
  await vote({ optionIdx: 0 });
  const two = await vote({ optionIdx: 2 });
  assert.deepEqual([two.myVotes, two.total, two.voters], [[0, 2], 2, 1]);
  assert.deepEqual((await vote({ optionIdx: 0 })).myVotes, [2], 'a second tap takes the option back');
  assert.deepEqual((await vote({ optionIdxs: [1, 2] })).myVotes, [1, 2]);

  const single = (await (await sCall(t, 'POST', `/v1/studio/shows/${key}/polls`, owner, { question: 'One?', options: ['A', 'B'], endsAt })).json()) as { poll: { id: string } };
  assert.equal((await t.call('POST', `/v1/polls/${single.poll.id}/vote`, { optionIdxs: [0, 1] }, sub.token)).status, 422);
  await t.call('POST', `/v1/polls/${single.poll.id}/vote`, { optionIdx: 0 }, sub.token);
  const changed = (await (await t.call('POST', `/v1/polls/${single.poll.id}/vote`, { optionIdx: 1 }, sub.token)).json()) as { poll: { myVotes: number[]; total: number } };
  assert.deepEqual([changed.poll.myVotes, changed.poll.total], [[1], 1]);

  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/polls/${made.poll.id}`, owner)).status, 204);
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/polls/${made.poll.id}`, owner)).status, 404);
  assert.equal((await t.q('SELECT count(*)::int AS n FROM poll_votes WHERE poll_id = $1', [made.poll.id]))[0]!.n, 0);
  await t.close();
});

test('US14: subscriber search by name; the host likes and reports a listener\'s comment', async () => {
  const t = await freshDb();
  const { owner, key } = await claimed(t);
  const mei = await signUp(t, 'mei@example.com', 'Mei Lin');
  const xu = await signUp(t, 'xu@example.com', 'Xu');
  for (const who of [mei, xu]) await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FEED, createdAt: '2026-10-01T00:00:00.000Z' }] }, who.token);
  type L = { total: number; items: { displayName: string }[] };
  const hit = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/subscribers?q=mei`, owner)).json()) as L;
  assert.deepEqual([hit.total, hit.items.map((i) => i.displayName)], [1, ['Mei Lin']]);
  const pct = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/subscribers?q=%25`, owner)).json()) as L;
  assert.equal(pct.total, 0, 'a % is a character, not a wildcard');

  const posted = (await (await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'Great one' }, mei.token)).json()) as { comment: { id: string } };
  const id = posted.comment.id;
  const liked = (await (await sCall(t, 'PUT', `/v1/studio/shows/${key}/comments/${id}/like`, owner)).json()) as { likeCount: number; likedByMe: boolean };
  assert.deepEqual(liked, { likeCount: 1, likedByMe: true });
  const n = await t.q<{ kind: string }>('SELECT kind FROM notifications WHERE recipient_id = $1', [mei.id]);
  assert.deepEqual(n.map((r) => r.kind), ['like'], 'the author is told, as for any like');
  assert.deepEqual(await (await sCall(t, 'DELETE', `/v1/studio/shows/${key}/comments/${id}/like`, owner)).json(), { likeCount: 0, likedByMe: false });

  const r = await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${id}/report`, owner, { reason: 'spam', note: 'ads' });
  assert.equal(r.status, 201);
  const again = await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${id}/report`, owner, { reason: 'spam' });
  assert.equal(((await again.json()) as { duplicate: boolean }).duplicate, true);
  const rows = await t.q<{ target_kind: string; reporter_id: string }>('SELECT target_kind, reporter_id FROM reports');
  assert.deepEqual(rows, [{ target_kind: 'comment', reporter_id: owner.id }]);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/${id}/report`, owner, { reason: 'nope' })).status, 422);
  await t.close();
});
