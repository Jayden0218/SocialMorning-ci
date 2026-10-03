// Tests announcements' monthly push limit, polls voting, and the app's extras call.
/**
 * M11 US5 — announcements, polls, the app's extras call, and share events.
 *
 * The breaks that turn the guards red:
 *   G-N2 (2 pushes a month; an edit never pushes): in `src/db/repos/studio/announcements.ts` `pushedThisMonth`,
 *        drop the `pushed_at >= date_trunc('month', …)` condition — last month's pushes then use up this month.
 *   G-P1 (one vote each; closed takes none): in `src/db/repos/studio/polls.ts` `vote`, drop the `!p.open` check.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { addEpisode, proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/mine.xml';

/** A fake Expo that answers every message ok and remembers what it was sent. */
function fakeExpo() {
  const sent: { to: string; title: string; body: string; data: Record<string, string> }[] = [];
  const f = (async (_u: string, init: RequestInit) => {
    const batch = JSON.parse(String(init.body)) as typeof sent;
    sent.push(...batch);
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, sent };
}

async function setup(withPush = true) {
  const expo = fakeExpo();
  const t = await freshDb(withPush ? { pushFetch: expo.f } : {});
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  await addEpisode(t, FEED, 'E1', 'Ep one', 1_000_000);
  const sub = await signUp(t, 's@example.com', 'Sub');
  const quiet = await signUp(t, 'q@example.com', 'Quiet');
  const stranger = await signUp(t, 'x@example.com', 'Stranger');
  for (const l of [sub, quiet]) await t.q('INSERT INTO subscriptions (listener_id, feed_url) VALUES ($1, $2)', [l.id, FEED]);
  await t.q("INSERT INTO push_tokens (token, listener_id, platform) VALUES ('ExponentPushToken[sub]', $1, 'ios'), ('ExponentPushToken[quiet]', $2, 'android'), ('ExponentPushToken[x]', $3, 'ios')", [sub.id, quiet.id, stranger.id]);
  await t.q('INSERT INTO push_prefs (listener_id, new_episodes) VALUES ($1, false)', [quiet.id]);
  return { t, expo, owner, key, sub, quiet, stranger };
}

const post = (t: TestDb, who: Parameters<typeof sCall>[3], key: string, body: string) => sCall(t, 'POST', `/v1/studio/shows/${key}/announcements`, who, { body });

test('G-N2: two announcements push to subscribers who allow it; the third in a month is refused with the reset date', async () => {
  const { t, expo, owner, key } = await setup();
  const one = await post(t, owner, key, 'New season on Monday!');
  assert.equal(one.status, 201);
  assert.deepEqual(((await one.json()) as { pushed: { devices: number } }).pushed, { devices: 1 });
  assert.deepEqual(expo.sent.map((m) => [m.to, m.body, m.data.kind]), [['ExponentPushToken[sub]', 'New season on Monday!', 'announcement']], 'not to the one who turned pushes off, not to non-subscribers');
  assert.equal((await post(t, owner, key, 'Live Q&A Friday')).status, 201);
  const third = await post(t, owner, key, 'One more');
  assert.equal(third.status, 429);
  const j = (await third.json()) as { reason: string; resetsOn: string };
  assert.equal(j.reason, 'monthly_limit');
  assert.match(j.resetsOn, /^\d{4}-\d{2}-01$/);
  const list = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/announcements`, owner)).json()) as { items: unknown[]; pushesLeftThisMonth: number };
  assert.deepEqual([list.items.length, list.pushesLeftThisMonth], [2, 0], 'the refused one was not stored');
  await t.close();
});

test('G-N2: an edit changes the text and sends nothing; last month\'s pushes do not count', async () => {
  const { t, expo, owner, key } = await setup();
  await t.q("INSERT INTO announcements (feed_url, body, created_at, pushed_at) VALUES ($1, 'old', now() - interval '40 days', now() - interval '40 days'), ($1, 'old2', now() - interval '40 days', now() - interval '40 days')", [FEED]);
  const r = await post(t, owner, key, 'First draft');
  assert.equal(r.status, 201);
  const id = ((await r.json()) as { announcement: { id: string } }).announcement.id;
  const before = expo.sent.length;
  const e = await sCall(t, 'PUT', `/v1/studio/shows/${key}/announcements/${id}`, owner, { body: 'Fixed typo' });
  assert.equal(e.status, 200);
  assert.equal(((await e.json()) as { announcement: { body: string; editedAt: string | null } }).announcement.body, 'Fixed typo');
  assert.equal(expo.sent.length, before, 'no second push');
  await t.close();
});

test('the app sees the latest 3 announcements and the overrides slot on the show', async () => {
  const { t, owner, key, sub } = await setup(false);
  for (const b of ['a', 'b']) assert.equal((await post(t, owner, key, b)).status, 201);
  const x = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}`, undefined, sub.token)).json()) as { overrides: unknown; announcements: { body: string }[]; polls: unknown[] };
  assert.deepEqual([x.overrides, x.announcements.map((a) => a.body), x.polls], [null, ['b', 'a'], []]);
  assert.equal((await t.call('GET', '/v1/shows/extras?feedUrl=nope')).status, 422);
  await t.close();
});

test('G-P1: one vote per listener; the creator sees live counts; a closed poll takes no vote', async () => {
  const { t, owner, key, sub, quiet } = await setup(false);
  const endsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const bad = await sCall(t, 'POST', `/v1/studio/shows/${key}/polls`, owner, { question: 'Next topic?', options: ['Only one'], endsAt });
  assert.equal(bad.status, 422);
  const tooLong = await sCall(t, 'POST', `/v1/studio/shows/${key}/polls`, owner, { question: 'Q', options: ['a', 'b'], endsAt: new Date(Date.now() + 31 * 86_400_000).toISOString() });
  assert.equal(tooLong.status, 422);
  const made = await sCall(t, 'POST', `/v1/studio/shows/${key}/polls`, owner, { question: 'Next topic?', options: ['Books', 'Films', 'Food'], endsAt, episodeId: 'E1' });
  assert.equal(made.status, 201);
  const id = ((await made.json()) as { poll: { id: string } }).poll.id;

  const v1 = await t.call('POST', `/v1/polls/${id}/vote`, { optionIdx: 1 }, sub.token);
  assert.equal(v1.status, 200);
  const again = (await (await t.call('POST', `/v1/polls/${id}/vote`, { optionIdx: 2 }, sub.token)).json()) as { poll: { myVote: number; total: number } };
  assert.deepEqual([again.poll.myVote, again.poll.total], [1, 1], 'the first vote stands');
  await t.call('POST', `/v1/polls/${id}/vote`, { optionIdx: 2 }, quiet.token);
  const seen = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/polls`, owner)).json()) as { items: { total: number; options: { votes: number }[]; open: boolean }[] };
  assert.deepEqual([seen.items[0]!.total, seen.items[0]!.options.map((o) => o.votes), seen.items[0]!.open], [2, [0, 1, 1], true]);

  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/polls/${id}/close`, owner)).status, 204);
  const late = await signUp(t, 'late@example.com', 'Late');
  const closed = await t.call('POST', `/v1/polls/${id}/vote`, { optionIdx: 0 }, late.token);
  assert.equal(closed.status, 409);
  const app = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}`, undefined, sub.token)).json()) as { polls: { open: boolean; myVote: number }[] };
  assert.deepEqual([app.polls[0]!.open, app.polls[0]!.myVote], [false, 1], 'a closed poll still shows its result for 7 days');
  await t.close();
});

test('FR-011: a share event is stored for the show, signed in or not', async () => {
  const { t, sub } = await setup(false);
  assert.equal((await t.call('POST', '/v1/shares', { targetKind: 'episode', targetId: 'E1', feedUrl: FEED }, sub.token)).status, 204);
  assert.equal((await t.call('POST', '/v1/shares', { targetKind: 'show', targetId: FEED, feedUrl: FEED })).status, 204);
  assert.equal((await t.call('POST', '/v1/shares', { targetKind: 'nope', targetId: 'x', feedUrl: FEED })).status, 422);
  assert.equal((await t.q('SELECT count(*)::int AS n FROM share_events WHERE feed_url = $1', [FEED]))[0]!.n, 2);
  await t.close();
});
