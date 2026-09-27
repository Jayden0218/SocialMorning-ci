/**
 * M10b US3 — notifications are sent: one per show per cycle for a genuinely new episode,
 * never twice (guard G-N1 — break: remove the `ON CONFLICT … DO NOTHING RETURNING` filter
 * in `fanOutNewEpisode`, i.e. tell every follower on every run), never for a back catalogue,
 * never with "New episodes" off; a dead token is dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite } from '../src/db/db.ts';
import { createApp } from '../src/app.ts';
import { fakeFeedFetch } from './fake-apple.ts';
import { TEST_PEPPER, signUp, type TestDb } from './harness.ts';

const FX = 'https://feeds.example.com/px.xml';
const JOB = 'job-token-not-secret';
const rfc = (ms: number) => new Date(ms).toUTCString();
const feedXml = (items: { guid: string; title: string; at: number }[]) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Push Show</title>
${items.map((i) => `<item><title>${i.title}</title><guid>${i.guid}</guid><pubDate>${rfc(i.at)}</pubDate><enclosure url="https://cdn/${i.guid}.mp3" length="1" type="audio/mpeg"/></item>`).join('\n')}
</channel></rss>`;

async function appWith(initial: { guid: string; title: string; at: number }[], dead: Set<string> = new Set()) {
  const pg = new PGlite({ extensions: { citext } });
  const runner: MigrationRunner = { exec: (s) => pg.exec(s), query: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows };
  await migrate(runner);
  const db = fromPglite(pg);
  const state = { items: initial };
  const sent: { to: string; title: string; body: string; data: Record<string, string> }[] = [];
  const catalogFetch = (async (input: string | URL | Request, init?: RequestInit) =>
    String(input).includes(FX) ? fakeFeedFetch(feedXml(state.items))(input, init) : new Response('nope', { status: 404 })) as typeof fetch;
  const pushFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as typeof sent;
    sent.push(...batch);
    return new Response(JSON.stringify({ data: batch.map((m) => (dead.has(m.to) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' })) }), { status: 200 });
  }) as typeof fetch;
  const app = createApp({ db, pepper: TEST_PEPPER, catalogFetch, pushFetch, picksRaw: [], today: () => '2026-09-27', jobToken: JOB });
  const t: TestDb = {
    pg, db, runner, app,
    q: async <T,>(s: string, p?: unknown[]) => (await pg.query<T>(s, p)).rows,
    call: async (method, path, body, token, headers = {}) => app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }),
    close: () => pg.close(),
  };
  return { t, sent, state };
}

const rebuild = (t: TestDb) => t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` });
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbb]';

test('G-N1: a new episode notifies each follower once — the next cycle does not repeat it — and the back catalogue never notifies', async () => {
  const now = Date.now();
  const { t, sent, state } = await appWith([{ guid: 'old1', title: 'Old one', at: now - 30 * 86_400_000 }]);
  const a = await signUp(t, 'a@example.com', 'Alex');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: new Date(now - 60_000).toISOString() }] }, a.token);
  assert.equal((await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_A, platform: 'android' }, a.token)).status, 204);

  await rebuild(t);
  assert.equal(sent.length, 0, 'the first read of a feed registers its back catalogue silently');

  state.items = [{ guid: 'n2', title: 'Newer', at: now - 1_800_000 }, { guid: 'n1', title: 'New', at: now - 3_600_000 }, ...state.items];
  await rebuild(t);
  assert.equal(sent.length, 1, 'two new episodes in one cycle → one notification (the newest)');
  assert.equal(sent[0]?.to, TOKEN_A);
  assert.equal(sent[0]?.body, 'Newer');
  assert.equal(sent[0]?.title, 'Push Show');
  assert.ok(sent[0]?.data['episodeId']);

  await rebuild(t);
  assert.equal(sent.length, 1, 'the next cycle does not tell anyone again');
  await t.close();
});

test('"New episodes" off → nothing; a DeviceNotRegistered token is dropped; tokens need an account', async () => {
  const now = Date.now();
  const { t, sent, state } = await appWith([], new Set([TOKEN_B]));
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  for (const who of [a, b]) await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: new Date(now - 60_000).toISOString() }] }, who.token);
  await rebuild(t); // empty feed: nothing known yet
  await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_A, platform: 'ios' }, a.token);
  await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_B, platform: 'android' }, b.token);
  assert.equal((await t.call('PUT', '/v1/me/push-prefs', { newEpisodes: false, popular: true }, a.token)).status, 204);
  assert.equal((await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_A, platform: 'ios' })).status, 401);
  assert.equal((await t.call('POST', '/v1/me/push-tokens', { token: 'not-a-token', platform: 'ios' }, a.token)).status, 422);

  state.items = [{ guid: 'n1', title: 'New', at: now - 600_000 }];
  await rebuild(t);
  assert.deepEqual(sent.map((m) => m.to), [TOKEN_B], 'only the listener with New episodes on');
  const left = await t.q<{ token: string }>('SELECT token FROM push_tokens ORDER BY token');
  assert.deepEqual(left.map((r) => r.token), [TOKEN_A], 'the dead token is gone, the live one kept');

  assert.equal((await t.call('DELETE', `/v1/me/push-tokens/${encodeURIComponent(TOKEN_A)}`, undefined, a.token)).status, 204);
  assert.equal((await t.q('SELECT token FROM push_tokens')).length, 0, 'removed at sign-out');
  await t.close();
});
