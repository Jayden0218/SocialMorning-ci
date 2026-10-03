// Tests "friends are listening" shows only followed, public, unblocked people.
/**
 * M12 FR-102 — "Friends are listening". Only people the caller follows, only the last 7
 * days, NEVER a person whose listening is private (now, or at the time it was written),
 * nobody across a block; grouped by episode, newest first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const FEED = 'https://feeds.example.com/x.xml';
const eps = [1, 2, 3].map((n) => ({ feedUrl: FEED, guid: `g${n}`, title: `Ep ${n}`, showTitle: 'Show', enclosureUrl: `https://cdn/${n}.mp3`, id: fnv1a64(`${FEED}\u0001g${n}`) }));
const listen = (t: TestDb, token: string, episodeId: string) =>
  t.call('PUT', '/v1/me/listened', { deviceId: 'p1', days: [{ episodeId, day: new Date().toISOString().slice(0, 10), ranges: [[0, 400_000]] }] }, token);
type Out = { items: { episode: { id: string; title: string; showTitle: string }; listeners: { id: string; name: string; initials: string }[]; lastAt: string }[] };
const get = async (t: TestDb, token: string) => (await (await t.call('GET', '/v1/me/friends-listening', undefined, token)).json()) as Out;

test('FR-102: followed + public only, grouped by episode, newest first; a private listener never appears; a block removes them', async () => {
  const t = await freshDb();
  for (const e of eps) await t.call('PUT', `/v1/episodes/${e.id}`, { ...e, durationMs: 2_000_000 });
  const me = await signUp(t, 'me@example.com', 'Me');
  const bo = await signUp(t, 'bo@example.com', 'bo');
  const cy = await signUp(t, 'cy@example.com', 'Cy');
  const pv = await signUp(t, 'pv@example.com', 'Private');
  const stranger = await signUp(t, 'st@example.com', 'Stranger');
  for (const who of [bo, cy, pv]) assert.equal((await t.call('PUT', `/v1/listeners/${who.id}/follow`, undefined, me.token)).status, 204);
  await t.call('PUT', '/v1/me/privacy', { privateListening: true }, pv.token);

  await listen(t, bo.token, eps[0]!.id);
  await listen(t, cy.token, eps[0]!.id);
  await listen(t, pv.token, eps[1]!.id);
  await listen(t, stranger.token, eps[2]!.id);
  await t.q("UPDATE listened_ranges SET updated_at = now() - interval '1 hour' WHERE listener_id = $1", [bo.id]);
  await listen(t, bo.token, eps[2]!.id);

  assert.equal((await t.call('GET', '/v1/me/friends-listening')).status, 401);
  const out = await get(t, me.token);
  assert.deepEqual(out.items.map((i) => [i.episode.title, i.listeners.map((l) => l.name)]), [['Ep 3', ['bo']], ['Ep 1', ['Cy', 'bo']]]);
  assert.deepEqual(out.items[0]!.listeners[0], { id: bo.id, name: 'bo', initials: 'B' });
  assert.equal(out.items[0]!.episode.showTitle, 'Show');

  // Private at the time counts too: switching to public later does not reveal what was listened to while private.
  await t.call('PUT', '/v1/me/privacy', { privateListening: false }, pv.token);
  assert.ok(!JSON.stringify(await get(t, me.token)).includes('Private'), 'written while private stays out');

  // Older than 7 days drops out.
  await t.q("UPDATE listened_ranges SET updated_at = now() - interval '8 days' WHERE listener_id = $1", [cy.id]);
  assert.deepEqual((await get(t, me.token)).items.map((i) => i.listeners.map((l) => l.name)), [['bo'], ['bo']]);

  await t.call('POST', '/v1/me/blocks', { listenerId: me.id }, bo.token);
  assert.deepEqual((await get(t, me.token)).items, [], 'a block (which also ends the follow) removes them');
  await t.close();
});
