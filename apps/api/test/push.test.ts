// Tests new-episode notifications go once per device and respect settings.
/**
 * M10b US3 — notifications are sent: one per show per cycle for a genuinely new episode,
 * never twice (guard G-N1 — break: remove the `ON CONFLICT … DO NOTHING RETURNING` filter
 * in `fanOutNewEpisode`, i.e. tell every follower on every run), never for a back catalogue,
 * never with "New episodes" off; a dead token is dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { fakeFeedFetch } from './fake-apple.ts';
import { dbOf, hybridDb, migratedPg, TEST_PEPPER, signUp, type TestDb } from './harness.ts';
import { pushTokenList } from './ac-neutral.ts';
import { clearCachePrefix } from './lb-seed.ts';

const FX = 'https://feeds.example.com/px.xml';
const JOB = 'job-token-not-secret';
const rfc = (ms: number) => new Date(ms).toUTCString();
const feedXml = (items: { guid: string; title: string; at: number }[]) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Push Show</title>
${items.map((i) => `<item><title>${i.title}</title><guid>${i.guid}</guid><pubDate>${rfc(i.at)}</pubDate><enclosure url="https://cdn/${i.guid}.mp3" length="1" type="audio/mpeg"/></item>`).join('\n')}
</channel></rss>`;

async function appWith(initial: { guid: string; title: string; at: number }[], dead: Set<string> = new Set()) {
  const { pg, runner } = await migratedPg();
  // M26 lane AC: hybrid on DynamoDB under TEST_BACKEND=ddb (account on DynamoDB, the rest on PGlite).
  const hy = await hybridDb(dbOf(pg));
  const db = hy.db;
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
    call: async (method, path, body, token, headers = {}) => {
      const r = await app.request(path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
      await hy.drain();
      return r;
    },
    close: async () => { await hy.close(); await pg.close(); },
    ...(hy.store ? { store: hy.store } : {}),
  };
  return { t, sent, state };
}

/** One hourly cycle. The feed cache lives an hour (TTL.feed), so a real cycle reads the feed fresh; here it is cleared. */
const rebuild = async (t: TestDb) => {
  await clearCachePrefix(t, 'feed:'); // M26: the cache is lane LB's (sm-cache under ddb)
  return t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` });
};
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
  assert.deepEqual(await pushTokenList(t), [TOKEN_A], 'the dead token is gone, the live one kept');

  assert.equal((await t.call('DELETE', `/v1/me/push-tokens/${encodeURIComponent(TOKEN_A)}`, undefined, a.token)).status, 204);
  assert.equal((await pushTokenList(t)).length, 0, 'removed at sign-out');
  await t.close();
});

/**
 * G-N1 on its own: two cycles that BOTH see the episode as new (two overlapping rebuild runs
 * read the feed before either registered it) must still tell each device once. First-seen
 * detection cannot stop this; only `push_sent`'s key can.
 */
test('G-N1: the send step called twice for one episode tells each device once', async () => {
  const { t, sent } = await appWith([]);
  const a = await signUp(t, 'a@example.com', 'Alex');
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FX, createdAt: new Date().toISOString() }] }, a.token);
  await t.call('POST', '/v1/me/push-tokens', { token: TOKEN_A, platform: 'android' }, a.token);
  const { fanOutNewEpisode } = await import('../src/db/repos/account/push.ts');
  const f = (async (_i: string | URL | Request, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as { to: string; title: string; body: string; data: Record<string, string> }[];
    sent.push(...batch);
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }), { status: 200 });
  }) as typeof fetch;
  const ep = { id: 'ep-overlap', feedUrl: FX, title: 'Overlap', showTitle: 'Push Show' };
  await fanOutNewEpisode(t.db, f, ep);
  await fanOutNewEpisode(t.db, f, ep);
  assert.equal(sent.length, 1);
  await t.close();
});
