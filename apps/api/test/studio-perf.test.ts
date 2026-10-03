// Tests every Studio call on a big show answers within two seconds.
/**
 * M11 SC-006 — every Studio call on a big show answers inside 2 s: 500 episodes, 10 000
 * comments, 2 000 listeners with plays, reactions and subscriptions. Measured on pglite in the
 * CI runner, which is slower than Neon, so a pass here is a floor, not the production number
 * (Principle I). The timings are printed so the gate log can quote them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/big.xml';
const BUDGET_MS = 2000;

test('SC-006: overview, 90-day trend, episode table, comments and subscribers each answer within 2 s on a big show', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  await t.q(`INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, duration_ms, published_at)
             SELECT 'E' || i, $1, 'g' || i, 'Episode ' || i, 'Big', 'https://cdn/' || i || '.mp3', 3600000, now() - (i || ' days')::interval
             FROM generate_series(1, 500) i`, [FEED]);
  await t.q(`INSERT INTO listeners (email, password_hash, display_name)
             SELECT 'l' || i || '@example.com', 'x', 'L' || i FROM generate_series(1, 2000) i`);
  await t.q(`INSERT INTO subscriptions (listener_id, feed_url) SELECT id, $1 FROM listeners WHERE email LIKE 'l%@example.com'`, [FEED]);
  await t.q(`INSERT INTO activity (actor_id, kind, episode_id, day, created_at)
             SELECT l.id, 'listened', 'E' || (1 + (row_number() OVER () % 500)), current_date - (row_number() OVER () % 60)::int, now()
             FROM listeners l WHERE l.email LIKE 'l%@example.com'`);
  await t.q(`INSERT INTO comments (episode_id, author_id, body, offset_ms, created_at)
             SELECT 'E' || (1 + i % 500), (SELECT id FROM listeners WHERE email = 'l' || (1 + i % 2000) || '@example.com'),
                    'comment ' || i, (i * 997) % 3600000, now() - ((i % 90) || ' days')::interval
             FROM generate_series(1, 10000) i`);
  await t.q(`INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms)
             SELECT l.id, 'E' || (1 + (row_number() OVER () % 500)), (row_number() OVER () % 100)::smallint, 0
             FROM listeners l WHERE l.email LIKE 'l%@example.com'`);

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
  console.log(`[SC-006 timings, pglite] ${timings.join(' · ')}`);
  await t.close();
});
