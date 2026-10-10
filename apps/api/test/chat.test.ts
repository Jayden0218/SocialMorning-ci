// Tests chat: only people who follow each other can send; blocks hide it; unread and episodes work.
/**
 * Chat (owner, 2026-10-04). The guard is the mutual-follow rule: a message to someone who does
 * not follow you back is 403, and a block either way empties the conversation for both.
 * The break that turns it red: in `canChat` (src/db/repos/social/chat.ts) drop the second
 * `EXISTS (… follower_id = $2 AND followed_id = $1)` — the one-way send then answers 201.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOf, deleteListenerNow } from './sc-neutral.ts';
import { putEpisode } from './put-episode.ts';
import { freshDb, signUp, type TestDb } from './harness.ts';

type Msg = { id: string; fromMe: boolean; body: string; read: boolean; episode?: { id: string; title: string } };
const follow = async (t: TestDb, from: { token: string }, to: { id: string }) =>
  assert.equal((await t.call('PUT', `/v1/listeners/${to.id}/follow`, undefined, from.token)).status, 204);
const say = (t: TestDb, from: { token: string }, to: { id: string }, body: unknown) => t.call('POST', `/v1/me/chats/${to.id}`, body, from.token);

test('chat: only mutual follows can send; the thread, the list, unread and read', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  assert.equal((await t.call('POST', `/v1/me/chats/${b.id}`, { body: 'hi' })).status, 401); // signed out
  // One way is not enough.
  await follow(t, a, b);
  const oneWay = await say(t, a, b, { body: 'hi' });
  assert.equal(oneWay.status, 403);
  assert.equal(((await oneWay.json()) as { error: string }).error, 'forbidden');
  await follow(t, b, a);
  // Friends: each sees the other.
  const fr = (await (await t.call('GET', '/v1/me/chats/friends', undefined, a.token)).json()) as { friends: { id: string; displayName: string }[] };
  assert.deepEqual(fr.friends, [{ id: b.id, displayName: 'Bea' }]);
  // Send: text is trimmed; empty and too long are refused.
  const sent = await say(t, a, b, { body: '  hello Bea  ' });
  assert.equal(sent.status, 201);
  const m1 = ((await sent.json()) as { message: Msg }).message;
  assert.equal(m1.body, 'hello Bea');
  assert.equal(m1.fromMe, true);
  assert.equal((await say(t, a, b, { body: '   ' })).status, 422);
  assert.equal((await say(t, a, b, { body: 'x'.repeat(1001) })).status, 422);
  assert.equal((await say(t, a, a, { body: 'me' })).status, 404);
  assert.equal((await say(t, a, { id: 'not-a-uuid' }, { body: 'x' })).status, 404);
  // Bea's badge, list and thread; reading clears the badge.
  assert.deepEqual(await (await t.call('GET', '/v1/me/chats/unread', undefined, b.token)).json(), { count: 1 });
  const list = (await (await t.call('GET', '/v1/me/chats', undefined, b.token)).json()) as { conversations: { with: { id: string }; last: Msg; unread: number; canSend: boolean }[] };
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0]!.with.id, a.id);
  assert.equal(list.conversations[0]!.last.body, 'hello Bea');
  assert.equal(list.conversations[0]!.last.fromMe, false);
  assert.equal(list.conversations[0]!.unread, 1);
  assert.equal(list.conversations[0]!.canSend, true);
  const th = (await (await t.call('GET', `/v1/me/chats/${a.id}`, undefined, b.token)).json()) as { with: { displayName: string }; canSend: boolean; messages: Msg[] };
  assert.equal(th.with.displayName, 'Alex');
  assert.deepEqual(th.messages.map((m) => m.body), ['hello Bea']);
  assert.deepEqual(await (await t.call('GET', '/v1/me/chats/unread', undefined, b.token)).json(), { count: 0 });
  // Alex sees it read; the poll with `after` returns only newer ones.
  await say(t, b, a, { body: 'hey' });
  const mine = (await (await t.call('GET', `/v1/me/chats/${b.id}?after=${m1.id}`, undefined, a.token)).json()) as { messages: Msg[] };
  assert.deepEqual(mine.messages.map((m) => [m.body, m.fromMe]), [['hey', false]]);
  const all = (await (await t.call('GET', `/v1/me/chats/${b.id}`, undefined, a.token)).json()) as { messages: Msg[] };
  assert.deepEqual(all.messages.map((m) => [m.body, m.read]), [['hello Bea', true], ['hey', true]]);
  assert.equal((await t.call('GET', `/v1/me/chats/${b.id}?after=abc`, undefined, a.token)).status, 422);
  // An unfollow keeps the history but stops sending.
  assert.equal((await t.call('DELETE', `/v1/listeners/${a.id}/follow`, undefined, b.token)).status, 204);
  assert.equal((await say(t, a, b, { body: 'still there?' })).status, 403);
  const after = (await (await t.call('GET', `/v1/me/chats/${b.id}`, undefined, a.token)).json()) as { canSend: boolean; messages: Msg[] };
  assert.equal(after.canSend, false);
  assert.equal(after.messages.length, 2);
  await t.close();
});

test('chat: a block either way hides the conversation for both and stops sending', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await follow(t, a, b); await follow(t, b, a);
  assert.equal((await say(t, a, b, { body: 'hi' })).status, 201);
  assert.equal((await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, b.token)).status, 201);
  for (const viewer of [a, b]) {
    const list = (await (await t.call('GET', '/v1/me/chats', undefined, viewer.token)).json()) as { conversations: unknown[] };
    assert.deepEqual(list.conversations, []);
    const other = viewer === a ? b : a;
    const th = (await (await t.call('GET', `/v1/me/chats/${other.id}`, undefined, viewer.token)).json()) as { messages: unknown[]; canSend: boolean };
    assert.deepEqual(th.messages, []);
    assert.equal(th.canSend, false);
  }
  assert.deepEqual(await (await t.call('GET', '/v1/me/chats/unread', undefined, b.token)).json(), { count: 0 });
  assert.equal((await say(t, a, b, { body: 'hello?' })).status, 403);
  await t.close();
});

test('chat: an episode card travels with the message; an unknown episode is 404; 31st in a minute is 429', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await follow(t, a, b); await follow(t, b, a);
  await putEpisode(t, 'e1', { feedUrl: 'https://f/x.xml', guid: 'g', title: 'Ep one', showTitle: 'Show', enclosureUrl: 'https://cdn/x.mp3' });
  const r = await say(t, a, b, { episodeId: 'e1' });
  assert.equal(r.status, 201);
  const m = ((await r.json()) as { message: Msg }).message;
  assert.equal(m.body, '');
  assert.equal(m.episode?.title, 'Ep one');
  assert.equal((await say(t, a, b, { episodeId: 'nope' })).status, 404);
  for (let i = 1; i < 30; i++) assert.equal((await say(t, a, b, { body: `m${i}` })).status, 201);
  assert.equal((await say(t, a, b, { body: 'one too many' })).status, 429);
  // Deleting an account deletes its messages.
  await deleteListenerNow(t, a.id);
  assert.equal(await countOf(t, 'chat_messages'), 0);
  await t.close();
});
