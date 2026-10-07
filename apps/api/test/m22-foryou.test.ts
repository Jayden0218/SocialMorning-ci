// Tests the first-open interests: saved on the account, and they seed For You (guard G-M22-5).
/**
 * M22 US5 (FR-017–FR-019, research R5).
 *
 * G-M22-5: a listener with NO listening history and 2 picked categories gets at least 6 of the
 * first 10 For You items from those categories. The other candidates here are fresher (published
 * an hour ago, inside the new-episode boost) so without the interests channel's weight they win —
 * setting W_INTERESTS (or `interestWeight`) to 0 turns this test red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { buildForYou, contextFor, interestWeight } from '../src/db/repos/discover/foryou.ts';
import type { EpisodeCard } from '../src/catalog/apple.ts';

const COMEDY = 1303;
const HISTORY = 1487;
const NOW = Date.parse('2026-10-07T12:00:00Z');
const noCatalog = (async () => new Response('nope', { status: 404 })) as typeof fetch;

async function episode(t: TestDb, n: number, genre: number, publishedAt: string): Promise<string> {
  const feed = `https://feeds.example.com/g${genre}-${n}.xml`;
  const id = fnv1a64(`${feed}\u0001e${n}`);
  await t.q(
    `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, published_at, genre_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
    [id, feed, `e${n}`, `Episode ${n}`, `Show ${genre}-${n}`, `https://cdn.example.com/${genre}-${n}.mp3`, publishedAt, genre],
  );
  return id;
}

/** Ten chart cards in five other categories, two shows each, all published an hour ago. */
function chartCards(): (EpisodeCard & { id: string })[] {
  const genres = [1318, 1489, 1321, 1533, 1545];
  const out: (EpisodeCard & { id: string })[] = [];
  genres.forEach((g, gi) => {
    for (let k = 0; k < 2; k++) {
      const feedUrl = `https://feeds.example.com/chart-${g}-${k}.xml`;
      out.push({
        id: `chart-${gi}-${k}`, feedUrl, guid: `c${k}`, title: `Chart ${g} ${k}`, showTitle: `Chart show ${g}-${k}`,
        enclosureUrl: `https://cdn.example.com/chart-${g}-${k}.mp3`, publishedAt: new Date(NOW - 3_600_000).toISOString(), genreId: g,
      });
    }
  });
  return out;
}

test('G-M22-5: 2 interests and no history → at least 6 of the first 10 For You items match', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const a = await signUp(t);
  assert.equal((await t.call('PUT', '/v1/me/interests', { genreIds: [COMEDY, HISTORY] }, a.token)).status, 204);

  const threeDaysAgo = new Date(NOW - 3 * 86_400_000).toISOString();
  for (let n = 0; n < 5; n++) await episode(t, n, COMEDY, threeDaysAgo);
  for (let n = 0; n < 5; n++) await episode(t, n, HISTORY, threeDaysAgo);

  const cards = chartCards();
  const discover = async () => ({ picks: [], talkedAbout: [], trending: cards.map((episode) => ({ episode })) });
  const ctx = await contextFor(t.db, a.id);
  assert.deepEqual(ctx.interests, [COMEDY, HISTORY]);
  assert.equal(ctx.interestWeight, 1, 'no plays yet → full weight');

  const { items } = await buildForYou(t.db, ctx, discover, NOW);
  const first10 = items.slice(0, 10);
  assert.equal(first10.length, 10);
  const matching = first10.filter((i) => {
    const g = (i.episode as { genreId?: number }).genreId;
    return g === COMEDY || g === HISTORY;
  }).length;
  assert.ok(matching >= 6, `only ${matching} of the first 10 come from the picked categories`);
  assert.ok(first10.some((i) => i.reason.startsWith('Because you picked')), 'the reason says why');
  await t.close();
});

test('the interests weight fades with the listener\'s own plays: 1 at 0, 0.5 at 15, 0 at 30 and beyond', () => {
  assert.equal(interestWeight(0), 1);
  assert.equal(interestWeight(15), 0.5);
  assert.equal(interestWeight(30), 0);
  assert.equal(interestWeight(90), 0);
});

test('interests: fewer than 2 known categories is refused; skip is kept; GET reads them back', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const a = await signUp(t);
  assert.equal((await t.call('GET', '/v1/me/interests')).status, 401);
  assert.equal((await t.call('PUT', '/v1/me/interests', { genreIds: [COMEDY] }, a.token)).status, 422);
  assert.equal((await t.call('PUT', '/v1/me/interests', { genreIds: [COMEDY, 999999] }, a.token)).status, 422, 'an unknown id does not count');
  assert.equal((await t.call('PUT', '/v1/me/interests', { skip: true }, a.token)).status, 204);
  let got = (await (await t.call('GET', '/v1/me/interests', undefined, a.token)).json()) as { genreIds: number[]; skippedAt: string | null };
  assert.deepEqual(got.genreIds, []);
  assert.ok(got.skippedAt);
  assert.equal((await t.call('PUT', '/v1/me/interests', { genreIds: [COMEDY, HISTORY, COMEDY] }, a.token)).status, 204);
  got = (await (await t.call('GET', '/v1/me/interests', undefined, a.token)).json()) as { genreIds: number[]; skippedAt: string | null };
  assert.deepEqual(got.genreIds, [COMEDY, HISTORY]);
  assert.equal(got.skippedAt, null);
  await t.close();
});

test('"Not liking these?" stores the reason and applies the category changes', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/interests', { genreIds: [COMEDY, HISTORY] }, a.token);
  const res = await t.call('POST', '/v1/me/rec-feedback', { reason: 'topics', note: 'less comedy', add: [1533], remove: [COMEDY] }, a.token);
  assert.equal(res.status, 204);
  const got = (await (await t.call('GET', '/v1/me/interests', undefined, a.token)).json()) as { genreIds: number[] };
  assert.deepEqual(got.genreIds, [HISTORY, 1533]);
  const rows = await t.q<{ reason: string; note: string }>('SELECT reason, note FROM rec_feedback WHERE listener_id = $1', [a.id]);
  assert.deepEqual(rows.map((r) => [r.reason, r.note]), [['topics', 'less comedy']]);
  assert.equal((await t.call('POST', '/v1/me/rec-feedback', { reason: 'bored' }, a.token)).status, 422);
  await t.close();
});

test('signed out: /v1/for-you still answers 401 without interests, and 200 with them', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  for (let n = 0; n < 3; n++) await episode(t, n, COMEDY, threeDaysAgo);
  assert.equal((await t.call('GET', '/v1/for-you')).status, 401);
  const res = await t.call('GET', `/v1/for-you?interests=${COMEDY},${HISTORY}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: { episode: { genreId?: number } }[] };
  assert.ok(body.items.length >= 3 && body.items.every((i) => i.episode.genreId === COMEDY));
  await t.close();
});
