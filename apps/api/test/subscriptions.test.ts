/**
 * M8 US1 — subscriptions as an account-level fact. Quickstart A9.
 *
 * The merge rule is the only interesting thing here, and it exists because a DELETE
 * cannot sync: phone A unsubscribes, phone B still holds the row, B's next reconcile
 * revives the show. Guards G-M2 (the tie) and G-M1 (the read filter, on the phone side).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';

const F1 = 'https://feeds.example.com/one.xml';
const F2 = 'https://feeds.example.com/two.xml';

type Item = { feedUrl: string; createdAt: string; deletedAt?: string; starred: boolean };

const put = async (t: TestDb, token: string, items: unknown[]) =>
  (await (await t.call('PUT', '/v1/me/subscriptions', { items }, token)).json()) as { items: Item[] };

const byUrl = (r: { items: Item[] }, url: string) => r.items.find((i) => i.feedUrl === url);

test('A9: the tombstone wins — an unsubscribe is not revived by an older device, and a tie keeps it removed', async () => {
  const t = await freshDb();
  const a = await signUp(t);

  // Phone A subscribes at 10:00.
  const subscribed = '2026-09-25T10:00:00.000Z';
  const r1 = await put(t, a.token, [{ feedUrl: F1, createdAt: subscribed }]);
  assert.equal(byUrl(r1, F1)?.deletedAt, undefined, 'live after a subscribe');

  // Phone B unsubscribes at 10:00:01.
  const r2 = await put(t, a.token, [{ feedUrl: F1, createdAt: subscribed, deletedAt: '2026-09-25T10:00:01.000Z' }]);
  assert.ok(byUrl(r2, F1)?.deletedAt, 'the tombstone is stored, not a delete');

  // Phone A, which never heard about it, reconciles with its stale subscribe.
  const r3 = await put(t, a.token, [{ feedUrl: F1, createdAt: subscribed }]);
  assert.ok(byUrl(r3, F1)?.deletedAt, 'a stale subscribe does NOT revive the show (G-M2)');

  // A dead-even tie: same instant, one side live, one side a tombstone.
  const tie = '2026-09-25T11:00:00.000Z';
  await put(t, a.token, [{ feedUrl: F2, createdAt: tie }]);
  const r4 = await put(t, a.token, [{ feedUrl: F2, createdAt: tie, deletedAt: tie }]);
  assert.ok(byUrl(r4, F2)?.deletedAt, 'on a tie the tombstone wins');
  const r5 = await put(t, a.token, [{ feedUrl: F2, createdAt: tie }]);
  assert.ok(byUrl(r5, F2)?.deletedAt, 'and the live row cannot take it back on a tie either');

  await t.close();
});

test('A9: a later re-subscribe DOES win, and the whole set comes back including tombstones', async () => {
  const t = await freshDb();
  const a = await signUp(t);

  await put(t, a.token, [{ feedUrl: F1, createdAt: '2026-09-25T10:00:00.000Z', deletedAt: '2026-09-25T10:30:00.000Z' }]);
  const again = await put(t, a.token, [{ feedUrl: F1, createdAt: '2026-09-25T12:00:00.000Z' }]);
  assert.equal(byUrl(again, F1)?.deletedAt, undefined, 'a genuinely later subscribe wins');

  await put(t, a.token, [{ feedUrl: F2, createdAt: '2026-09-25T09:00:00.000Z', deletedAt: '2026-09-25T09:10:00.000Z' }]);
  const get = (await (await t.call('GET', '/v1/me/subscriptions', undefined, a.token)).json()) as { items: Item[] };
  assert.equal(get.items.length, 2, 'the whole set, tombstones included, so a phone converges in one round trip');

  await t.close();
});

test('A9: one device sending the same feed twice keeps the later stamp; a signed-out caller gets 401', async () => {
  const t = await freshDb();
  const a = await signUp(t);

  const r = await put(t, a.token, [
    { feedUrl: F1, createdAt: '2026-09-25T10:00:00.000Z' },
    { feedUrl: F1, createdAt: '2026-09-25T10:00:00.000Z', deletedAt: '2026-09-25T10:05:00.000Z' },
  ]);
  assert.ok(byUrl(r, F1)?.deletedAt, 'duplicates within one request resolve by stamp');

  assert.equal((await t.call('GET', '/v1/me/subscriptions')).status, 401);
  assert.equal((await t.call('PUT', '/v1/me/subscriptions', { items: [] })).status, 401);

  await t.close();
});

test('FR-004: nothing about another listener discloses what they subscribe to', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await put(t, b.token, [{ feedUrl: F1, createdAt: '2026-09-25T10:00:00.000Z' }]);

  for (const path of [`/v1/listeners/${b.id}`, `/v1/listeners/${b.id}/followers`, `/v1/listeners/${b.id}/following`]) {
    const res = await t.call('GET', path, undefined, a.token);
    const text = await res.text();
    assert.ok(!text.includes(F1), `${path} leaks a subscription`);
  }

  await t.close();
});
