// Tests M21 US8: text status (140, 24 h sweep), subscription order, host line, likes count, private fields.
/**
 * M21 US8 (specs/022-m21-the-xiaoyuzhou-gaps, T093). Two guards:
 *
 * G-M21-8 — a text status over 140 characters is refused; the sweep deletes it at 24 h.
 *   The break that turns it red: allow 141 characters (raise TEXT_STATUS_MAX in
 *   `src/db/repos/social/voice-posts.ts`), or skip text rows in the sweep (drop the
 *   `body IS NOT NULL` DELETE in `sweepExpired`) — the 141-character post answers 201, or the
 *   expired text row is still there after the cycle.
 * G-M21-10 — others never receive birthday, industry or private subscriptions.
 *   The break that turns it red: select `birthday, industry` into the public profile
 *   (`src/db/repos/social/profiles.ts` `profile`), or skip the `private_subscriptions` check in
 *   `subscriptionsVisible` — the stranger's read carries the birthday, or the private list answers 200.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { expireStatus, voicePostIds } from './sc-neutral.ts';
import { like } from '../src/db/repos/social/likes.ts';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { suspend } from './sg-neutral.ts';

const JOB = 'job-token-not-secret';
const rebuild = (t: TestDb) => t.call('POST', '/v1/internal/rebuild', { step: 'sweep' }, undefined, { authorization: `Bearer ${JOB}` });
const text = (t: TestDb, token: string, body: unknown) => t.call('POST', '/v1/voice-posts', body, token);
type Feed = { items: { id: string; body?: string; url?: string; durationMs: number; mine: boolean }[] };

test('G-M21-8: a text status is 1–140 characters, needs no voice store, shows to followers, and the sweep deletes it at 24 h', async () => {
  const t = await freshDb({ jobToken: JOB }); // no voice store connected: a text status needs none
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token);

  const long = await text(t, a.token, { body: 'x'.repeat(141) });
  assert.equal(long.status, 422); // M23 US6: bad input is 422 `validation` (the old code is `reason`)
  assert.equal(((await long.json()) as { reason: string }).reason, 'too_long');
  for (const body of [{ body: '' }, { body: '    ' }, {}]) {
    const r = await text(t, a.token, body);
    assert.equal(r.status, 422, JSON.stringify(body));
    assert.equal(((await r.json()) as { reason: string }).reason, 'empty');
  }
  assert.equal((await t.call('POST', '/v1/voice-posts', { body: 'hi' })).status, 401);
  // 140 emoji are 140 characters (code points), the same count the column CHECKs.
  assert.equal((await text(t, a.token, { body: '🎧'.repeat(140) })).status, 201);
  assert.equal((await voicePostIds(t)).length, 1, 'nothing refused was stored');

  const r = await text(t, a.token, { body: '  Listening to the rain  ' });
  assert.equal(r.status, 201);
  const made = (await r.json()) as { id: string; body: string; expiresAt: string };
  assert.equal(made.body, 'Listening to the rain');
  const hours = (new Date(made.expiresAt).getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 23.9 && hours <= 24, `expires 24 h after posting (${hours})`);
  const forB = (await (await t.call('GET', '/v1/voice-posts?from=following', undefined, b.token)).json()) as Feed;
  const seen = forB.items.find((i) => i.id === made.id)!;
  assert.equal(seen.body, 'Listening to the rain');
  assert.equal(seen.url, undefined, 'a text status has no audio');
  assert.equal(seen.mine, false);

  await expireStatus(t, made.id, 60_000);
  const res = (await (await rebuild(t)).json()) as { counts: { voiceDeleted: number } };
  assert.equal(res.counts.voiceDeleted, 1);
  assert.ok(!(await voicePostIds(t)).includes(made.id), 'the row is gone, not just hidden');
  assert.equal((await voicePostIds(t)).length, 1, 'the live one stays');
  await t.close();
});

test('FR-072: PUT /v1/me/subscriptions/order saves my own order; GET reads it back; others go last', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const F = ['https://f.example/1.xml', 'https://f.example/2.xml', 'https://f.example/3.xml'];
  await t.call('PUT', '/v1/me/subscriptions', { items: F.map((feedUrl, i) => ({ feedUrl, createdAt: `2026-10-0${i + 1}T00:00:00.000Z` })) }, a.token);
  assert.equal((await t.call('PUT', '/v1/me/subscriptions/order', { feedUrls: [F[2], F[0], 'https://not-mine.example/x.xml'] }, a.token)).status, 204);
  const order = (await (await t.call('GET', '/v1/me/subscriptions/order', undefined, a.token)).json()) as { feedUrls: string[] };
  assert.deepEqual(order.feedUrls, [F[2], F[0]]);
  await t.call('PUT', '/v1/me/subscriptions/order', { feedUrls: [F[1]] }, a.token);
  assert.deepEqual(((await (await t.call('GET', '/v1/me/subscriptions/order', undefined, a.token)).json()) as { feedUrls: string[] }).feedUrls, [F[1]], 'a new order replaces the old');
  assert.equal((await t.call('PUT', '/v1/me/subscriptions/order', { feedUrls: [F[0]] })).status, 401);
  await t.close();
});

test('FR-074: the profile names the shows they host and counts their likes (only while public)', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const FEED = 'https://feeds.example.com/show.xml';
  await t.q("INSERT INTO creator_claims (listener_id, feed_url, code, status, proven_at) VALUES ($1, $2, 'code-1', 'proven', now())", [a.id, FEED]);
  await t.q("INSERT INTO show_overrides (feed_url, title) VALUES ($1, 'Rain Talk')", [FEED]);
  const ep = { feedUrl: FEED, guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
  const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
  await putEpisode(t, `${EP}`, ep);
  await like(t.db, a.id, `${EP}`, undefined); // M26 lane SC: the repo, on either backend

  type P = { profile: { hostOf: { feedUrl: string; title: string }[]; likesCount?: number; privateSubscriptions: boolean } };
  const p = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as P;
  assert.deepEqual(p.profile.hostOf, [{ feedUrl: FEED, title: 'Rain Talk' }]);
  assert.equal(p.profile.likesCount, 1);
  assert.equal(p.profile.privateSubscriptions, false);

  await t.call('PATCH', '/v1/me', { likesPublic: false }, a.token);
  const hidden = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as P;
  assert.equal(hidden.profile.likesCount, undefined, 'private likes are not counted for others');
  const own = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, a.token)).json()) as P;
  assert.equal(own.profile.likesCount, 1, 'but are for yourself');

  await suspend(t, a.id);
  const gone = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as P;
  assert.deepEqual(gone.profile.hostOf, [], 'a suspended listener hosts nothing');
  await t.close();
});

test('G-M21-10: birthday and industry reach only the owner; private subscriptions answer 403 private', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const FEED = 'https://feeds.example.com/mine.xml';
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FEED, createdAt: '2026-10-01T00:00:00.000Z' }] }, a.token);

  // Validation: a real past date; industry at most 40 characters.
  assert.equal((await t.call('PATCH', '/v1/me', { birthday: '2026-02-30' }, a.token)).status, 422);
  assert.equal((await t.call('PATCH', '/v1/me', { birthday: '2999-01-01' }, a.token)).status, 422);
  assert.equal((await t.call('PATCH', '/v1/me', { industry: 'x'.repeat(41) }, a.token)).status, 422);
  const patched = await t.call('PATCH', '/v1/me', { birthday: '1994-07-15', industry: 'Radio engineering' }, a.token);
  assert.equal(patched.status, 200);
  const mine = (await patched.json()) as { listener: { birthday?: string; industry?: string; privateSubscriptions: boolean; hideBadge: boolean } };
  assert.equal(mine.listener.birthday, '1994-07-15');
  assert.equal(mine.listener.industry, 'Radio engineering');
  assert.equal(mine.listener.privateSubscriptions, false);
  assert.equal(mine.listener.hideBadge, false);
  const me = (await (await t.call('GET', '/v1/me', undefined, a.token)).json()) as { listener: { birthday?: string } };
  assert.equal(me.listener.birthday, '1994-07-15');

  // Everything another person (signed in or out) can read about Alex carries neither.
  const paths = [`/v1/listeners/${a.id}`, `/v1/listeners/${a.id}/followers`, `/v1/listeners/${a.id}/following`, `/v1/listeners/${a.id}/subscriptions`];
  for (const token of [b.token, undefined]) {
    for (const path of paths) {
      const body = await (await t.call('GET', path, undefined, token)).text();
      assert.ok(!body.includes('1994-07-15') && !body.includes('Radio engineering'), `${path} leaks a private field`);
      assert.ok(!body.includes('"birthday"') && !body.includes('"industry"'), `${path} names a private field`);
    }
  }

  // Public by default: Bea sees the list.
  const open = await t.call('GET', `/v1/listeners/${a.id}/subscriptions`, undefined, b.token);
  assert.equal(open.status, 200);
  assert.deepEqual(((await open.json()) as { items: { feedUrl: string }[] }).items.map((i) => i.feedUrl), [FEED]);

  assert.equal((await t.call('PATCH', '/v1/me', { privateSubscriptions: true }, a.token)).status, 200);
  for (const token of [b.token, undefined]) {
    const r = await t.call('GET', `/v1/listeners/${a.id}/subscriptions`, undefined, token);
    assert.equal(r.status, 403);
    const text = await r.text();
    assert.equal((JSON.parse(text) as { error: string }).error, 'private');
    assert.ok(!text.includes(FEED), 'a refusal carries no feed');
  }
  const p = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as { profile: { privateSubscriptions: boolean } };
  assert.equal(p.profile.privateSubscriptions, true, 'the app knows to show the private state');
  assert.equal((await t.call('GET', `/v1/listeners/${a.id}/subscriptions`, undefined, a.token)).status, 200, 'the owner still sees their own');

  // Clearing works: null removes both.
  await t.call('PATCH', '/v1/me', { birthday: null, industry: null }, a.token);
  const cleared = (await (await t.call('GET', '/v1/me', undefined, a.token)).json()) as { listener: { birthday?: string; industry?: string } };
  assert.equal(cleared.listener.birthday, undefined);
  assert.equal(cleared.listener.industry, undefined);
  assert.equal((await t.call('GET', '/v1/listeners/00000000-0000-4000-8000-000000000000/subscriptions', undefined, b.token)).status, 404);
  await t.close();
});

test('FR-074: follower rows carry the bio and, signed in, whether you follow them', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cy');
  await t.call('PATCH', '/v1/me', { bio: 'Night radio' }, b.token);
  await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token);
  await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, c.token);
  await t.call('PUT', `/v1/listeners/${c.id}/follow`, undefined, a.token);
  type L = { listeners: { id: string; bio?: string; youFollow?: boolean }[] };
  const rows = ((await (await t.call('GET', `/v1/listeners/${a.id}/followers`, undefined, a.token)).json()) as L).listeners;
  assert.deepEqual(rows.find((r) => r.id === b.id), { id: b.id, displayName: 'Bea', bio: 'Night radio', youFollow: false });
  assert.equal(rows.find((r) => r.id === c.id)!.youFollow, true);
  const out = ((await (await t.call('GET', `/v1/listeners/${a.id}/followers`)).json()) as L).listeners;
  assert.equal(out.find((r) => r.id === c.id)!.youFollow, undefined, 'signed out: no youFollow');
  await t.close();
});
