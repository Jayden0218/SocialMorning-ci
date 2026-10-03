/**
 * M15 guards G-L2, G-L3 (FR-013, FR-017; constitution v2.4.0) — the launch screen counts totals
 * only, and its images stay within 1 MB each and 50 MB together.
 *
 * The breaks that turn each red (watched once, named in the commit):
 *   G-L2: add `listener_id uuid NULL` to `promotions` in `014_admin.sql` (and to the insert in
 *         `src/db/repos/discover/promotions.ts`) — the column scan below finds it.
 *   G-L3: raise `MAX_LAUNCH_IMAGE_BYTES` (or `LAUNCH_CEILING_BYTES`) in `src/storage/episodes-blob.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCall, adminSetup, auditRows } from './admin-harness.ts';
import { fakeStore } from './fake-store.ts';
import { LAUNCH_CEILING_BYTES, MAX_LAUNCH_IMAGE_BYTES } from '../src/storage/episodes-blob.ts';

const hour = 3_600_000;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function setup() {
  const store = fakeStore();
  const s = await adminSetup({ episodeStorage: store });
  return { ...s, store };
}

test('G-L2: promotions has no listener or IP column, and an event stores nothing but +1', async () => {
  const { t, owner, store } = await setup();
  const cols = (await t.q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'promotions'")).map((r) => r.column_name);
  assert.ok(cols.length > 10);
  for (const c of cols) assert.doesNotMatch(c, /listener|ip|device|user|viewer|session|country|email/i, `promotions.${c} could identify a person`);

  const url = store.put('launch/aaaa.png', 500_000, 'image/png');
  const made = await aCall(t, 'POST', '/v1/admin/launch', owner, { imageUrl: url, targetKind: 'route', target: '/categories', startsAt: iso(-hour), endsAt: iso(24 * hour) });
  assert.equal(made.status, 201, await made.clone().text());
  const { promotion } = (await made.json()) as { promotion: { id: string; label: string; state: string; dailyCap: number; weight: number } };
  assert.deepEqual([promotion.label, promotion.state, promotion.dailyCap, promotion.weight], ['Promotion', 'live', 1, 1]);

  const pub = await t.call('GET', '/v1/launch');
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get('cache-control'), 'public, max-age=300');
  const list = (await pub.json()) as { items: { id: string; imageUrl: string; target: string }[] };
  assert.deepEqual(list.items.map((i) => [i.id, i.imageUrl, i.target]), [[promotion.id, url, '/categories']]);

  const rowsBefore = (await t.q<{ n: number }>("SELECT (SELECT count(*) FROM sessions) + (SELECT count(*) FROM admin_audit) + (SELECT count(*) FROM rec_events) + (SELECT count(*) FROM share_events) AS n"))[0]!.n;
  for (const kind of ['impression', 'impression', 'tap'] as const) {
    assert.equal((await t.call('POST', `/v1/launch/${promotion.id}/events`, { kind }, undefined, { 'x-forwarded-for': '203.0.113.9' })).status, 204);
  }
  const [counts] = await t.q<{ impressions: number; taps: number }>('SELECT impressions::int, taps::int FROM promotions WHERE id = $1', [promotion.id]);
  assert.deepEqual(counts, { impressions: 2, taps: 1 });
  const rowsAfter = (await t.q<{ n: number }>("SELECT (SELECT count(*) FROM sessions) + (SELECT count(*) FROM admin_audit) + (SELECT count(*) FROM rec_events) + (SELECT count(*) FROM share_events) AS n"))[0]!.n;
  assert.equal(Number(rowsAfter), Number(rowsBefore), 'an event wrote a row somewhere');
  const dump = JSON.stringify(await t.q('SELECT * FROM promotions'));
  assert.equal(dump.includes('203.0.113.9'), false, 'the IP is stored');
  // Not live → not counted, not served.
  await aCall(t, 'PATCH', `/v1/admin/launch/${promotion.id}`, owner, { retired: true });
  assert.equal((await t.call('POST', `/v1/launch/${promotion.id}/events`, { kind: 'tap' })).status, 204);
  assert.equal(((await t.q<{ taps: number }>('SELECT taps::int FROM promotions'))[0]!).taps, 1);
  assert.deepEqual(((await (await t.call('GET', '/v1/launch')).json()) as { items: unknown[] }).items, []);
  assert.deepEqual((await auditRows(t)).map((r) => [r.area, r.action]), [['launch', 'create'], ['launch', 'retire']]);
  await t.close();
});

test('G-L3: an upload over 1 MB is refused naming 1 MB; one that would take live images past 50 MB is refused storage_full', async () => {
  const { t, owner, store } = await setup();
  assert.equal(MAX_LAUNCH_IMAGE_BYTES, 1_048_576);
  assert.equal(LAUNCH_CEILING_BYTES, 50 * 1024 * 1024);
  const big = await aCall(t, 'POST', '/v1/admin/launch/uploads', owner, { contentType: 'image/png', size: 1_048_577 });
  assert.equal(big.status, 422);
  assert.match(((await big.json()) as { message: string }).message, /1 MB/);
  const ok = await aCall(t, 'POST', '/v1/admin/launch/uploads', owner, { contentType: 'image/webp', size: 1_048_576 });
  assert.equal(ok.status, 200);
  assert.match(((await ok.json()) as { pathname: string }).pathname, /^launch\/[0-9a-f-]{36}\.webp$/);
  assert.equal((await aCall(t, 'POST', '/v1/admin/launch/uploads', owner, { contentType: 'image/gif', size: 10 })).status, 422);

  // 50 live images of exactly 1 MB fill the ceiling; one more byte is refused.
  for (let i = 0; i < 50; i++) {
    await t.q(`INSERT INTO promotions (image_url, image_path, image_bytes, target_kind, target, starts_at, ends_at)
               VALUES ($1, $2, 1048576, 'route', '/', now() - interval '1 hour', now() + interval '1 day')`, [`https://store.example/launch/${i}.png`, `launch/${i}.png`]);
  }
  const full = await aCall(t, 'POST', '/v1/admin/launch/uploads', owner, { contentType: 'image/png', size: 1 });
  assert.equal(full.status, 409);
  assert.equal(((await full.json()) as { error: string }).error, 'storage_full');
  // A stored image is re-checked on save too (the browser could skip the token step).
  const url = store.put('launch/late.png', 10, 'image/png');
  assert.equal((await aCall(t, 'POST', '/v1/admin/launch', owner, { imageUrl: url, targetKind: 'route', target: '/', startsAt: iso(0), endsAt: iso(hour) })).status, 409);
  // Ended promotions no longer count.
  await t.q("UPDATE promotions SET ends_at = now() - interval '1 minute', starts_at = now() - interval '2 hours'");
  assert.equal((await aCall(t, 'POST', '/v1/admin/launch/uploads', owner, { contentType: 'image/png', size: 1 })).status, 200);
  await t.close();
});

test('a web target must be https; the image must be one we stored under launch/', async () => {
  const { t, owner, store } = await setup();
  const url = store.put('launch/b.jpg', 1000, 'image/jpeg');
  const http = await aCall(t, 'POST', '/v1/admin/launch', owner, { imageUrl: url, targetKind: 'url', target: 'http://example.com', startsAt: iso(0), endsAt: iso(hour) });
  assert.equal(http.status, 422);
  const elsewhere = store.put('covers/x/c.png', 1000, 'image/png');
  assert.equal((await aCall(t, 'POST', '/v1/admin/launch', owner, { imageUrl: elsewhere, targetKind: 'url', target: 'https://example.com', startsAt: iso(0), endsAt: iso(hour) })).status, 422);
  const good = await aCall(t, 'POST', '/v1/admin/launch', owner, { imageUrl: url, targetKind: 'url', target: 'https://example.com/a', label: 'New', startsAt: iso(hour), endsAt: iso(2 * hour), weight: 5, dailyCap: 2 });
  assert.equal(good.status, 201);
  const items = ((await (await aCall(t, 'GET', '/v1/admin/launch', owner)).json()) as { items: { state: string }[] }).items;
  assert.deepEqual(items.map((i) => i.state), ['draft']);
  assert.deepEqual(((await (await t.call('GET', '/v1/launch')).json()) as { items: unknown[] }).items, [], 'a draft is not served');
  await t.close();
});
