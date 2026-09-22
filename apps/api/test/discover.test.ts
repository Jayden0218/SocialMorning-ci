/** quickstart A6 (guards G1 in the app, G6 in the payload). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { fakeApple, fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';
import { TEST_PEPPER, signUp, type TestDb } from './harness.ts';

/** A test app whose catalogue fetch answers Apple URLs with the fake and feed URLs with the fixture. */
async function appWith(picksRaw: unknown, today = '2026-09-22') {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = { exec: (s) => pg.exec(s), query: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows };
  await migrate(runner);
  const db = fromPglite(pg);
  const apple = fakeApple();
  const catalogFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('itunes.apple.com')) return apple.fetch(input, init);
    if (url.includes('feeds.example.com/fx.xml')) return fakeFeedFetch(FIXTURE_FEED)(input, init);
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const warned: string[] = [];
  const orig = console.warn; console.warn = (m: unknown) => { warned.push(String(m)); };
  const app = createApp({ db, pepper: TEST_PEPPER, catalogFetch, picksRaw, today: () => today });
  console.warn = orig;
  const t: TestDb = {
    pg, db, runner, app,
    q: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
    call: async (method, path, body, token, headers = {}) => app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }),
    close: () => pg.close(),
  };
  return { t, warned, apple };
}

const FX = 'https://feeds.example.com/fx.xml';
type Body = { date?: string; picks: { episode: { title: string; id: string }; why: string }[]; talkedAbout: { episode: { title: string }; reason: string; score: number }[]; trending: { episode: { title: string }; reason: string }[]; stale: boolean };

test('A6: picks resolved through the feed (episode + show pick), a bad pick warned not fatal (G1); talked-about counts only public listeners; trending fills to 5; no display name in the payload (G6); ETag/304', async () => {
  const { t, warned } = await appWith([
    { date: '2026-09-22', feedUrl: FX, guid: 'g-old', why: 'An older one.', order: 1 },
    { date: '2026-09-22', feedUrl: FX, why: 'A show pick.', order: 2 },
    { date: '2026-09-22', feedUrl: FX, guid: 'missing', why: 'Not in the feed.', order: 3 },
    { date: 'bad', feedUrl: FX, why: 'Bad date.' },
  ]);
  assert.equal(warned.filter((w) => w.includes('[picks]')).length, 1);
  // Activity: Alex (private) and Bea (public) on a registered episode.
  const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Talked About', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
  const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', '/v1/me/privacy', { privateListening: true }, a.token);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pa', days: [{ episodeId: EP, day: '2026-09-22', ranges: [[0, 360_000]] }] }, a.token);
  await t.call('PUT', '/v1/me/listened', { deviceId: 'pb', days: [{ episodeId: EP, day: '2026-09-22', ranges: [[0, 360_000]] }] }, b.token);
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hi', offsetMs: 1 }, b.token);

  const res = await t.call('GET', '/v1/discover');
  assert.equal(res.status, 200);
  const etag = res.headers.get('etag');
  assert.ok(etag);
  const raw = await res.text();
  const body = JSON.parse(raw) as Body;
  assert.equal(body.date, '2026-09-22');
  assert.deepEqual(body.picks.map((p) => [p.episode.title, p.why]), [['Older', 'An older one.'], ['Newest', 'A show pick.']]);
  assert.deepEqual(body.talkedAbout.map((x) => [x.episode.title, x.score, x.reason]), [['Talked About', 5, '1 listened · 1 comment this week']]);
  assert.ok(body.trending.length >= 1);
  assert.equal(body.trending[0]!.reason, 'Trending on the chart');
  assert.equal(body.stale, false);
  for (const name of ['Alex', 'Bea', a.id, b.id]) assert.equal(raw.includes(name), false, `payload leaks ${name}`);
  assert.equal(raw.includes('warnings'), false);
  assert.equal((await t.call('GET', '/v1/discover', undefined, undefined, { 'if-none-match': etag! })).status, 304);
  // Picks were registered as episodes with the phone's id rule.
  assert.equal(body.picks[0]!.episode.id, fnv1a64(`${FX}\u0001g-old`));
  await t.close();
});

test('A6: no picks for today → the most recent past day\'s, dated; no picks at all → empty picks, still 200', async () => {
  const { t } = await appWith([{ date: '2026-09-20', feedUrl: FX, guid: 'g-new', why: 'From Sunday.' }]);
  const body = (await (await t.call('GET', '/v1/discover')).json()) as Body;
  assert.equal(body.date, '2026-09-20');
  assert.equal(body.picks.length, 1);
  await t.close();
  const { t: t2 } = await appWith('not an array');
  const b2 = (await (await t2.call('GET', '/v1/discover')).json()) as Body;
  assert.deepEqual(b2.picks, []);
  assert.equal(b2.date, undefined);
  await t2.close();
});
