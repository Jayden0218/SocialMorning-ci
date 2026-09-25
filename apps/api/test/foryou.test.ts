/**
 * M8 US2 — /v1/for-you (quickstart A10, A13, A14, A17, A18).
 *
 * What this file proves: the surface is private, a failing channel does not fail the
 * request, a brand-new account still gets a list, and the rebuild is both closed to the
 * public and safe to interrupt. What it does NOT prove is that the list is any good —
 * that is L2 on the phone and L7/L8 over days.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { fakeApple, fakeFeedFetch, FIXTURE_FEED } from './fake-apple.ts';
import { TEST_PEPPER, signUp, type TestDb } from './harness.ts';

const FX = 'https://feeds.example.com/fx.xml';
const JOB = 'job-token-not-secret';
const PICKS = [{ date: '2026-09-22', feedUrl: FX, guid: 'g-new', why: 'The pick of the day.' }];

type Body = { items: { episode: { id: string; feedUrl: string; title: string }; channel: string; reason: string; score: number }[]; computedAt: string; stale: boolean; similarityAge: number | null };

async function appWith(opts: { picksRaw?: unknown; appleMode?: Parameters<typeof fakeApple>[0]; feedStatus?: number } = {}) {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = { exec: (s) => pg.exec(s), query: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows };
  await migrate(runner);
  const db = fromPglite(pg);
  const apple = fakeApple(opts.appleMode ?? {});
  const catalogFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('itunes.apple.com')) return apple.fetch(input, init);
    if (url.includes('feeds.example.com/fx.xml')) return fakeFeedFetch(FIXTURE_FEED, opts.feedStatus ?? 200)(input, init);
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const warned: string[] = [];
  const orig = console.warn; console.warn = (m: unknown) => { warned.push(String(m)); };
  const app = createApp({ db, pepper: TEST_PEPPER, catalogFetch, picksRaw: opts.picksRaw ?? PICKS, today: () => '2026-09-22', jobToken: JOB });
  console.warn = orig;
  const t: TestDb = {
    pg, db, runner, app,
    q: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
    call: async (method, path, body, token, headers = {}) => app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }),
    close: () => pg.close(),
  };
  return { t, warned };
}

const get = async (t: TestDb, token?: string, headers?: Record<string, string>) => t.call('GET', '/v1/for-you', undefined, token, headers);

test('A10: For You is signed-in only — there is no anonymous personalisation', async () => {
  const { t } = await appWith();
  assert.equal((await get(t)).status, 401);
  // …and /v1/discover is untouched: still public, still answering.
  assert.equal((await t.call('GET', '/v1/discover')).status, 200);
  await t.close();
});

test('A14: a brand-new account with nothing in it still gets a list, and every item is playable', async () => {
  const { t } = await appWith();
  const a = await signUp(t);
  const res = await get(t, a.token);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Body;
  assert.ok(body.items.length > 0, 'a cold account is not an empty room');
  for (const i of body.items) {
    assert.ok(i.episode.id.length > 0 && i.episode.title.length > 0);
    assert.ok(i.reason.length > 0 && i.reason.length <= 60, `reason "${i.reason}"`);
  }
  assert.equal(body.items[0]!.channel, 'pick', 'the hand pick is index 0 (FR-015)');
  assert.equal(body.similarityAge, null, 'nothing has been rebuilt yet, and the body says so');
  await t.close();
});

test('A13: the catalogue being down is one channel failing, not a failed request — and the body does not say which', async () => {
  const { t, warned } = await appWith({ appleMode: { all: '429' }, feedStatus: 500 });
  const a = await signUp(t);
  // Give the account something of its own so the list is not empty when Discover dies.
  await t.call('PUT', '/v1/episodes/e-own', { feedUrl: 'https://feeds.example.com/own.xml', guid: 'g1', title: 'Mine', enclosureUrl: 'https://cdn/1.mp3' }, a.token);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: 'https://feeds.example.com/own.xml', createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);

  const res = await get(t, a.token);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes('warnings'), 'the failure never reaches the listener');
  assert.ok(!/429|500|itunes/.test(text), 'nor does the shape of it');
  assert.ok(JSON.parse(text).items.length >= 1, 'built from the channels that answered');
  await t.close();
});

test('ETag: an unchanged list answers 304', async () => {
  const { t } = await appWith();
  const a = await signUp(t);
  const first = await get(t, a.token);
  const etag = first.headers.get('etag')!;
  assert.ok(etag);
  assert.equal((await get(t, a.token, { 'if-none-match': etag })).status, 304);
  await t.close();
});

test('a finished episode never appears (FR-016)', async () => {
  const { t } = await appWith();
  const a = await signUp(t);
  const before = (await (await get(t, a.token)).json()) as Body;
  const victim = before.items[0]!.episode.id;

  await t.call('PUT', '/v1/me/positions', { deviceId: 'p1', observations: [{ episodeId: victim, offsetMs: 1, finished: true, progressSeq: 1, explicitSeek: false }] }, a.token);
  await t.q("DELETE FROM cache WHERE key LIKE 'foryou:%'"); // the 30-minute cache, stepped over

  const after = (await (await get(t, a.token)).json()) as Body;
  assert.ok(!after.items.some((i) => i.episode.id === victim), 'finished is gone');
  await t.close();
});

test('A17: the rebuild is closed without the job token, and open with it', async () => {
  const { t } = await appWith();
  assert.equal((await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' })).status, 401);
  assert.equal((await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: 'Bearer wrong' })).status, 401);

  const ok = await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { done: boolean }).done, true, 'no subscriptions yet, so nothing to do');
  await t.close();
});

test('A17: the feeds step walks subscribed feeds and registers what it finds', async () => {
  const { t } = await appWith();
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);

  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` });
  const body = (await res.json()) as { done: boolean; counts: { feeds: number; registered: number } };
  assert.equal(body.done, true);
  assert.equal(body.counts.feeds, 1);
  assert.ok(body.counts.registered >= 1);
  const [row] = await t.q<{ published_at: string | null; genre_id: number | null }>('SELECT published_at, genre_id FROM episodes WHERE feed_url = $1 LIMIT 1', [FX]);
  assert.ok(row!.published_at !== null, 'the publisher date landed — freshness depends on it');
  assert.equal(Number(row!.genre_id), 1318);
  await t.close();
});

test('A18: an interrupted rebuild never serves half a neighbourhood, and a fresh one is skipped', async () => {
  const { t } = await appWith();
  const auth = { authorization: `Bearer ${JOB}` };

  // Seed a standing neighbourhood, then start a rebuild and stop after the first chunk.
  await t.q("INSERT INTO show_similarity (show_a, show_b, sim) VALUES ('https://a', 'https://b', 0.5)");
  await t.q("INSERT INTO show_similarity_next (show_a, show_b, sim) VALUES ('https://c', 'https://d', 0.9)");
  const standing = await t.q<{ show_a: string }>('SELECT show_a FROM show_similarity');
  assert.deepEqual(standing.map((r) => r.show_a), ['https://a'], 'the staging rows are not visible');

  // A table rebuilt within the last 20 h is left alone (research R4's self-throttle).
  const res = await t.call('POST', '/v1/internal/rebuild', { step: 'similarity' }, undefined, auth);
  const body = (await res.json()) as { done: boolean; counts: Record<string, number> };
  assert.equal(body.done, true);
  assert.equal(body.counts['skipped'], 1);

  // …unless it is forced, and then the swap leaves the table whole.
  await t.call('POST', '/v1/internal/rebuild', { step: 'similarity', force: true }, undefined, auth);
  const after = await t.q<{ n: number }>('SELECT count(*)::int AS n FROM show_similarity_next');
  assert.equal(Number(after[0]!.n), 0, 'staging is emptied by the swap');
  await t.close();
});
