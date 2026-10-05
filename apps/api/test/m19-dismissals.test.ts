// Tests "Not interested": a turned-down episode or show leaves For You, and Restore brings it back.
/**
 * M19 US2 (quickstart A3). Guard G-M19-2: For You never returns a show the listener stopped. The
 * break: drop the `isDismissed` filter in `buildForYou` (src/db/repos/discover/foryou.ts) AND the
 * one after the cache in `forYou`; this file goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { buildForYou, contextFor } from '../src/db/repos/discover/foryou.ts';

const SHOW = 'https://feeds.example.com/a.xml';
const emptyDiscover = async () => ({ picks: [], talkedAbout: [], trending: [] });

async function episode(t: TestDb, guid: string) {
  const id = fnv1a64(`${SHOW}\u0001${guid}`);
  await t.q(`INSERT INTO episodes (id, feed_url, guid, title, enclosure_url, published_at, genre_id) VALUES ($1, $2, $3, $4, $5, now(), 1318)`, [id, SHOW, guid, `Ep ${guid}`, `https://cdn/${guid}.mp3`]);
  return id;
}

test('G-M19-2: a dismissed episode, then a dismissed show, leave For You; restore brings them back', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const e1 = await episode(t, 'a1');
  const e2 = await episode(t, 'a2');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: SHOW, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  const ids = async () => (await buildForYou(t.db, await contextFor(t.db, a.id), emptyDiscover, Date.now())).items.map((i) => i.episode.id);
  assert.ok((await ids()).includes(e1) && (await ids()).includes(e2));

  assert.equal((await t.call('PUT', '/v1/me/dismissals', { kind: 'episode', itemKey: e1 }, a.token)).status, 204);
  assert.ok(!(await ids()).includes(e1), 'the episode is gone');
  assert.ok((await ids()).includes(e2), 'its show still recommends others');

  await t.call('PUT', '/v1/me/dismissals', { kind: 'show', itemKey: SHOW }, a.token);
  assert.deepEqual((await ids()).filter((x) => x === e1 || x === e2), [], 'nothing of the show');

  const list = (await (await t.call('GET', '/v1/me/dismissals', undefined, a.token)).json()) as { items: { kind: string; itemKey: string; title?: string }[] };
  assert.deepEqual(list.items.map((i) => i.kind).sort(), ['episode', 'show']);
  assert.equal(list.items.find((i) => i.kind === 'episode')!.title, 'Ep a1');

  await t.call('DELETE', '/v1/me/dismissals', { kind: 'show', itemKey: SHOW }, a.token);
  await t.call('DELETE', '/v1/me/dismissals', { kind: 'episode', itemKey: e1 }, a.token);
  assert.ok((await ids()).includes(e1), 'restored');
  assert.equal((await t.call('PUT', '/v1/me/dismissals', { kind: 'podcast', itemKey: 'x' }, a.token)).status, 422);
  await t.close();
});

test('the For You route drops a dismissal at once, cache or not', async () => {
  // No catalogue: every outside fetch answers 404, so only the listener's own shows feed the list.
  const t = await freshDb({ catalogFetch: (async () => new Response('', { status: 404 })) as typeof fetch });
  const a = await signUp(t);
  const e1 = await episode(t, 'b1');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: SHOW, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  const route = async () => ((await (await t.call('GET', '/v1/for-you', undefined, a.token)).json()) as { items: { episode: { id: string } }[] }).items.map((i) => i.episode.id);
  assert.ok((await route()).includes(e1));
  await t.call('PUT', '/v1/me/dismissals', { kind: 'show', itemKey: SHOW }, a.token);
  assert.ok(!(await route()).includes(e1));
  await t.close();
});
