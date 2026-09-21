import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g189', title: '#189', enclosureUrl: 'https://cdn/189.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

async function post(t: TestDb, token: string, body: Record<string, unknown>) {
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  return t.call('POST', `/v1/episodes/${EP}/comments`, body, token);
}

type Social = {
  serverTime: string; episode: { id: string; durationMs: number | null };
  comments: { id: string; body: string | null; offsetMs: number | null; mine?: boolean; replies: { id: string; body: string | null }[] }[];
  heat: { available: boolean; buckets?: number[] }; myReactionBuckets?: number[];
};

// quickstart A17
test('the poll: public, ETag → 304 the second time, 200 again after a write, viewer-specific fields', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep); // no duration yet
  const a = await signUp(t, 'a@example.com', 'Alex');

  const first = await t.call('GET', `/v1/episodes/${EP}/social`);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag')!;
  assert.match(etag, /^"[A-Za-z0-9_-]{27}"$/);
  const body1 = (await first.json()) as Social;
  assert.deepEqual(body1.comments, []);
  assert.deepEqual(body1.heat, { available: false });
  assert.equal(body1.myReactionBuckets, undefined, 'anonymous: no viewer fields');
  assert.equal(body1.episode.durationMs, null);

  const second = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, undefined, { 'if-none-match': etag });
  assert.equal(second.status, 304);

  await post(t, a.token, { body: 'at 14:32', offsetMs: 872_000, durationMs: 2_899_000 });
  const third = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, undefined, { 'if-none-match': etag });
  assert.equal(third.status, 200, 'a write changes the ETag');
  const body3 = (await third.json()) as Social;
  assert.equal(body3.comments.length, 1);
  assert.equal(body3.episode.durationMs, 2_899_000, 'the comment carried the duration');
  assert.equal(body3.heat.available, true);
  assert.equal(body3.heat.buckets!.length, 100);
  assert.equal(body3.heat.buckets![30], 1, 'the one mark normalises to 1');
  assert.equal(body3.heat.buckets!.filter((v) => v > 0).length, 1);

  const asA = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, a.token);
  const bodyA = (await asA.json()) as Social;
  assert.equal(bodyA.comments[0]!.mine, true);
  assert.deepEqual(bodyA.myReactionBuckets, []);
  assert.notEqual(asA.headers.get('etag'), third.headers.get('etag'), 'the ETag differs per viewer');

  assert.equal((await t.call('GET', '/v1/episodes/0000000000000000/social')).status, 404);
  await t.close();
});

test('comments come newest first with replies oldest first; a placeholder is shaped as the contract says', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 100_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const c1 = ((await (await post(t, a.token, { body: 'first', offsetMs: 1000 })).json()) as { comment: { id: string } }).comment.id;
  const c2 = ((await (await post(t, a.token, { body: 'second' })).json()) as { comment: { id: string } }).comment.id;
  await post(t, b.token, { body: 'reply 1', parentId: c1 });
  await post(t, b.token, { body: 'reply 2', parentId: c1 });
  await t.call('DELETE', `/v1/comments/${c1}`, undefined, a.token);

  const body = (await (await t.call('GET', `/v1/episodes/${EP}/social`)).json()) as Social & { comments: { deleted: boolean; displayName: string | null; authorId: string | null; replies: { body: string }[] }[] };
  assert.deepEqual(body.comments.map((c) => c.id), [c2, c1], 'newest first');
  const ph = body.comments[1]!;
  assert.deepEqual([ph.deleted, ph.body, ph.offsetMs, ph.displayName, ph.authorId], [true, null, null, null, null]);
  assert.deepEqual(ph.replies.map((r) => r.body), ['reply 1', 'reply 2'], 'replies oldest first');
  assert.deepEqual(body.heat.buckets!.filter((v) => v > 0), [], 'the placeholder carries no heat');
  await t.close();
});
