// Tests that the app's first sync after sign-in cannot wipe the shows the server already holds.
/**
 * 035 M0 / T010 (device check B4, decision D2). On a fresh install the phone's local list is empty. Its first sync
 * (`apps/mobile/src/sync/subscriptions.ts` `run`) is `PUT /v1/me/subscriptions` with `items: local.map(toWire)`,
 * which is `[]`. The question: does that PUT overwrite what the server holds (data loss), or merge into it?
 * Seeded the way `apps/api/scripts/journey.ts` seeds a listener (a plain PUT of one show).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';

const SHOW = 'https://feeds.example.com/journey-morning.xml';
type Out = { items: { feedUrl: string; deletedAt?: string }[] };

test('B4 / D2: a fresh phone\'s first PUT (empty local list) leaves the server\'s show in place and returns it', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  // Seed as journey.ts does.
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: SHOW, createdAt: new Date().toISOString() }] }, a.token);

  // The app's first sync on a fresh install: local table empty, so the body is exactly this.
  const first = (await (await t.call('PUT', '/v1/me/subscriptions', { items: [] }, a.token)).json()) as Out;
  assert.deepEqual(first.items.map((i) => i.feedUrl), [SHOW], 'the PUT answer carries the show, so the phone fills its table from it');
  assert.equal(first.items[0]?.deletedAt, undefined, 'and it is live, not a tombstone');

  const after = (await (await t.call('GET', '/v1/me/subscriptions', undefined, a.token)).json()) as Out;
  assert.deepEqual(after.items.map((i) => i.feedUrl), [SHOW], 'the server still holds the show afterwards (no overwrite)');
  await t.close();
});
