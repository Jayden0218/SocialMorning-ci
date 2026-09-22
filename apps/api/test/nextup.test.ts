/** quickstart A8: 3–8 items with reasons; the current and the viewer's finished episodes absent; no display names. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { fnv1a64 } from '@socialmorning/social-core';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { fakeApple, fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';
import { TEST_PEPPER, signUp, type TestDb } from './harness.ts';

const FX = 'https://feeds.example.com/fx.xml';
const E = (guid: string) => fnv1a64(`${FX}\u0001${guid}`);
type Item = { episode: { id: string; title: string }; reason: string; label: string };

async function build() {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = { exec: (s) => pg.exec(s), query: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows };
  await migrate(runner);
  const apple = fakeApple();
  const catalogFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('itunes.apple.com')) return apple.fetch(input, init);
    if (url.includes(FX)) return fakeFeedFetch(FIXTURE_FEED)(input, init);
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const app = createApp({ db: fromPglite(pg), pepper: TEST_PEPPER, catalogFetch, picksRaw: [] });
  const t: TestDb = {
    pg, db: fromPglite(pg), runner, app,
    q: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
    call: async (method, path, body, token, headers = {}) => app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }),
    close: () => pg.close(),
  };
  return t;
}

test('A8: four sources merged with reasons; the current episode and the viewer\'s finished one absent; anonymous keeps the finished one; no names', async () => {
  const t = await build();
  // Three registered episodes of the fixture show; the fixture feed lists g-new and g-old.
  for (const [guid, title] of [['g-old', 'Older'], ['g-new', 'Newest'], ['g-x', 'Extra']] as const) {
    await t.call('PUT', `/v1/episodes/${E(guid)}`, { feedUrl: FX, guid, title, showTitle: 'Fixture Show', enclosureUrl: `https://cdn/${guid}.mp3`, durationMs: 1_800_000 });
  }
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cee');
  // A and B listened to g-old and g-x (also-listened for g-old → g-x); C is private and listened to g-new (must not count).
  await t.call('PUT', '/v1/me/privacy', { privateListening: true }, c.token);
  for (const [tok, dev, guids] of [[a.token, 'pa', ['g-old', 'g-x']], [b.token, 'pb', ['g-old', 'g-x']], [c.token, 'pc', ['g-old', 'g-new']]] as const) {
    await t.call('PUT', '/v1/me/listened', { deviceId: dev, days: guids.map((g) => ({ episodeId: E(g), day: '2026-09-22', ranges: [[0, 360_000]] })) }, tok);
  }
  await t.call('POST', `/v1/episodes/${E('g-x')}/comments`, { body: 'talk', offsetMs: 1 }, b.token);
  // A finished g-x.
  await t.call('PUT', '/v1/me/positions', { deviceId: 'pa', observations: [{ episodeId: E('g-x'), offsetMs: 1_800_000, finished: true, progressSeq: 1, explicitSeek: false }] }, a.token);

  const anon = await t.call('GET', `/v1/episodes/${E('g-old')}/next-up`);
  assert.equal(anon.status, 200);
  const rawAnon = await anon.text();
  const itemsAnon = (JSON.parse(rawAnon) as { items: Item[] }).items;
  const titles = itemsAnon.map((i) => i.episode.title);
  assert.ok(!titles.includes('Older'), 'the current episode is excluded');
  assert.ok(titles.includes('Extra'), 'g-x via also-listened');
  assert.equal(itemsAnon.find((i) => i.episode.title === 'Extra')!.reason, 'alsoListened');
  assert.ok(titles.includes('Newest'), 'g-new via new-on-show (C is private, so not via also-listened)');
  assert.equal(itemsAnon.find((i) => i.episode.title === 'Newest')!.reason, 'newOnShow');
  assert.ok(itemsAnon.some((i) => i.reason === 'trendingInCategory' && i.label === 'Trending in Technology'), 'chart items carry the genre');
  assert.ok(itemsAnon.length >= 3 && itemsAnon.length <= 8);
  for (const name of ['Alex', 'Bea', 'Cee', a.id, b.id, c.id]) assert.equal(rawAnon.includes(name), false, `leaks ${name}`);

  const asA = (await (await t.call('GET', `/v1/episodes/${E('g-old')}/next-up`, undefined, a.token)).json()) as { items: Item[] };
  assert.ok(!asA.items.map((i) => i.episode.title).includes('Extra'), 'A finished g-x: excluded for A');
  assert.equal((await t.call('GET', '/v1/episodes/unknown/next-up')).status, 404);
  await t.close();
});
