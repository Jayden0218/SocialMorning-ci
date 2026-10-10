// Tests likes with a note: the follower timeline, private likes, blocks and hidden shows.
/**
 * M19 US3 (quickstart A4). Guard G-M19-3: an account with private likes never appears in anyone
 * else's timeline. The break: drop `AND l.likes_public = true` from `timeline` in
 * src/db/repos/social/likes.ts; the private-likes test goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { putEpisode } from './put-episode.ts';
import { follow } from '../src/db/repos/social/follows.ts';
import { freshDb, signUp, type TestDb } from './harness.ts';

type Timeline = { items: { listener?: { id: string; displayName: string }; episode: { id: string }; note?: string }[]; next?: string };

async function setup() {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await putEpisode(t, 'e1', { feedUrl: 'https://f/x.xml', guid: 'g1', title: 'Ep one', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' });
  await putEpisode(t, 'e2', { feedUrl: 'https://f/y.xml', guid: 'g2', title: 'Ep two', showTitle: 'Show Y', enclosureUrl: 'https://cdn/2.mp3' });
  await follow(t.db, a.id, b.id); // lane SG's repo, on either backend
  return { t, a, b };
}
const tl = async (t: TestDb, token: string) => (await (await t.call('GET', '/v1/me/likes/timeline', undefined, token)).json()) as Timeline;

test('a like with a note reaches a follower\'s timeline; unlike removes it; note ≤ 140', async () => {
  const { t, a, b } = await setup();
  const r = await t.call('PUT', '/v1/episodes/e1/like', { note: 'The best twenty minutes this week.' }, b.token);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { liked: true, note: 'The best twenty minutes this week.' });
  const one = await tl(t, a.token);
  assert.equal(one.items.length, 1);
  assert.equal(one.items[0]!.listener!.displayName, 'Bo');
  assert.equal(one.items[0]!.note, 'The best twenty minutes this week.');
  assert.equal((await t.call('PUT', '/v1/episodes/e1/like', { note: 'x'.repeat(141) }, b.token)).status, 422);
  assert.equal((await t.call('PUT', '/v1/episodes/nope/like', {}, b.token)).status, 404);
  assert.equal((await t.call('DELETE', '/v1/episodes/e1/like', undefined, b.token)).status, 204);
  assert.equal((await tl(t, a.token)).items.length, 0);
  assert.deepEqual(await (await t.call('GET', '/v1/episodes/e1/like', undefined, b.token)).json(), { liked: false });
  await t.close();
});

test('G-M19-3: private likes never reach a timeline or a stranger; the owner still sees them', async () => {
  const { t, a, b } = await setup();
  await t.call('PUT', '/v1/episodes/e1/like', {}, b.token);
  await t.call('PATCH', '/v1/me', { likesPublic: false }, b.token);
  assert.equal((await tl(t, a.token)).items.length, 0, 'not in the follower timeline');
  const stranger = (await (await t.call('GET', `/v1/listeners/${b.id}/likes`, undefined, a.token)).json()) as Timeline;
  assert.equal(stranger.items.length, 0);
  const own = (await (await t.call('GET', `/v1/listeners/${b.id}/likes`, undefined, b.token)).json()) as Timeline;
  assert.equal(own.items.length, 1);
  await t.close();
});

test('a block either way, and a hidden show, keep likes out', async () => {
  const { t, a, b } = await setup();
  await t.call('PUT', '/v1/episodes/e1/like', {}, b.token);
  await t.call('PUT', '/v1/episodes/e2/like', {}, b.token);
  const [action] = await t.q<{ id: string }>("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'hide_show', 'show', 'https://f/y.xml') RETURNING id", [a.id]);
  await t.q("INSERT INTO hidden_feeds (feed_url, action_id) VALUES ('https://f/y.xml', $1)", [action!.id]);
  assert.deepEqual((await tl(t, a.token)).items.map((i) => i.episode.id), ['e1'], 'the hidden show is out');
  await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, b.token);
  assert.equal((await tl(t, a.token)).items.length, 0, 'blocked by B: nothing of B');
  await t.close();
});
