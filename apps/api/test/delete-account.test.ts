import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g189', title: '#189', enclosureUrl: 'https://cdn/189.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

async function post(t: TestDb, token: string, body: Record<string, unknown>) {
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  return (await (await t.call('POST', `/v1/episodes/${EP}/comments`, body, token)).json()) as { comment: { id: string } };
}

// quickstart A12 — guard G6
test('A12: deletion removes everything of the listener; only placeholders under replies remain; both sessions die; email reusable', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_899_000 });
  const b = await signUp(t, 'b@example.com', 'Bo');
  const a1 = await signUp(t, 'a@example.com', 'Alex');
  const a2 = (await (await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' })).json()) as { token: string };

  const withReply = (await post(t, a1.token, { body: 'parent', offsetMs: 872_000 })).comment.id;
  await post(t, b.token, { body: 'reply by B', parentId: withReply });
  const lone = (await post(t, a1.token, { body: 'lone', offsetMs: 100_000 })).comment.id;
  const asReply = (await post(t, a1.token, { body: "A's reply", parentId: (await post(t, b.token, { body: "B's root" })).comment.id })).comment.id;
  await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 500_000 }, a1.token);
  await t.call('PUT', '/v1/me/positions', { deviceId: 'p1', observations: [{ episodeId: EP, offsetMs: 1, finished: false, progressSeq: 1, explicitSeek: false }] }, a1.token).catch(() => undefined);
  assert.equal((await t.q('SELECT bucket FROM episode_heat WHERE episode_id = $1', [EP])).length, 3);

  assert.equal((await t.call('DELETE', '/v1/me', { password: 'wrong' }, a1.token)).status, 401);
  assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a1.token)).status, 200);

  assert.equal((await t.call('GET', '/v1/me', undefined, a1.token)).status, 401);
  assert.equal((await t.call('GET', '/v1/me', undefined, a2.token)).status, 401);

  const comments = await t.q<{ id: string; body: string | null; author_id: string | null; deleted_at: string | null }>('SELECT id, body, author_id, deleted_at FROM comments ORDER BY created_at');
  const ids = comments.map((c) => c.id);
  assert.ok(ids.includes(withReply), 'the parent with a reply stays as a placeholder');
  assert.ok(!ids.includes(lone), 'the lone comment is gone');
  assert.ok(!ids.includes(asReply), "A's reply under B's root is gone");
  const ph = comments.find((c) => c.id === withReply)!;
  assert.deepEqual([ph.body, ph.author_id], [null, null]);
  assert.ok(ph.deleted_at);

  assert.deepEqual(await t.q('SELECT * FROM reactions'), []);
  assert.deepEqual(await t.q('SELECT * FROM positions'), []);
  assert.equal((await t.q('SELECT bucket FROM episode_heat WHERE episode_id = $1', [EP])).length, 0, 'heat dropped');
  assert.equal((await t.q('SELECT email FROM listeners')).length, 1, 'only Bo remains');

  const again = await t.call('POST', '/v1/auth/sign-up', { email: 'a@example.com', password: 'new password 1', displayName: 'Alex again' });
  assert.equal(again.status, 200, 'the email is reusable');
  await t.close();
});
