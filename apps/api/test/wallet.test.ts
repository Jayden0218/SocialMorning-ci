// Tests the read-only wallet shows only the caller's own rows.
/** M12 FR-105/FR-106 — the wallet and "Tips I gave" are READ ONLY, and say the store is not ready. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { seedEntitlement, seedPurchase, seedTip } from './pd-neutral.ts';

test('FR-105/106: empty until the store exists; the caller\'s own rows only; storeReady false', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  assert.equal((await t.call('GET', '/v1/me/purchases')).status, 401);
  assert.deepEqual(await (await t.call('GET', '/v1/me/purchases', undefined, a.token)).json(), { items: [], entitlements: [], storeReady: false, stores: { google: false, apple: false } });
  assert.deepEqual(await (await t.call('GET', '/v1/me/tips', undefined, a.token)).json(), { items: [], storeReady: false, stores: { google: false, apple: false } });

  const p = await seedPurchase(t, { listenerId: a.id, store: 'apple', productId: 'tip.small', orderId: 'txn-1', amountMicros: 990000, currency: 'USD' });
  await seedPurchase(t, { listenerId: b.id, store: 'google', productId: 'plus.month', orderId: 'txn-2' });
  await seedTip(t, { fromListener: a.id, feedUrl: 'https://feeds.example.com/x.xml', purchaseId: p });
  await seedEntitlement(t, { listenerId: a.id, kind: 'plus' });

  const mine = (await (await t.call('GET', '/v1/me/purchases', undefined, a.token)).json()) as { items: { productId: string; amountMicros: number; currency: string }[]; entitlements: { kind: string; until: string | null }[]; storeReady: boolean };
  assert.deepEqual(mine.items.map((i) => [i.productId, i.amountMicros, i.currency]), [['tip.small', 990000, 'USD']]);
  assert.deepEqual(mine.entitlements, [{ kind: 'plus', ref: '', until: null }]);
  assert.equal(mine.storeReady, false);
  const tips = (await (await t.call('GET', '/v1/me/tips', undefined, a.token)).json()) as { items: { feedUrl: string; amountMicros: number }[] };
  assert.deepEqual(tips.items.map((i) => [i.feedUrl, i.amountMicros]), [['https://feeds.example.com/x.xml', 990000]]);
  assert.deepEqual(((await (await t.call('GET', '/v1/me/tips', undefined, b.token)).json()) as { items: unknown[] }).items, []);
  await t.close();
});
