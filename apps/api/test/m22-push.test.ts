// Tests M22 pushes for interactions: one per kind with its place to open, likes grouped, blocks, mutes and switches.
/**
 * M22 US1, US3, US6 (specs/023-m22-the-xiaoyuzhou-gaps-2, T011, T012, T014, T025). Expo is faked
 * through `createApp`'s `pushFetch`; every message the server would send lands in `sent`.
 * The rule itself (`shouldPush`) is guarded in packages/social-core (G-M22-1, G-M22-4); this file
 * proves the server wires it to the acts that happen: a follow, a comment like, a reply, a
 * mention, a like-post comment and reaction, and a new status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { backdateComments, expireStatuses } from './sc-neutral.ts';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { pushFor } from '../src/db/repos/account/push.ts';

type Msg = { to: string; title: string; body: string; data: Record<string, string>; channelId?: string; tag?: string };

const ep = { feedUrl: 'https://feeds.example.com/p.xml', guid: 'p1', title: 'Ep P', showTitle: 'Show', enclosureUrl: 'https://cdn/p.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbb]';

async function setup() {
  const sent: Msg[] = [];
  const pushFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as Msg[];
    sent.push(...batch);
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok', id: 'x' })) }), { status: 200 });
  }) as typeof fetch;
  const t = await freshDb({ pushFetch });
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cy');
  assert.equal((await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_A, platform: 'android' }, a.token)).status, 204);
  return { t, sent, a, b, c };
}

/** Posts a comment; the 5 s rate floor is stepped over by ageing the author's earlier comments. */
async function comment(t: TestDb, who: { id: string; token: string }, body: string, parentId?: string): Promise<string> {
  await backdateComments(t, 60_000, { authorId: who.id });
  const res = await t.call('POST', `/v1/episodes/${EP}/comments`, { body, ...(parentId ? { parentId } : {}) }, who.token);
  assert.equal(res.status, 200, await res.clone().text());
  return ((await res.json()) as { comment: { id: string } }).comment.id;
}

test('T011/T014: a follow, a like, a reply, a mention and a like-post comment and reaction each push once, with the place to open', async () => {
  const { t, sent, a, b, c } = await setup();
  assert.equal((await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token)).status, 204);
  const mine = await comment(t, a, 'Alex on the episode');
  assert.equal((await t.call('PUT', `/v1/comments/${mine}/like`, undefined, b.token)).status, 200);
  const reply = await comment(t, b, 'Bea answers', mine);
  await comment(t, c, 'Hey @alex look');
  assert.equal(sent.length, 4, JSON.stringify(sent.map((m) => m.title)));
  assert.deepEqual(sent.map((m) => [m.to, m.title, m.data['kind'], m.channelId]), [
    [TOKEN_A, 'Bea followed you', 'follow', 'social'],
    [TOKEN_A, 'Bea liked your comment', 'like', 'social'],
    [TOKEN_A, 'Bea replied', 'reply', 'social'],
    [TOKEN_A, 'Cy mentioned you', 'mention', 'social'],
  ]);
  assert.equal(sent[0]!.data['href'], `/profile/${b.id}`);
  assert.equal(sent[1]!.data['href'], `/comments/thread/${mine}`);
  assert.equal(sent[2]!.data['href'], `/comments/thread/${mine}`, 'a reply opens the thread of its parent');
  assert.equal(sent[2]!.body, 'Bea answers');
  assert.ok(reply);

  // US3 (FR-013): A's like-post gets a comment and a reaction from Bea.
  assert.equal((await t.call('PUT', `/v1/episodes/${EP}/like`, { note: 'Loved it' }, a.token)).status, 200);
  assert.equal((await t.call('POST', `/v1/likes/${a.id}/${EP}/comments`, { body: 'Same here' }, b.token)).status, 201);
  assert.equal((await t.call('PUT', `/v1/likes/${a.id}/${EP}/reactions`, { emoji: '👍' }, b.token)).status, 204);
  assert.deepEqual(sent.slice(4).map((m) => [m.title, m.data['kind'], m.data['href']]), [
    ['Bea commented on your like', 'like_post_comment', `/like/${a.id}/${EP}`],
    ['Bea reacted to your like', 'like_post_like', `/like/${a.id}/${EP}`],
  ]);
  const notices = (await (await t.call('GET', '/v1/me/notifications', undefined, a.token)).json()) as { items: { kind: string; ref: Record<string, string> }[] };
  assert.deepEqual(notices.items.slice(0, 2).map((n) => n.kind), ['like_post_like', 'like_post_comment'], 'both are Interactions notices too');

  // Own acts never push: A comments on A's own like-post.
  const before = sent.length;
  assert.equal((await t.call('POST', `/v1/likes/${a.id}/${EP}/comments`, { body: 'Thanks' }, a.token)).status, 201);
  assert.equal(sent.length, before);
  await t.close();
});

test('T012 (G-M22-4 wired): 20 likes on one comment in 10 minutes are one grouped push "… and 19 others"', async () => {
  const { t, sent, a } = await setup();
  const mine = await comment(t, a, 'A popular take');
  for (let i = 0; i < 20; i++) {
    const who = await signUp(t, `l${i}@example.com`, `Liker ${i}`);
    assert.equal((await t.call('PUT', `/v1/comments/${mine}/like`, undefined, who.token)).status, 200);
  }
  const likes = sent.filter((m) => m.data['kind'] === 'like');
  assert.equal(likes.length, 20, 'each like updates the one notification');
  assert.equal(new Set(likes.map((m) => m.tag)).size, 1, 'one tag: each later push replaces the earlier one on the phone');
  assert.equal(likes[0]!.title, 'Liker 0 liked your comment');
  assert.equal(likes[19]!.title, 'Liker 19 and 19 others liked your comment');
  await t.close();
});

test('T012 (G-M22-1 wired): nothing from a blocked or muted person, nor with the switch off; a muted thread is silent', async () => {
  const { t, sent, a, b, c } = await setup();
  // Mute: Bea's follow writes no notice and no push.
  assert.equal((await t.call('PUT', `/v1/me/mutes/${b.id}`, undefined, a.token)).status, 204);
  await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, b.token);
  assert.equal(sent.length, 0, 'muted → no push');

  // Block: pushFor itself refuses, even if a notice were written.
  await t.q('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [a.id, c.id]);
  assert.equal(await pushFor(t.db, { recipientId: a.id, actorId: c.id, kind: 'follow', ref: {} }), 0);
  assert.equal(sent.length, 0, 'blocked → no push');
  await t.q('DELETE FROM blocks');

  // Switch off: "New followers" off → Cy's follow is a notice but no push.
  assert.equal((await t.call('PUT', '/v1/me/push-prefs', { follows: false }, a.token)).status, 204);
  await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, c.token);
  assert.equal(sent.length, 0, 'follows off → no push');
  const prefs = (await (await t.call('GET', '/v1/me/push-prefs', undefined, a.token)).json()) as Record<string, boolean>;
  assert.equal(prefs['follows'], false);
  assert.equal(prefs['replies'], true);

  // A muted thread (US3): replies in it make no notice and no push.
  const mine = await comment(t, a, 'Thread to mute');
  assert.equal((await t.call('PUT', '/v1/me/muted-threads', { threadKind: 'comment', threadKey: mine }, a.token)).status, 204);
  await comment(t, c, 'A reply nobody hears', mine);
  assert.equal(sent.length, 0, 'muted thread → no push');
  const muted = (await (await t.call('GET', '/v1/me/muted-threads', undefined, a.token)).json()) as { items: { threadKind: string; threadKey: string; title: string }[] };
  assert.deepEqual(muted.items.map((m) => [m.threadKind, m.threadKey, m.title]), [['comment', mine, 'Comment: Thread to mute']]);
  assert.equal((await t.call('DELETE', '/v1/me/muted-threads', { threadKind: 'comment', threadKey: mine }, a.token)).status, 204);
  await comment(t, c, 'Now heard', mine);
  assert.deepEqual(sent.map((m) => m.data['kind']), ['reply'], 'unmuted → the next reply pushes');
  assert.equal((await t.call('PUT', '/v1/me/muted-threads', { threadKind: 'comment', threadKey: 'not-a-comment' }, a.token)).status, 422);
  await t.close();
});

test('T015 (FR-012): "Stop like notices" — likes on that comment make no notice or push, replies still do; author only', async () => {
  const { t, sent, a, b, c } = await setup();
  const mine = await comment(t, a, 'Quiet please');
  assert.equal((await t.call('PUT', `/v1/comments/${mine}/like-notices`, { off: true }, b.token)).status, 403);
  assert.equal((await t.call('PUT', `/v1/comments/${mine}/like-notices`, { off: true }, a.token)).status, 204);
  await t.call('PUT', `/v1/comments/${mine}/like`, undefined, b.token);
  assert.equal(sent.length, 0, 'like notices off → nothing');
  await comment(t, c, 'Still a reply', mine);
  assert.deepEqual(sent.map((m) => m.data['kind']), ['reply']);
  const kinds = ((await (await t.call('GET', '/v1/me/notifications', undefined, a.token)).json()) as { items: { kind: string }[] }).items.map((n) => n.kind);
  assert.deepEqual(kinds, ['reply'], 'no like notice was written');
  await t.close();
});

test('T025 (FR-022): a new status pushes each follower with "Statuses" on, at most 5 statuses a day per poster', async () => {
  const { t, sent, a, b, c } = await setup();
  assert.equal((await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_B, platform: 'ios' }, b.token)).status, 204);
  await t.call('PUT', `/v1/listeners/${c.id}/follow`, undefined, a.token);
  await t.call('PUT', `/v1/listeners/${c.id}/follow`, undefined, b.token);
  assert.equal((await t.call('PUT', '/v1/me/push-prefs', { statuses: false }, b.token)).status, 204);
  const r = await t.call('POST', '/v1/voice-posts', { body: 'Listening to Ep P' }, c.token);
  assert.equal(r.status, 201);
  const id = ((await r.json()) as { id: string }).id;
  const statusPushes = () => sent.filter((m) => m.data['kind'] === 'status_new');
  assert.deepEqual(statusPushes().map((m) => [m.to, m.title, m.data['href']]), [[TOKEN_A, 'Cy posted a status', `/status/${id}`]], 'Bea turned Statuses off');

  // The cap: 4 more push (5 in all), then the 6th does not. Live statuses are capped at 5, so
  // the older ones expire first; the day's count is what limits pushes.
  for (let i = 0; i < 5; i++) {
    await expireStatuses(t, 60_000, c.id);
    assert.equal((await t.call('POST', '/v1/voice-posts', { body: `Status ${i}` }, c.token)).status, 201);
  }
  assert.equal(statusPushes().length, 5, 'the 6th status of the day pushes no one');
  await t.close();
});
