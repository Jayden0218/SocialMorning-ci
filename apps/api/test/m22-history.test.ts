// Tests deleting listening history: the chosen positions go, listening totals stay.
/**
 * M22 US8 (contracts/api.md "History"), guard G-M22-14: DELETE /v1/me/history removes
 * `positions` rows only — `listened_ranges`, `listeners.listened_ms` and the listening page's
 * totals are unchanged. The break that turns it red: also delete the listener's
 * `listened_ranges` rows in the route (apps/api/src/routes/library/listened.ts, `history.delete`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { countListenedRanges } from './lb-seed.ts';

const FEED = 'https://feeds.example.com/h.xml';
const epBody = (guid: string) => ({ feedUrl: FEED, guid, title: `Ep ${guid}`, showTitle: 'Show', enclosureUrl: `https://cdn/${guid}.mp3`, durationMs: 2_000_000 });
const ID = (guid: string) => fnv1a64(FEED + '\u0001' + guid);
const [E1, E2, E3] = [ID('g1'), ID('g2'), ID('g3')] as [string, string, string];

const obs = (episodeId: string, seq: number) => ({ episodeId, offsetMs: 120_000, finished: false, progressSeq: seq, explicitSeek: false });
const positionIds = async (t: TestDb, token: string) =>
  ((await (await t.call('GET', '/v1/me/positions', undefined, token)).json()) as { positions: { episodeId: string }[] }).positions.map((p) => p.episodeId).sort();

async function seed(t: TestDb, token: string) {
  for (const g of ['g1', 'g2', 'g3']) await putEpisode(t, `${ID(g)}`, epBody(g));
  const put = await t.call('PUT', '/v1/me/positions', { deviceId: 'p1', observations: [obs(E1, 1), obs(E2, 1), obs(E3, 1)] }, token);
  assert.equal(put.status, 200);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'p1', days: [
    { episodeId: E1, day: '2026-10-01', ranges: [[0, 600_000]] },
    { episodeId: E2, day: '2026-10-01', ranges: [[0, 300_000]] },
  ] }, token);
}

test('delete chosen episodes: only those positions go; another listener is untouched', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await seed(t, a.token);
  await seed(t, b.token);
  const all = [E1, E2, E3].sort();
  assert.deepEqual(await positionIds(t, a.token), all);
  const r = await t.call('DELETE', '/v1/me/history', { episodeIds: [E1, E3, 'unknown'] }, a.token);
  assert.equal(r.status, 204);
  assert.deepEqual(await positionIds(t, a.token), [E2]);
  assert.deepEqual(await positionIds(t, b.token), all);
  await t.close();
});

test('G-M22-14: clear all empties history and keeps listening totals', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  await seed(t, a.token);
  const totalsBefore = await t.q<{ ms: string }>('SELECT listened_ms::text AS ms FROM listeners WHERE id = $1', [a.id]);
  const rangesBefore = await countListenedRanges(t, a.id);
  const pageBefore = await (await t.call('GET', '/v1/me/listening?range=all', undefined, a.token)).json();
  assert.equal(rangesBefore, 2);
  assert.equal((await t.call('DELETE', '/v1/me/history', { all: true }, a.token)).status, 204);
  assert.deepEqual(await positionIds(t, a.token), []);
  assert.deepEqual(await t.q('SELECT listened_ms::text AS ms FROM listeners WHERE id = $1', [a.id]), totalsBefore);
  assert.equal(await countListenedRanges(t, a.id), rangesBefore);
  assert.deepEqual(await (await t.call('GET', '/v1/me/listening?range=all', undefined, a.token)).json(), pageBefore);
  await t.close();
});

test('validation: 0 or 101 ids, all:false, both shapes at once, no sign-in', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const del = (body: unknown, token?: string) => t.call('DELETE', '/v1/me/history', body, token);
  assert.equal((await del({ episodeIds: [] }, a.token)).status, 422);
  assert.equal((await del({ episodeIds: Array.from({ length: 101 }, (_, i) => `e${i}`) }, a.token)).status, 422);
  assert.equal((await del({ all: false }, a.token)).status, 422);
  assert.equal((await del({ all: true, episodeIds: ['e1'] }, a.token)).status, 422);
  assert.equal((await del({ episodeIds: Array.from({ length: 100 }, (_, i) => `e${i}`) }, a.token)).status, 204);
  assert.equal((await del({ all: true })).status, 401);
  await t.close();
});
