// Tests the read-only wallet shows only the caller's own rows.
/** M12 FR-105/FR-106 — the wallet and "Tips I gave" are READ ONLY, and say the store is not ready. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';

test('FR-105/106: empty until the store exists; the caller\'s own rows only; storeReady false', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  assert.equal((await t.call('GET', '/v1/me/purchases')).status, 401);
  assert.deepEqual(await (await t.call('GET', '/v1/me/purchases', undefined, a.token)).json(), { items: [], entitlements: [], storeReady: false, stores: { google: false, apple: false } });
  assert.deepEqual(await (await t.call('GET', '/v1/me/tips', undefined, a.token)).json(), { items: [], storeReady: false, stores: { google: false, apple: false } });

  const [p] = await t.q<{ id: string }>(`INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, amount_micros, currency) VALUES ($1, 'apple', 'tip.small', 'txn-1', 'active', 990000, 'USD') RETURNING id`, [a.id]);
  await t.q(`INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status) VALUES ($1, 'google', 'plus.month', 'txn-2', 'active')`, [b.id]);
  await t.q(`INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, 'https://feeds.example.com/x.xml', $2)`, [a.id, p!.id]);
  await t.q(`INSERT INTO entitlements (listener_id, kind) VALUES ($1, 'plus')`, [a.id]);

  const mine = (await (await t.call('GET', '/v1/me/purchases', undefined, a.token)).json()) as { items: { productId: string; amountMicros: number; currency: string }[]; entitlements: { kind: string; until: string | null }[]; storeReady: boolean };
  assert.deepEqual(mine.items.map((i) => [i.productId, i.amountMicros, i.currency]), [['tip.small', 990000, 'USD']]);
  assert.deepEqual(mine.entitlements, [{ kind: 'plus', ref: '', until: null }]);
  assert.equal(mine.storeReady, false);
  const tips = (await (await t.call('GET', '/v1/me/tips', undefined, a.token)).json()) as { items: { feedUrl: string; amountMicros: number }[] };
  assert.deepEqual(tips.items.map((i) => [i.feedUrl, i.amountMicros]), [['https://feeds.example.com/x.xml', 990000]]);
  assert.deepEqual(((await (await t.call('GET', '/v1/me/tips', undefined, b.token)).json()) as { items: unknown[] }).items, []);
  await t.close();
});
