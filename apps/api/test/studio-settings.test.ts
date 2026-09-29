/**
 * M11 US6 + US7 — overrides, helpers, giving the show back, tips (FR-024..FR-027).
 *
 * Guard G-T1 (refunds do not count): the break is dropping `p.status <> 'refunded'` in
 * `src/db/repos/studio-tips.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { addEpisode, proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/mine.xml';

async function setup() {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  await addEpisode(t, FEED, 'E1', 'Ep one', 1_000_000);
  return { t, owner, key };
}

test('overrides: set, read by the app, cleared back to the feed; bad values refused', async () => {
  const { t, owner, key } = await setup();
  const put = (body: unknown) => sCall(t, 'PUT', `/v1/studio/shows/${key}/overrides`, owner, body);
  assert.equal((await put({ coverUrl: 'http://insecure.example.com/a.jpg' })).status, 422);
  assert.equal((await put({ themeColour: 'yellow' })).status, 422);
  assert.equal((await put({ links: [{ label: 'x'.repeat(21), url: 'https://a.b' }] })).status, 422);
  assert.equal((await put({ unknownField: 1 })).status, 422);
  assert.equal((await put({ title: 'Morning Talk', themeColour: '#fcc522', hosts: ['Mei', 'Bo'], links: [{ label: 'Site', url: 'https://example.com' }] })).status, 200);
  assert.equal((await put({ description: 'About us' })).status, 200, 'a second save keeps what it does not name');
  const app = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}`)).json()) as { overrides: Record<string, unknown> };
  assert.deepEqual([app.overrides.title, app.overrides.themeColour, app.overrides.hosts, app.overrides.description], ['Morning Talk', '#fcc522', ['Mei', 'Bo'], 'About us']);
  assert.equal((await put({ title: null })).status, 200);
  const cleared = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}`)).json()) as { overrides: Record<string, unknown> };
  assert.deepEqual([cleared.overrides.title, cleared.overrides.description], [null, 'About us'], 'null means "use the feed"');
  await t.close();
});

test('team: add by email, 10 at most, not the owner, not twice; a helper gets owner-only pages refused', async () => {
  const { t, owner, key } = await setup();
  const add = (email: string) => sCall(t, 'POST', `/v1/studio/shows/${key}/team`, owner, { email });
  assert.equal((await add('nobody@example.com')).status, 404);
  assert.equal((await add('o@example.com')).status, 409);
  const helpers = await Promise.all(Array.from({ length: 10 }, (_, i) => signUp(t, `h${i}@example.com`, `H${i}`)));
  for (const [i] of helpers.entries()) assert.equal((await add(`H${i}@EXAMPLE.COM`)).status, 201, "email match ignores case");
  assert.equal((await add('h0@example.com')).status, 409, 'already a helper');
  await signUp(t, 'eleven@example.com', 'Eleven');
  const full = await add('eleven@example.com');
  assert.equal(full.status, 409);
  assert.equal(((await full.json()) as { reason: string }).reason, 'full');
  const list = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/team`, owner)).json()) as { operators: unknown[]; slotsLeft: number };
  assert.deepEqual([list.operators.length, list.slotsLeft], [10, 0]);
  await t.close();
});

test('release: the owner types the name; everything that hung on the claim stops; the feed can be claimed again', async () => {
  const { t, owner, key } = await setup();
  const op = await studioLogin(t, 'op@example.com', 'Op');
  const troll = await signUp(t, 'tr@example.com', 'Troll');
  await sCall(t, 'POST', `/v1/studio/shows/${key}/team`, owner, { email: 'op@example.com' });
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/mutes/${troll.id}`, owner);
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/overrides`, owner, { title: 'X' });
  const endsAt = new Date(Date.now() + 86_400_000).toISOString();
  await sCall(t, 'POST', `/v1/studio/shows/${key}/polls`, owner, { question: 'Q?', options: ['a', 'b'], endsAt });

  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/release`, op, { confirm: 'The Show' })).status, 403, 'a helper cannot give it away');
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/release`, owner, { confirm: 'the show' })).status, 422);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/release`, owner, { confirm: 'The Show' })).status, 204);

  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/overview`, owner)).status, 403);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/overview`, op)).status, 403);
  const left = await t.q<{ m: number; u: number; o: number; p: number }>(
    `SELECT (SELECT count(*)::int FROM show_members WHERE feed_url = $1) AS m, (SELECT count(*)::int FROM show_mutes WHERE feed_url = $1) AS u,
            (SELECT count(*)::int FROM show_overrides WHERE feed_url = $1) AS o, (SELECT count(*)::int FROM polls WHERE feed_url = $1 AND closed_at IS NULL) AS p`, [FEED]);
  assert.deepEqual(left[0], { m: 0, u: 0, o: 0, p: 0 });
  const other = await signUp(t, 'new@example.com', 'New');
  const claim = await t.call('POST', '/v1/creator/claims', { feedUrl: FEED }, other.token);
  assert.equal(claim.status, 200, 'the feed is free again');
  await t.close();
});

test('G-T1: tips total and list leave out refunded purchases; no tips is zero, not an error', async () => {
  const { t, owner, key } = await setup();
  const empty = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/tips`, owner)).json()) as { totalMicrosByCurrency: Record<string, number>; items: unknown[] };
  assert.deepEqual([empty.totalMicrosByCurrency, empty.items], [{}, []]);
  const fan = await signUp(t, 'fan@example.com', 'Fan');
  const buy = async (txn: string, micros: number, status: string) => {
    const [p] = await t.q<{ id: string }>(
      "INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, amount_micros, currency) VALUES ($1, 'apple', 'tip.small', $2, $3, $4, 'MYR') RETURNING id",
      [fan.id, txn, status, micros]);
    await t.q('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [fan.id, FEED, p!.id]);
  };
  await buy('t1', 4_900_000, 'active');
  await buy('t2', 9_900_000, 'refunded');
  const r = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/tips`, owner)).json()) as { totalMicrosByCurrency: Record<string, number>; items: { from: { displayName: string } | null }[] };
  assert.deepEqual([r.totalMicrosByCurrency, r.items.length, r.items[0]!.from], [{ MYR: 4_900_000 }, 1, { displayName: 'Fan' }]);
  await t.close();
});
