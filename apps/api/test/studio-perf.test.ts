// Tests every Studio call on a big show answers within its time budget.
/**
 * M11 SC-006 — every Studio call on a big show answers inside its budget (2 s in production, 6 s on DynamoDB Local): 500 episodes, 10 000
 * comments, 2 000 listeners with plays, reactions and subscriptions. Measured on DynamoDB Local in the
 * CI runner, which is slower than DynamoDB itself, so a pass here is a floor, not the production number
 * (Principle I). The timings are printed so the gate log can quote them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';
import { bulkBigShow } from './st-neutral.ts';

const FEED = 'https://feeds.example.com/big.xml';
// On DynamoDB Local (a container over HTTP, one request per read) the budget is 6 s (plan.md test strategy).
const BUDGET_MS = 6000;

test('SC-006: overview, 90-day trend, episode table, comments and subscribers each answer within the budget on a big show', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  await bulkBigShow(t, FEED);

  const paths = [
    `/v1/studio/shows/${key}/overview`,
    `/v1/studio/shows/${key}/trend?metric=comments&days=90&tz=UTC`,
    `/v1/studio/shows/${key}/episodes?sort=plays&dir=desc`,
    `/v1/studio/shows/${key}/comments`,
    `/v1/studio/shows/${key}/subscribers/stats?days=90&tz=UTC`,
    `/v1/studio/shows/${key}/subscribers`,
  ];
  const timings: string[] = [];
  for (const p of paths) {
    const t0 = performance.now();
    const r = await sCall(t, 'GET', p, owner);
    const ms = Math.round(performance.now() - t0);
    assert.equal(r.status, 200, p);
    await r.arrayBuffer();
    timings.push(`${p.replace(`/v1/studio/shows/${key}`, '')} ${ms} ms`);
    assert.ok(ms < BUDGET_MS, `${p} took ${ms} ms`);
  }
  console.log(`[SC-006 timings, dynamodb-local] ${timings.join(' · ')}`);
  await t.close();
});
