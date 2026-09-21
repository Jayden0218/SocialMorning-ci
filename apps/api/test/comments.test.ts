import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g189', title: '#189', enclosureUrl: 'https://cdn/189.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

async function setup(t: TestDb) {
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_899_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  return { a, b };
}

async function post(t: TestDb, token: string, body: Record<string, unknown>) {
  // The rate floor is per listener; tests back-date the previous comment instead of sleeping.
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  return t.call('POST', `/v1/episodes/${EP}/comments`, body, token);
}

test('posting needs auth, an existing episode, and a body of 1–2000 chars; the moment is optional', async () => {
  const t = await freshDb();
  const { a } = await setup(t);
  assert.equal((await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hi' })).status, 401);
  assert.equal((await t.call('POST', `/v1/episodes/0000000000000000/comments`, { body: 'hi' }, a.token)).status, 404);
  assert.equal((await post(t, a.token, { body: '   ' })).status, 422);
  assert.equal((await post(t, a.token, { body: 'x'.repeat(2001) })).status, 422);
  const timed = await post(t, a.token, { body: 'at 14:32', offsetMs: 872_000 });
  assert.equal(timed.status, 200);
  const c = ((await timed.json()) as { comment: { offsetMs: number; mine: boolean; displayName: string } }).comment;
  assert.deepEqual([c.offsetMs, c.mine, c.displayName], [872_000, true, 'Alex']);
  const plain = await post(t, a.token, { body: 'no moment' });
  assert.equal(((await plain.json()) as { comment: { offsetMs: number | null } }).comment.offsetMs, null);
  await t.close();
});

test('a second comment within 5 s is 429 with retryAfterSeconds', async () => {
  const t = await freshDb();
  const { a } = await setup(t);
  assert.equal((await post(t, a.token, { body: 'one' })).status, 200);
  const second = await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'two' }, a.token);
  assert.equal(second.status, 429);
  assert.equal(((await second.json()) as { retryAfterSeconds: number }).retryAfterSeconds, 5);
  await t.close();
});

// quickstart A15
test('a reply to a reply is 422 reply_depth; a reply on another episode\'s comment is 404', async () => {
  const t = await freshDb();
  const { a, b } = await setup(t);
  const root = ((await (await post(t, a.token, { body: 'root' })).json()) as { comment: { id: string } }).comment.id;
  const reply = await post(t, b.token, { body: 'reply', parentId: root });
  assert.equal(reply.status, 200);
  const replyId = ((await reply.json()) as { comment: { id: string; parentId: string } }).comment;
  assert.equal(replyId.parentId, root);
  const deeper = await post(t, a.token, { body: 'deeper', parentId: replyId.id });
  assert.equal(deeper.status, 422);
  assert.equal(((await deeper.json()) as { error: string }).error, 'reply_depth');
  await t.close();
});

// quickstart A11
test('delete: without replies the row is gone; with replies a placeholder stays; only the author may', async () => {
  const t = await freshDb();
  const { a, b } = await setup(t);
  const lone = ((await (await post(t, a.token, { body: 'lone', offsetMs: 1000 })).json()) as { comment: { id: string } }).comment.id;
  const parent = ((await (await post(t, a.token, { body: 'parent', offsetMs: 2000 })).json()) as { comment: { id: string } }).comment.id;
  await post(t, b.token, { body: 'reply', parentId: parent });

  assert.equal((await t.call('DELETE', `/v1/comments/${lone}`, undefined, b.token)).status, 403);

  const r1 = await t.call('DELETE', `/v1/comments/${lone}`, undefined, a.token);
  assert.deepEqual(await r1.json(), { placeholder: false });
  const r2 = await t.call('DELETE', `/v1/comments/${parent}`, undefined, a.token);
  assert.deepEqual(await r2.json(), { placeholder: true });

  const rows = await t.q<{ id: string; body: string | null; author_id: string | null; offset_ms: number | null; deleted_at: string | null }>(
    'SELECT id, body, author_id, offset_ms, deleted_at FROM comments ORDER BY created_at',
  );
  assert.equal(rows.length, 2, 'placeholder + reply');
  const ph = rows.find((r) => r.id === parent)!;
  assert.deepEqual([ph.body, ph.author_id, ph.offset_ms], [null, null, null]);
  assert.ok(ph.deleted_at);
  assert.equal((await t.call('DELETE', `/v1/comments/${parent}`, undefined, a.token)).status, 404, 'a placeholder cannot be deleted again');
  await t.close();
});

test('heat: a timestamped comment lands in its bucket; deleting it removes it', async () => {
  const t = await freshDb();
  const { a } = await setup(t);
  const id = ((await (await post(t, a.token, { body: 'at 14:32', offsetMs: 872_000 })).json()) as { comment: { id: string } }).comment.id;
  const heat = await t.q<{ bucket: number; distinct_listeners: number }>('SELECT bucket, distinct_listeners FROM episode_heat WHERE episode_id = $1', [EP]);
  assert.deepEqual(heat, [{ bucket: Math.floor(872_000 * 100 / 2_899_000), distinct_listeners: 1 }]);
  await t.call('DELETE', `/v1/comments/${id}`, undefined, a.token);
  assert.deepEqual(await t.q('SELECT bucket FROM episode_heat WHERE episode_id = $1', [EP]), []);
  await t.close();
});
