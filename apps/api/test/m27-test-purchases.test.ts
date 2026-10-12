// M27 G-RT3 (specs/028-m27-aws-infra research D2): production refuses a Google test purchase on ANY host.
// Before M27 the switch was `VERCEL_ENV !== 'production'`, so a prod API on Lambda (no VERCEL_ENV) allowed them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, TEST_PEPPER } from './harness.ts';
import { purchaseRows } from './pd-neutral.ts';
import { createApp } from '../src/app.ts';
import type { GooglePlay } from '../src/billing/google-play.ts';

const play: GooglePlay = {
  ready: true,
  subscription: async () => ({ state: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: true, productId: 'plus_monthly', expiresAt: '2099-01-01T00:00:00.000Z', orderId: `GPA.${Math.random()}`, profileId: null, test: true }),
  product: async () => { throw new Error('unused'); },
  acknowledge: async () => undefined,
  voided: async () => [],
};

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('APP_ENV=prod without ALLOW_TEST_PURCHASES refuses a Google test purchase; staging and ALLOW_TEST_PURCHASES=1 accept it', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const buy = (app: ReturnType<typeof createApp>, token: string) =>
    app.request('/v1/me/purchases/google', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` }, body: JSON.stringify({ productId: 'plus_monthly', purchaseToken: token }) });
  // No allowTestPurchases dep: the answer comes from the environment, as on Vercel and on Lambda.
  const make = (vars: Record<string, string | undefined>) => withEnv({ VERCEL_ENV: undefined, ...vars }, async () => createApp({ db: t.db, pepper: TEST_PEPPER, play }));

  try {
  const prod = await make({ APP_ENV: 'prod', ALLOW_TEST_PURCHASES: undefined });
  assert.equal((await buy(prod, 'tok-1')).status, 402, 'prod refuses');
  assert.equal((await purchaseRows(t)).length, 0, 'nothing written');

  const prodOn = await make({ APP_ENV: 'prod', ALLOW_TEST_PURCHASES: '1' });
  assert.equal((await buy(prodOn, 'tok-2')).status, 200, 'the explicit switch allows it');

  const staging = await make({ APP_ENV: 'staging', ALLOW_TEST_PURCHASES: undefined });
  assert.equal((await buy(staging, 'tok-3')).status, 200, 'staging allows it');
  } finally { await t.close(); }
});
