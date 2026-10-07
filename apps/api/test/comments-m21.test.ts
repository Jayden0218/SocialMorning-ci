// Tests M21 comments: mutes, the community rules, region and badge, sort direction, listened_ms.
/**
 * M21 US6 (specs/022-m21-the-xiaoyuzhou-gaps, T073). Three guards:
 *
 * G-M21-6 — a muted listener's comments (and replies) are gone from the MUTER's reads only.
 *   The break that turns it red: in `src/db/repos/social/comments.ts` `listComments`, drop the
 *   mute filter (`withoutMuted`) — the muter sees the muted listener's comment again.
 * G-M21-7 — a comment POST (text and voice) answers 428 rules_required until POST /v1/me/rules.
 *   The break that turns it red: skip the check (`requireRulesAccepted`) in
 *   `src/routes/social/comments.ts` — the first POST answers 200.
 * G-M21-12 — `listeners.listened_ms` grows by the union's change, never by the raw range sum.
 *   The break that turns it red: in `src/db/repos/library/listened.ts` `replaceRanges`, add the raw
 *   range sum (`after` alone, or the sum of the device's ranges) — two overlapping phones give 120 s.
 *
 * Note: the harness gives every test listener `rules_accepted_at = now()`; the rules tests set it
 * back to NULL for the listener they test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { badgeFor } from '../src/db/repos/social/comments.ts';
import { listenedDelta } from '../src/db/repos/library/listened.ts';

type C = { id: string; authorId: string | null; body: string | null; country: string | null; badge: number | null; replies?: C[] };

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

async function setup() {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cy');
  return { t, a, b, c };
}
const list = async (t: TestDb, token?: string, query = '') =>
  ((await (await t.call('GET', `/v1/episodes/${EP}/social${query}`, undefined, token)).json()) as { comments: C[] }).comments;
const post = (t: TestDb, token: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  t.call('POST', `/v1/episodes/${EP}/comments`, body, token, headers);

test('G-M21-6: a muted listener is hidden from the muter only — comments and replies; unmute brings them back', async () => {
  const { t, a, b, c } = await setup();
  const top = ((await (await post(t, b.token, { body: 'Bea says hi' })).json()) as { comment: { id: string } }).comment.id;
  const mine = ((await (await post(t, a.token, { body: 'Alex here' })).json()) as { comment: { id: string } }).comment.id;
  // Bea also replies under Alex's comment (inserted directly: the 5 s rate floor).
  await t.q('INSERT INTO comments (episode_id, author_id, body, parent_id) VALUES ($1, $2, $3, $4)', [EP, b.id, 'Bea replies', mine]);

  assert.equal((await t.call('PUT', `/v1/me/mutes/${b.id}`, undefined, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/me/mutes/${b.id}`, undefined, a.token)).status, 204, 'idempotent');
  assert.equal((await t.call('PUT', `/v1/me/mutes/${a.id}`, undefined, a.token)).status, 422, 'not yourself');
  assert.equal((await t.call('PUT', '/v1/me/mutes/00000000-0000-4000-8000-000000000000', undefined, a.token)).status, 404);
  const mutes = (await (await t.call('GET', '/v1/me/mutes', undefined, a.token)).json()) as { items: { id: string; name: string; avatarUrl: string | null }[] };
  assert.deepEqual(mutes.items, [{ id: b.id, name: 'Bea', avatarUrl: null }]);

  const forA = await list(t, a.token);
  assert.deepEqual(forA.map((x) => x.id), [mine], "the muter does not see Bea's comment");
  assert.deepEqual(forA[0]!.replies!.map((r) => r.body), [], "nor Bea's reply");
  assert.equal((await t.call('GET', `/v1/comments/${top}/thread`, undefined, a.token)).status, 404, 'nor her thread');

  // Everyone else — Cy, Bea herself, and a signed-out reader — still sees it all.
  for (const token of [c.token, b.token, undefined]) {
    const seen = await list(t, token);
    assert.deepEqual(seen.map((x) => x.id).sort(), [top, mine].sort());
    assert.deepEqual(seen.find((x) => x.id === mine)!.replies!.map((r) => r.body), ['Bea replies']);
  }
  // Bea is never told: nothing about the mute in her own reads.
  assert.ok(!(await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, b.token)).text()).includes('mute'));

  assert.equal((await t.call('DELETE', `/v1/me/mutes/${b.id}`, undefined, a.token)).status, 204);
  assert.deepEqual((await list(t, a.token)).map((x) => x.id).sort(), [top, mine].sort(), 'unmute: back again (the ETag moved too)');
  assert.deepEqual(((await (await t.call('GET', '/v1/me/mutes', undefined, a.token)).json()) as { items: unknown[] }).items, []);
  await t.close();
});

test('G-M21-6: voice posts and the likes timeline drop a muted listener too', async () => {
  const { t, a, b } = await setup();
  await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  await t.q("INSERT INTO voice_posts (id, listener_id, blob_url, blob_path, duration_ms, bytes, expires_at) VALUES (gen_random_uuid(), $1, 'https://v/x.m4a', 'x.m4a', 1000, 10, now() + interval '1 day')", [b.id]);
  await t.q('INSERT INTO episode_likes (listener_id, episode_id) VALUES ($1, $2)', [b.id, EP]);
  const likes = async () => ((await (await t.call('GET', '/v1/me/likes/timeline', undefined, a.token)).json()) as { items: unknown[] }).items.length;
  const voiceCount = async () => ((await (await t.call('GET', '/v1/voice-posts', undefined, a.token)).json()) as { items: { author: { id: string } }[] }).items.filter((p) => p.author.id === b.id).length;
  assert.equal(await voiceCount(), 1);
  assert.equal(await likes(), 1);
  await t.call('PUT', `/v1/me/mutes/${b.id}`, undefined, a.token);
  assert.equal(await voiceCount(), 0);
  assert.equal(await likes(), 0);
  await t.close();
});

test('G-M21-7: no comment — text or voice — before the rules; declining sends nothing; accepting lets it through', async () => {
  const { t, a } = await setup();
  await t.q('UPDATE listeners SET rules_accepted_at = NULL WHERE id = $1', [a.id]);
  const refused = await post(t, a.token, { body: 'first!' });
  assert.equal(refused.status, 428);
  assert.equal(((await refused.json()) as { error: string }).error, 'rules_required');
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM comments'), [{ n: 0 }], 'nothing was stored');
  // The voice route is gated before it reads or stores anything.
  const voice = await t.app.request(`/v1/episodes/${EP}/comments/voice`, { method: 'POST', headers: { authorization: `Bearer ${a.token}`, 'content-type': 'audio/mp4', 'x-duration-ms': '1000' }, body: new Uint8Array([0]) });
  assert.ok(voice.status === 428 || voice.status === 503, `voice comment refused (${voice.status})`);
  // "Not now" is simply no call: asked again next time.
  assert.equal((await post(t, a.token, { body: 'again' })).status, 428);

  assert.equal((await t.call('POST', '/v1/me/rules', undefined, a.token)).status, 204);
  const [first] = await t.q<{ at: string }>('SELECT rules_accepted_at::text AS at FROM listeners WHERE id = $1', [a.id]);
  assert.ok(first!.at);
  assert.equal((await t.call('POST', '/v1/me/rules', undefined, a.token)).status, 204);
  assert.deepEqual(await t.q<{ at: string }>('SELECT rules_accepted_at::text AS at FROM listeners WHERE id = $1', [a.id]), [{ at: first!.at }], 'the first acceptance is kept');
  assert.equal((await post(t, a.token, { body: 'first!' })).status, 200);
  assert.equal((await t.call('POST', '/v1/me/rules')).status, 401, 'signed out');
  await t.close();
});

test('the voice comment route answers 428 before storage when storage is on', async () => {
  const stored: string[] = [];
  const t = await freshDb({ voiceStorage: { ready: true, put: async (p: string) => { stored.push(p); return { url: `https://v/${p}`, pathname: p }; }, remove: async () => {} } as never });
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  await t.q('UPDATE listeners SET rules_accepted_at = NULL WHERE id = $1', [a.id]);
  const r = await t.app.request(`/v1/episodes/${EP}/comments/voice`, { method: 'POST', headers: { authorization: `Bearer ${a.token}`, 'content-type': 'audio/mp4', 'x-duration-ms': '1000' }, body: new Uint8Array([0]) });
  assert.equal(r.status, 428);
  assert.deepEqual(stored, [], 'no recording was stored');
  await t.close();
});

test('region and badge: two letters from the request (never a city); the badge from listened_ms, hidden by hide_badge', async () => {
  const { t, a, b, c } = await setup();
  await post(t, a.token, { body: 'from KL' }, { 'x-vercel-ip-country': 'my', 'x-vercel-ip-city': 'Kuala%20Lumpur' });
  await post(t, b.token, { body: 'nowhere' }, { 'x-vercel-ip-country': 'Kuala Lumpur' });
  const [row] = await t.q<{ country: string }>("SELECT country FROM comments WHERE body = 'from KL'");
  assert.equal(row!.country, 'MY');
  await t.q('UPDATE listeners SET listened_ms = $2 WHERE id = $1', [a.id, 120 * 3_600_000]);
  await t.q('UPDATE listeners SET listened_ms = $2, hide_badge = true WHERE id = $1', [b.id, 2_000 * 3_600_000]);
  const seen = await list(t, c.token);
  const kl = seen.find((x) => x.body === 'from KL')!;
  const nowhere = seen.find((x) => x.body === 'nowhere')!;
  assert.equal(kl.country, 'MY');
  assert.equal(kl.badge, 100);
  assert.equal(nowhere.country, null, 'not two letters: nothing shown');
  assert.equal(nowhere.badge, null, 'hidden by the author');
  assert.ok(!JSON.stringify(seen).includes('Kuala'), 'no city anywhere');

  assert.equal(badgeFor(0, false), null);
  assert.equal(badgeFor(99.9 * 3_600_000, false), null);
  assert.equal(badgeFor(100 * 3_600_000, false), 100);
  assert.equal(badgeFor(String(500 * 3_600_000), false), 500);
  assert.equal(badgeFor(1_000 * 3_600_000, false), 1000);
  assert.equal(badgeFor(1_000 * 3_600_000, true), null);
  await t.close();
});

test('dir=asc lists the top level oldest first; replies tab=newest lists replies newest first', async () => {
  const { t, a } = await setup();
  const ids: string[] = [];
  for (const [i, body] of ['old', 'mid', 'new'].entries()) {
    const [r] = await t.q<{ id: string }>("INSERT INTO comments (episode_id, author_id, body, created_at) VALUES ($1, $2, $3, now() - ($4 || ' minutes')::interval) RETURNING id", [EP, a.id, body, String(30 - i * 10)]);
    ids.push(r!.id);
  }
  assert.deepEqual((await list(t)).map((x) => x.body), ['new', 'mid', 'old'], 'default: newest first');
  assert.deepEqual((await list(t, undefined, '?dir=desc')).map((x) => x.body), ['new', 'mid', 'old']);
  assert.deepEqual((await list(t, undefined, '?dir=asc')).map((x) => x.body), ['old', 'mid', 'new']);
  const etag = (await t.call('GET', `/v1/episodes/${EP}/social`)).headers.get('etag')!;
  assert.equal((await t.call('GET', `/v1/episodes/${EP}/social?dir=asc`, undefined, undefined, { 'if-none-match': etag })).status, 200, 'the direction is in the ETag');

  for (const [i, body] of ['r1', 'r2', 'r3'].entries()) {
    await t.q("INSERT INTO comments (episode_id, author_id, body, parent_id, created_at) VALUES ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval)", [EP, a.id, body, ids[0], String(9 - i)]);
  }
  const thread = async (q: string) => ((await (await t.call('GET', `/v1/comments/${ids[0]}/thread${q}`)).json()) as { replies: C[] }).replies.map((r) => r.body);
  assert.deepEqual(await thread(''), ['r1', 'r2', 'r3']);
  assert.deepEqual(await thread('?tab=all'), ['r1', 'r2', 'r3']);
  assert.deepEqual(await thread('?tab=newest'), ['r3', 'r2', 'r1']);
  await t.close();
});

test('G-M21-12: listened_ms grows by the union delta — two overlapping devices count once; a shrink takes it back', async () => {
  const { t, a } = await setup();
  const total = async () => Number((await t.q<{ ms: string | number }>('SELECT listened_ms AS ms FROM listeners WHERE id = $1', [a.id]))[0]!.ms);
  const put = (deviceId: string, ranges: [number, number][], day = '2026-09-21') =>
    t.call('PUT', '/v1/me/listened', { deviceId, days: [{ episodeId: EP, day, ranges }] }, a.token);
  assert.equal(await total(), 0);
  assert.equal((await put('p1', [[0, 60_000]])).status, 200);
  assert.equal(await total(), 60_000);
  await put('p2', [[30_000, 90_000]]); // overlaps p1 by 30 s: the union is 90 s, the raw sum 120 s
  assert.equal(await total(), 90_000, 'the union, never the raw sum');
  await put('p2', [[30_000, 90_000]]); // the same report again changes nothing
  assert.equal(await total(), 90_000);
  await put('p2', [[30_000, 40_000]]); // a phone REPLACES its set: the union shrinks to 60 s
  assert.equal(await total(), 60_000);
  await put('p1', [[0, 10_000]], '2026-09-22'); // another day adds on
  assert.equal(await total(), 70_000);

  assert.equal(listenedDelta(60_000, 90_000), 30_000);
  assert.equal(listenedDelta(90_000, 60_000), -30_000);
  // Never below 0, even if the stored total was behind (before the backfill).
  await t.q('UPDATE listeners SET listened_ms = 0 WHERE id = $1', [a.id]);
  await put('p1', [], '2026-09-22');
  assert.equal(await total(), 0);
  await t.close();
});
