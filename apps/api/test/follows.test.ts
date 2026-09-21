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
