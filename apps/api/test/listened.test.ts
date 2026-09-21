/** quickstart A8: the same ranges from two devices count once (G3, server side); one listened item per day (G6). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const put = (t: TestDb, token: string, deviceId: string, ranges: [number, number][], episodeId = EP, day = '2026-09-21') =>
  t.call('PUT', '/v1/me/listened', { deviceId, days: [{ episodeId, day, ranges }] }, token);
const statsOf = async (t: TestDb, id: string, token?: string) => ((await (await t.call('GET', `/v1/listeners/${id}`, undefined, token)).json()) as { profile: { stats: { all: { listenedMs: number; finished: number; topShows: { feedUrl: string }[] } } | null } }).profile.stats;

test('A8: [0,60s] from phone 1 and [30s,90s] from phone 2 → 90 s, not 120 s; the same report twice changes nothing', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  assert.equal((await put(t, a.token, 'p1', [[0, 60_000]])).status, 200);
  assert.equal((await put(t, a.token, 'p2', [[30_000, 90_000]])).status, 200);
  assert.equal((await statsOf(t, a.id))!.all.listenedMs, 90_000);
  await put(t, a.token, 'p2', [[30_000, 90_000]]);
  assert.equal((await statsOf(t, a.id))!.all.listenedMs, 90_000);
  assert.deepEqual((await statsOf(t, a.id))!.all.topShows.map((s) => s.feedUrl), [ep.feedUrl]);
  // A phone's report REPLACES its own set: shrinking it is honoured.
  await put(t, a.token, 'p2', [[30_000, 40_000]]);
  assert.equal((await statsOf(t, a.id))!.all.listenedMs, 60_000);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM listened_ranges'), [{ n: 2 }]);
  await t.close();
});

test('A8: one listened item per (episode, day) — written when the union first crosses 5 min, never again; finishing writes it early', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const items = () => t.q<{ kind: string; day: string }>(`SELECT kind, day::text AS day FROM activity ORDER BY id`);
  await put(t, a.token, 'p1', [[0, 299_000]]);
  assert.deepEqual(await items(), []);
  await put(t, a.token, 'p1', [[0, 300_000]]);
  assert.deepEqual(await items(), [{ kind: 'listened', day: '2026-09-21' }]);
  await put(t, a.token, 'p2', [[0, 900_000]]); // more on another phone: still one item
  assert.deepEqual(await items(), [{ kind: 'listened', day: '2026-09-21' }]);
  await put(t, a.token, 'p1', [[0, 10_000]], EP, '2026-09-22'); // a new day, 10 s: not yet
  assert.equal((await items()).length, 1);
  await t.call('PUT', '/v1/me/positions', { deviceId: 'p1', observations: [{ episodeId: EP, offsetMs: 2_000_000, finished: true, progressSeq: 1, explicitSeek: false }] }, a.token);
  await put(t, a.token, 'p1', [[0, 11_000]], EP, '2026-09-22'); // finished now: the day's item is due
  assert.deepEqual(await items(), [{ kind: 'listened', day: '2026-09-21' }, { kind: 'listened', day: '2026-09-22' }]);
  assert.equal((await statsOf(t, a.id))!.all.finished, 1);
  // The database enforces it too (G6).
  await assert.rejects(t.q(`INSERT INTO activity (actor_id, kind, episode_id, day) VALUES ($1, 'listened', $2, '2026-09-21')`, [a.id, EP]), /unique|duplicate/i);
  await t.close();
});

test('A8: validation — inverted ranges, a bad day, no auth', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  assert.equal((await put(t, a.token, 'p1', [[10, 5]])).status, 422);
  assert.equal((await t.call('PUT', '/v1/me/listened', { deviceId: 'p1', days: [{ episodeId: EP, day: 'yesterday', ranges: [] }] }, a.token)).status, 422);
  assert.equal((await t.call('PUT', '/v1/me/listened', { deviceId: 'p1', days: [] })).status, 401);
  // An unregistered episode's time still counts (no FK), but no activity row can point at it.
  assert.equal((await put(t, a.token, 'p1', [[0, 400_000]], 'unregistered')).status, 200);
  assert.equal((await statsOf(t, a.id))!.all.listenedMs, 400_000);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM activity'), [{ n: 0 }]);
  await t.close();
});
