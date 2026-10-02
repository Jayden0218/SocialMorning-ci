/** quickstart A6 (guard G4: the CHECK on follows). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';

test('A6: follow self → 422; follow twice → one row; unfollow never-followed → 204; lists and counts', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  const self = await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, a.token);
  assert.equal(self.status, 422);
  assert.equal(((await self.json()) as { error: string }).error, 'self_follow');
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM follows'), [{ n: 1 }]);
  assert.equal((await t.call('PUT', `/v1/listeners/00000000-0000-4000-8000-000000000000/follow`, undefined, a.token)).status, 404);
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`)).status, 401);
  const followersOfB = (await (await t.call('GET', `/v1/listeners/${b.id}/followers`)).json()) as { listeners: { id: string; displayName: string }[] };
  assert.deepEqual(followersOfB.listeners, [{ id: a.id, displayName: 'Alex' }]);
  const followingOfA = (await (await t.call('GET', `/v1/listeners/${a.id}/following`)).json()) as { listeners: { id: string }[] };
  assert.deepEqual(followingOfA.listeners.map((l) => l.id), [b.id]);
  assert.equal((await t.call('DELETE', `/v1/listeners/${a.id}/follow`, undefined, b.token)).status, 204); // never followed
  assert.equal((await t.call('DELETE', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM follows'), [{ n: 0 }]);
  // The database itself refuses a self-follow even without the route (G4).
  await assert.rejects(t.q('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $1)', [a.id]), /check/i);
  await t.close();
});

test('T033: the 61st follow in a minute is 429', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const ids: string[] = [];
  for (let i = 0; i < 61; i++) ids.push((await signUp(t, `u${i}@example.com`, `U${i}`)).id);
  for (let i = 0; i < 60; i++) assert.equal((await t.call('PUT', `/v1/listeners/${ids[i]}/follow`, undefined, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/listeners/${ids[60]}/follow`, undefined, a.token)).status, 429);
  await t.close();
});

/**
 * M16a guard G-B2, server half (FR-003): a profile's follower/following counts are the number of
 * people its lists can show the viewer. The lists leave out listeners the viewer blocked; the
 * counts did not (phone walk 2026-10-02: a count that disagreed with its own list).
 * The break that turns it red: drop `${NOT_BLOCKED_2}` from `counts` in src/db/repos/follows.ts.
 */
test('M16a G-B2: counts use the lists\' rule — a listener the viewer blocked is in neither', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cal');
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, c.token)).status, 204);
  await t.q('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [a.id, c.id]); // Alex blocked Cal
  const seen = async (viewer?: string) => {
    const p = ((await (await t.call('GET', `/v1/listeners/${b.id}`, undefined, viewer)).json()) as { profile: { followers: number } }).profile;
    const list = ((await (await t.call('GET', `/v1/listeners/${b.id}/followers`, undefined, viewer)).json()) as { listeners: { id: string }[] }).listeners;
    return { count: p.followers, list: list.length };
  };
  assert.deepEqual(await seen(a.token), { count: 1, list: 1 }); // Alex does not see Cal in either
  assert.deepEqual(await seen(undefined), { count: 2, list: 2 }); // signed out: both
  await t.close();
});
