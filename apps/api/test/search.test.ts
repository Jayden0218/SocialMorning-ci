/** quickstart A7: shows + episodes; the episode call failing alone; both failing; Apple's 429; punctuation-only; throttle. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { fnv1a64 } from '@socialmorning/social-core';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { fakeApple, type FakeMode } from './fake-apple.ts';
import { TEST_PEPPER } from './harness.ts';

async function appWith(mode: FakeMode = {}) {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = { exec: (s) => pg.exec(s), query: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows };
  await migrate(runner);
  const apple = fakeApple(mode);
  const app = createApp({ db: fromPglite(pg), pepper: TEST_PEPPER, catalogFetch: apple.fetch, picksRaw: [] });
  const get = (q: string, ip = '1.1.1.1') => app.request(`/v1/search?q=${encodeURIComponent(q)}`, { headers: { 'x-forwarded-for': ip } });
  return { get, apple, close: () => pg.close() };
}
type Body = { shows: { title: string; feedUrl: string }[]; episodes: { title: string; id: string; guid: string }[]; episodeSearch: string; error?: string; retryAfterSeconds?: number };

test('A7: shows and episodes, the show without a feed dropped, episodes registered with the phone\'s id; cached per term', async () => {
  const t = await appWith();
  const r = await t.get('Casey Wants to Believe');
  assert.equal(r.status, 200);
  const b = (await r.json()) as Body;
  assert.deepEqual(b.shows.map((s) => s.title), ['Reply All']);
  assert.deepEqual(b.episodes.map((e) => e.title), ['Casey Wants to Believe']);
  assert.equal(b.episodes[0]!.id, fnv1a64('https://feeds.megaphone.fm/replyall\u0001c0633378-b188-11ef-bcb2-677967fca1e9'));
  assert.equal(b.episodeSearch, 'ok');
  const before = t.apple.calls.length;
  await t.get('casey  wants to believe ');
  assert.equal(t.apple.calls.length, before); // normalised term → the cache
  await t.close();
});

test('A7: the episode call failing alone → shows + unavailable; both failing → 503; Apple 429 → 429 locked; punctuation-only → empty, no call', async () => {
  const a = await appWith({ episodes: 'fail' });
  const b1 = (await (await a.get('reply all')).json()) as Body;
  assert.equal(b1.shows.length, 1); assert.deepEqual(b1.episodes, []); assert.equal(b1.episodeSearch, 'unavailable');
  await a.close();
  const both = await appWith({ episodes: 'fail', shows: 'fail' });
  assert.equal((await both.get('x')).status, 503);
  await both.close();
  const rl = await appWith({ all: '429' });
  const r = await rl.get('x');
  assert.equal(r.status, 429);
  assert.equal(((await r.json()) as Body).retryAfterSeconds, 30);
  await rl.close();
  const p = await appWith();
  const r2 = await p.get('???');
  assert.deepEqual(await r2.json(), { shows: [], episodes: [], episodeSearch: 'ok', source: { shows: 'apple' } });
  assert.equal(p.apple.calls.length, 0);
  assert.equal((await p.get('')).status, 422);
  assert.equal((await p.get('x'.repeat(101))).status, 422);
  await p.close();
});

test('A7: the 11th search in a minute from one caller is 429; another caller is fine', async () => {
  const t = await appWith();
  for (let i = 0; i < 10; i++) assert.equal((await t.get(`term ${i}`)).status, 200);
  assert.equal((await t.get('term 11')).status, 429);
  assert.equal((await t.get('term 11', '2.2.2.2')).status, 200);
  await t.close();
});
