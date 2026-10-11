// Checks For You respects blocks, hidden shows and private listening.
/**
 * M8 US4 (quickstart A11, A12, A15, A16 · guards G-R1, G-R3).
 *
 * M6 cost eight phone-found defects to get right. A new surface that quietly routed
 * around its rules would undo that without a single test going red, and a privacy failure
 * is the kind nobody notices until it cannot be fixed. So each of M6's three rules is
 * asserted here against For You specifically, not against the app in general.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { likers, rebuildSimilarity } from '../src/db/repos/discover/similarity.ts';
import { contextFor, buildForYou } from '../src/db/repos/discover/foryou.ts';
import { follow } from '../src/db/repos/social/follows.ts';
import { seedEpisode, seedListen, similarityRows } from './dv-neutral.ts';
import { hideFeeds } from './sf-neutral.ts';

const SHOW_A = 'https://feeds.example.com/a.xml';
const SHOW_B = 'https://feeds.example.com/b.xml';
const SHOW_C = 'https://feeds.example.com/c.xml';

const idOf = (feed: string, guid: string) => fnv1a64(`${feed}\u0001${guid}`);

async function episode(t: TestDb, feed: string, guid: string, title: string, publishedAt = '2026-09-24T10:00:00Z') {
  // M26: registered through lane LB's dual upsertEpisode (both backends).
  return seedEpisode(t, { id: idOf(feed, guid), feedUrl: feed, guid, title, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, genreId: 1318 });
}

const emptyDiscover = async () => ({ picks: [], talkedAbout: [], trending: [] });

test('A11: a blocked listener\'s activity never reaches For You, in items or in reasons', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const ep = await episode(t, SHOW_B, 'b1', "Bo's episode");

  await follow(t.db, a.id, b.id);
  await seedListen(t, b.id, ep, { day: '2026-09-24' });

  const before = await buildForYou(t.db, await contextFor(t.db, a.id), emptyDiscover, Date.now());
  assert.ok(before.items.some((i) => i.episode.id === ep), 'the social channel found it while B was visible');

  await t.call('POST', '/v1/me/blocks', { listenerId: b.id }, a.token);

  const after = await buildForYou(t.db, await contextFor(t.db, a.id), emptyDiscover, Date.now());
  assert.ok(!after.items.some((i) => i.episode.id === ep), 'and nothing of B\'s survives the block');
  assert.ok(!JSON.stringify(after.items).includes('Bo'), 'nor does B\'s name appear anywhere');
  await t.close();
});

test('A11: an episode of a moderation-hidden show never appears, for anyone', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const ep = await episode(t, SHOW_A, 'a1', 'From a show about to be hidden');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: SHOW_A, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);

  const before = await buildForYou(t.db, await contextFor(t.db, a.id), emptyDiscover, Date.now());
  assert.ok(before.items.some((i) => i.episode.id === ep));

  // Hiding goes through a moderation action, exactly as /mod does it — the table has an
  // FK to it, which is what makes "who hid this and when" answerable.
  // M26: the moderation action + hidden_feeds row through act() (test/sf-neutral.ts), on both backends.
  await hideFeeds(t, a.id, [SHOW_A]);

  const after = await buildForYou(t.db, await contextFor(t.db, a.id), emptyDiscover, Date.now());
  assert.ok(!after.items.some((i) => i.episode.id === ep), 'hidden is hidden');
  await t.close();
});

test('A11 + A12: private listening is invisible to others and still personal to its owner', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const c = await signUp(t, 'c@example.com', 'Cass');
  const ep = await episode(t, SHOW_C, 'c1', "Cass's private listen");

  await follow(t.db, a.id, c.id);
  await t.call('PUT', '/v1/me/privacy', { privateListening: true }, c.token);
  // M4 writes `hidden` at insert time from the switch, so the row is hidden as it is made.
  await seedListen(t, c.id, ep, { day: '2026-09-24', hidden: true });

  const forA = await buildForYou(t.db, await contextFor(t.db, a.id), emptyDiscover, Date.now());
  assert.ok(!forA.items.some((i) => i.episode.id === ep), "A never sees C's private listening");

  // A12: C's own list is still shaped by it — it is C's own data.
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: SHOW_C, createdAt: '2026-09-20T10:00:00.000Z' }] }, c.token);
  const forC = await buildForYou(t.db, await contextFor(t.db, c.id), emptyDiscover, Date.now());
  assert.ok(forC.items.some((i) => i.episode.id === ep), "C's own subscription still produces it");
  await t.close();
});

test('A16 (G-R1): a private listener cannot make two shows neighbours', async () => {
  const t = await freshDb();
  const ids: string[] = [];
  for (const [i, email] of ['p1@x.com', 'p2@x.com', 'p3@x.com'].entries()) {
    const l = await signUp(t, email, `P${i}`);
    ids.push(l.id);
    await t.call('PUT', '/v1/me/privacy', { privateListening: true }, l.token);
    await t.call('PUT', '/v1/me/subscriptions', { items: [
      { feedUrl: SHOW_A, createdAt: '2026-09-20T10:00:00.000Z' },
      { feedUrl: SHOW_B, createdAt: '2026-09-20T10:00:00.000Z' },
    ] }, l.token);
  }

  assert.deepEqual(await likers(t.db), [], 'private listeners are not in the input at all');
  const r = await rebuildSimilarity(t.db, undefined, 200);
  assert.equal(r.done, true);
  assert.equal((await similarityRows(t)).rows.length, 0, 'and so nothing was learned from them');
  await t.close();
});

test('A15 (G-R3): show_similarity holds feed URLs and a number — no listener id, in any column', async () => {
  const t = await freshDb();
  const listeners: string[] = [];
  for (const [i, email] of ['q1@x.com', 'q2@x.com', 'q3@x.com'].entries()) {
    const l = await signUp(t, email, `Q${i}`);
    listeners.push(l.id);
    await t.call('PUT', '/v1/me/subscriptions', { items: [
      { feedUrl: SHOW_A, createdAt: '2026-09-20T10:00:00.000Z' },
      { feedUrl: SHOW_B, createdAt: '2026-09-20T10:00:00.000Z' },
      { feedUrl: SHOW_C, createdAt: '2026-09-20T10:00:00.000Z' },
    ] }, l.token);
  }

  const r = await rebuildSimilarity(t.db, undefined, 200);
  assert.equal(r.done, true);
  // M26: `raw` is every stored field (the whole DynamoDB item, keys included); `rows` the old four columns.
  const { rows, raw } = await similarityRows(t);
  assert.ok(rows.length > 0, 'three listeners liking three shows is enough to learn something');
  const text = raw;
  for (const id of listeners) assert.ok(!text.includes(id), 'a listener id reached the table');
  assert.deepEqual(Object.keys(rows[0]!).sort(), ['computed_at', 'show_a', 'show_b', 'sim']);
  await t.close();
});
