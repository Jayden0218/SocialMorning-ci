/** quickstart A4 (reports: G3, G4), A5 (blocks), A6 (the poll: G1, G2, G8). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'One', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
type Comment = { id: string; body: string | null; authorId: string | null; deleted: boolean; blocked?: boolean; removed?: boolean; mine?: boolean; replies: Comment[] };
type Social = { comments: Comment[]; heat: { available: boolean; buckets?: number[] } };

async function post(t: TestDb, token: string, body: Record<string, unknown>) {
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  const r = await t.call('POST', `/v1/episodes/${EP}/comments`, body, token);
  return { status: r.status, comment: ((await r.json()) as { comment: Comment }).comment };
}
async function social(t: TestDb, token?: string): Promise<{ status: number; etag: string; body: Social }> {
  const r = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, token);
  return { status: r.status, etag: r.headers.get('etag') ?? '', body: (await r.json()) as Social };
}
const ids = (cs: Comment[]) => cs.map((c) => c.id);

test('A4: a report hides the target for the reporter at once, keeps a copy (G4), and a repeat is one row (G3); own content and the 21st in an hour are refused; a gone target closes at once', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c1 = (await post(t, a.token, { body: 'rude thing', offsetMs: 1000, durationMs: 60_000 })).comment;

  const r1 = await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'harassment', note: 'see it' }, b.token);
  assert.equal(r1.status, 201);
  const j1 = (await r1.json()) as { id: string; duplicate: boolean };
  assert.equal(j1.duplicate, false);
  const asB = await social(t, b.token);
  assert.deepEqual(ids(asB.body.comments), [], 'hidden for the reporter');
  const asA = await social(t, a.token);
  assert.deepEqual(ids(asA.body.comments), [c1.id], 'still there for everyone else');
  const anon = await social(t);
  assert.deepEqual(ids(anon.body.comments), [c1.id]);

  // G3: the same reporter again → duplicate, one row
  const r2 = await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'spam' }, b.token);
  assert.equal(r2.status, 200);
  assert.equal(((await r2.json()) as { duplicate: boolean }).duplicate, true);
  const rows = await t.q<{ reason: string; snapshot: { body: string; authorName: string } }>('SELECT reason, snapshot FROM reports');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.reason, 'harassment', 'the first reason stands');
  // G4: the copy
  assert.equal(rows[0]!.snapshot.body, 'rude thing');
  assert.equal(rows[0]!.snapshot.authorName, 'Al');

  // own content → refused
  const own = await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'spam' }, a.token);
  assert.equal(own.status, 422);
  assert.equal(((await own.json()) as { reason: string }).reason, 'own');
  const ownProfile = await t.call('POST', '/v1/reports', { targetKind: 'profile', targetId: a.id, reason: 'spam' }, a.token);
  assert.equal(ownProfile.status, 422);

  // signed out → 401; bad reason → 422; a show needs no id shape
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'spam' })).status, 401);
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'meh' }, b.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'clip', targetId: 'not-an-id', reason: 'spam' }, b.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'show', targetId: ep.feedUrl, reason: 'illegal' }, b.token)).status, 201);

  // a target already gone → accepted and closed at once
  const c2 = (await post(t, a.token, { body: 'gone soon' })).comment;
  await t.call('DELETE', `/v1/comments/${c2.id}`, undefined, a.token);
  const gone = await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c2.id, reason: 'spam' }, b.token);
  assert.equal(gone.status, 201);
  assert.equal(((await gone.json()) as { closed?: string }).closed, 'already_gone');
  const [closed] = await t.q<{ close_reason: string; closed_at: string | null }>('SELECT close_reason, closed_at FROM reports WHERE target_id = $1', [c2.id]);
  assert.equal(closed!.close_reason, 'already_gone');
  assert.ok(closed!.closed_at);

  // the 21st report in an hour → 429 (3 so far: c1, the show, c2)
  for (let i = 3; i < 20; i++) assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'show', targetId: `https://feeds.example.com/${i}.xml`, reason: 'spam' }, b.token)).status, 201);
  const over = await t.call('POST', '/v1/reports', { targetKind: 'show', targetId: 'https://feeds.example.com/last.xml', reason: 'spam' }, b.token);
  assert.equal(over.status, 429);

  // GET /v1/me/hidden refills a phone
  const h = (await (await t.call('GET', '/v1/me/hidden', undefined, b.token)).json()) as { reported: { kind: string; id: string }[]; blocked: unknown[]; hiddenFeeds: string[] };
  assert.ok(h.reported.some((x) => x.kind === 'comment' && x.id === c1.id));
  assert.equal(h.reported.length, 20);
  assert.deepEqual(h.blocked, []);
  assert.deepEqual(h.hiddenFeeds, []);
  await t.close();
});

test('A5 + A6: a block hides the blocked listener\'s comments (G1) and turns their reply into a placeholder (G2), removes follows both ways, refuses follow and reply (403 blocked), is one-way, changes the ETag, leaves the heat identical (G8); unblock restores content, not the follow', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const s = await signUp(t, 's@example.com', 'Stranger');
  // follows both ways; A comments, B comments, A replies to B, A reacts
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token)).status, 204);
  const aTop = (await post(t, a.token, { body: 'A top', offsetMs: 5000, durationMs: 60_000 })).comment;
  const bTop = (await post(t, b.token, { body: 'B top', offsetMs: 6000 })).comment;
  const aReply = (await post(t, a.token, { body: 'A reply', parentId: bTop.id })).comment;
  assert.equal((await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 5000 }, a.token)).status, 200);

  const before = await social(t, b.token);
  assert.deepEqual(ids(before.body.comments), [bTop.id, aTop.id]);
  const heatStranger = (await social(t, s.token)).body.heat;

  // B blocks A
  const blk = await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, b.token);
  assert.equal(blk.status, 201);
  const after = await social(t, b.token);
  assert.notEqual(after.etag, before.etag, 'the block is in the ETag');
  assert.deepEqual(ids(after.body.comments), [bTop.id], 'G1: A\'s top comment gone for B');
  const reply = after.body.comments[0]!.replies[0]!;
  assert.equal(reply.id, aReply.id);
  assert.equal(reply.blocked, true, 'G2: A\'s reply under B\'s comment is a placeholder');
  assert.equal(reply.body, null);
  assert.equal(reply.authorId, null);
  // G8: aggregates shared — the heat B sees equals the stranger's
  assert.deepEqual(after.body.heat, heatStranger);
  // one-way: A still sees B
  assert.deepEqual(ids((await social(t, a.token)).body.comments), [bTop.id, aTop.id]);
  // follows gone both ways
  const follows = await t.q('SELECT 1 FROM follows');
  assert.equal(follows.length, 0);
  // A cannot follow B or reply to B; B's profile to A is bare; A's profile to B says blockedByMe
  const f = await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  assert.equal(f.status, 403);
  assert.equal(((await f.json()) as { error: string }).error, 'blocked');
  const r = await post(t, a.token, { body: 'again', parentId: bTop.id });
  assert.equal(r.status, 403);
  const bToA = (await (await t.call('GET', `/v1/listeners/${b.id}`, undefined, a.token)).json()) as { profile: Record<string, unknown> };
  assert.equal(bToA.profile['displayName'], 'Bea');
  assert.equal(bToA.profile['followers'], 0);
  assert.deepEqual(bToA.profile['recent'], []);
  assert.equal(bToA.profile['blockedByMe'], undefined, 'A is not told');
  const aToB = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as { profile: Record<string, unknown> };
  assert.equal(aToB.profile['blockedByMe'], true);
  // the feed and lists exclude A for B
  assert.equal((await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, s.token)).status, 204);
  const followersOfA = (await (await t.call('GET', `/v1/listeners/${a.id}/followers`, undefined, b.token)).json()) as { listeners: { id: string }[] };
  assert.deepEqual(followersOfA.listeners.map((l) => l.id), [s.id]);
  const list = (await (await t.call('GET', '/v1/me/blocks', undefined, b.token)).json()) as { blocks: { id: string; displayName: string }[] };
  assert.deepEqual(list.blocks.map((x) => x.displayName), ['Al']);
  // self / owner / signed-out
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: b.id }, b.token)).status, 422);
  t.setOwner!(s.id);
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: s.id }, b.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: a.id })).status, 401);
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: '00000000-0000-4000-8000-000000000000' }, b.token)).status, 404);

  // unblock: content returns, the follow does not
  assert.equal((await t.call('DELETE', `/v1/me/blocks/${a.id}`, undefined, b.token)).status, 200);
  const restored = await social(t, b.token);
  assert.deepEqual(ids(restored.body.comments), [bTop.id, aTop.id]);
  assert.equal(restored.body.comments[0]!.replies[0]!.body, 'A reply');
  assert.equal((await t.q('SELECT 1 FROM follows WHERE follower_id = $1', [a.id])).length, 0);
  assert.equal((await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token)).status, 204, 'allowed again');
  await t.close();
});

test('A5: clips and the feed exclude a blocked author; a reported clip is hidden for the reporter', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 600_000 });
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token);
  const mk = async (clientId: string, caption: string) => ((await (await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId, startMs: 1000, endMs: 20_000, caption }, a.token)).json()) as { clip: { id: string } }).clip.id;
  const k1 = await mk('c1', 'first');
  const k2 = await mk('c2', 'second');
  const clipsFor = async (token?: string) => ((await (await t.call('GET', `/v1/episodes/${EP}/clips`, undefined, token)).json()) as { clips: { id: string }[] }).clips.map((c) => c.id);
  assert.deepEqual(await clipsFor(b.token), [k2, k1]);
  await t.call('POST', '/v1/reports', { targetKind: 'clip', targetId: k1, reason: 'spam' }, b.token);
  assert.deepEqual(await clipsFor(b.token), [k2], 'the reported clip is hidden for B');
  assert.deepEqual(await clipsFor(), [k2, k1], 'and visible to a stranger');
  const feedBefore = (await (await t.call('GET', '/v1/me/feed', undefined, b.token)).json()) as { items: unknown[] };
  assert.equal(feedBefore.items.length, 2);
  await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, b.token);
  assert.deepEqual(await clipsFor(b.token), []);
  const feedAfter = (await (await t.call('GET', '/v1/me/feed', undefined, b.token)).json()) as { items: unknown[] };
  assert.equal(feedAfter.items.length, 0, 'the block also removed the follow; nothing to show');
  await t.close();
});
