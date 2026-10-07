// Tests that a show claim is proven only by its code in the feed.
/**
 * M10b US8 — the creator claims a feed they already publish. Guard G-C1 (only the code in the
 * live feed proves ownership) — the break that turns it red: in `src/db/repos/studio/creator.ts`
 * `verifyClaim`, drop the `text.includes(c.code)` check (any reachable feed would then prove).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { verifyClaim } from '../src/db/repos/studio/creator.ts';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';

const FEED = 'https://feeds.example.com/mine.xml';
const ep = { feedUrl: FEED, guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const feedWith = (text: string): typeof fetch => (async () => new Response(`<rss><channel><description>${text}</description></channel></rss>`)) as typeof fetch;

test('G-C1: a claim is proven only when its code is in the live feed', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const r = await t.call('POST', '/v1/creator/claims', { feedUrl: FEED }, a.token);
  assert.equal(r.status, 200);
  const claim = (await r.json()) as { id: string; code: string; status: string };
  assert.match(claim.code, /^socialnet-verify-[0-9a-f]{12}$/);
  assert.equal(claim.status, 'pending');
  // Asking again hands back the same code, not a new one.
  assert.equal(((await (await t.call('POST', '/v1/creator/claims', { feedUrl: FEED }, a.token)).json()) as { code: string }).code, claim.code);

  assert.deepEqual(await verifyClaim(t.db, feedWith('a show about cats'), a.id, claim.id), { status: 'pending' });
  assert.deepEqual(await verifyClaim(t.db, feedWith('socialnet-verify-000000000000'), a.id, claim.id), { status: 'pending' }, 'another code does not prove');
  assert.deepEqual(await verifyClaim(t.db, feedWith(`hello ${claim.code}`), a.id, claim.id), { status: 'proven' });

  // A second listener cannot prove the same feed, even with their own code in it.
  const b = await signUp(t, 'b@example.com', 'Bo');
  const cb = (await (await t.call('POST', '/v1/creator/claims', { feedUrl: FEED }, b.token)).json()) as { id: string; code: string };
  assert.equal(await verifyClaim(t.db, feedWith(cb.code), b.id, cb.id), 'taken');
  // Nobody verifies someone else's claim.
  assert.equal(await verifyClaim(t.db, feedWith(claim.code), b.id, claim.id), 'not_found');
  await t.close();
});

test('stats are for the proven claimant only; their comments carry the Host mark', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 600_000 });
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const q = `/v1/creator/shows/stats?feedUrl=${encodeURIComponent(FEED)}`;
  assert.equal((await t.call('GET', q)).status, 401);
  assert.equal((await t.call('GET', q, undefined, a.token)).status, 403, 'not proven yet');

  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'from the host', offsetMs: 61_000 }, a.token);
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'from a listener', offsetMs: 65_000 }, b.token);

  const before = (await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, b.token)).json()) as { comments: { body: string; host?: true }[] };
  assert.equal(before.comments.filter((c) => c.host).length, 0, 'no mark before the claim is proven');
  const etagBefore = (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, b.token)).headers.get('etag');

  const claim = (await (await t.call('POST', '/v1/creator/claims', { feedUrl: FEED }, a.token)).json()) as { id: string; code: string };
  assert.deepEqual(await verifyClaim(t.db, feedWith(claim.code), a.id, claim.id), { status: 'proven' });

  const res = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, b.token);
  assert.notEqual(res.headers.get('etag'), etagBefore, 'proving a claim changes the answer, so the stamp changes');
  const after = (await res.json()) as { comments: { body: string; host?: true }[] };
  assert.deepEqual(after.comments.filter((c) => c.host).map((c) => c.body), ['from the host']);

  assert.equal((await t.call('GET', q, undefined, b.token)).status, 403, 'another listener sees no stats');
  const stats = (await (await t.call('GET', q, undefined, a.token)).json()) as { comments: number; episodes: number; topMoments: { offsetMs: number; comments: number }[] };
  assert.equal(stats.comments, 2);
  assert.equal(stats.episodes, 1);
  assert.deepEqual(stats.topMoments.map((m) => [m.offsetMs, m.comments]), [[60_000, 2]]);
  await t.close();
});
