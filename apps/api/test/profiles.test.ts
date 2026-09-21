/** quickstart A7 (privacy half, guard G5) and the profile shape. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
type Prof = { id: string; displayName: string; followers: number; following: number; isFollowing: boolean; stats: { last7: { listenedMs: number } } | null; recent: { kind: string }[] };

test('A7: B private → A sees B\'s clip and comment but 0 listens in the feed and no stats on the profile; B sees own stats; switching back hides nothing retroactively and shows nothing retroactively', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  // Public first: a 6-minute listen is an item.
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pb', days: [{ episodeId: EP, day: '2026-09-20', ranges: [[0, 360_000]] }] }, b.token);
  const feedKinds = async () => ((await (await t.call('GET', '/v1/me/feed', undefined, a.token)).json()) as { items: { kind: string }[] }).items.map((i) => i.kind);
  assert.deepEqual(await feedKinds(), ['listened']);
  // B goes private.
  assert.deepEqual(await (await t.call('PUT', '/v1/me/privacy', { privateListening: true }, b.token)).json(), { privateListening: true });
  assert.equal(((await (await t.call('GET', '/v1/me', undefined, b.token)).json()) as { listener: { privateListening: boolean } }).listener.privateListening, true);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pb', days: [{ episodeId: EP, day: '2026-09-21', ranges: [[0, 360_000]] }] }, b.token);
  await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'k', startMs: 0, endMs: 30_000 }, b.token);
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hi', offsetMs: 5 }, b.token);
  const kinds = await feedKinds();
  assert.deepEqual(kinds.filter((k) => k === 'listened'), ['listened'], 'the pre-private listen stays; the private-time one never shows');
  assert.ok(kinds.includes('clipped') && kinds.includes('commented'));
  const seenByA = ((await (await t.call('GET', `/v1/listeners/${b.id}`, undefined, a.token)).json()) as { profile: Prof }).profile;
  assert.equal(seenByA.stats, null);
  assert.equal(seenByA.isFollowing, true);
  assert.equal(seenByA.followers, 1);
  assert.deepEqual(seenByA.recent.map((r) => r.kind).filter((k) => k === 'listened'), ['listened']);
  const seenByB = ((await (await t.call('GET', `/v1/listeners/${b.id}`, undefined, b.token)).json()) as { profile: Prof }).profile;
  assert.equal(seenByB.stats!.last7.listenedMs, 720_000);
  assert.equal(seenByB.isFollowing, false);
  // Back to public: the private-time listen stays hidden (written hidden); new ones flow.
  await t.call('PUT', '/v1/me/privacy', { privateListening: false }, b.token);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pb', days: [{ episodeId: EP, day: '2026-09-22', ranges: [[0, 360_000]] }] }, b.token);
  assert.equal((await feedKinds()).filter((k) => k === 'listened').length, 2);
  assert.deepEqual(await t.q(`SELECT count(*)::int AS n FROM activity WHERE kind = 'listened' AND hidden`), [{ n: 1 }]);
  // Anonymous: the profile is public, stats visible again, isFollowing false.
  const anon = ((await (await t.call('GET', `/v1/listeners/${b.id}`)).json()) as { profile: Prof }).profile;
  assert.equal(anon.stats!.last7.listenedMs, 1_080_000);
  assert.equal(anon.isFollowing, false);
  assert.equal((await t.call('GET', `/v1/listeners/00000000-0000-4000-8000-000000000000`)).status, 404);
  await t.close();
});
