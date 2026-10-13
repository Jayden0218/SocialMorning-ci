// M28 US1: two compare servers on one DynamoDB Local seed agree (0 different); a changed answer is caught; no email or token is printed.
/**
 * Two `compare-server` instances run in-process on ONE seeded table set; `runCompare` asks both the 20 routes as 5 listeners.
 * - G-M28-CMP : one side's fetch answers `/v1/me` with a changed `followerCount` -> `1 different`, exit 1.
 * - G-M28-CMP2: a compared field holds an email -> the difference is reported, and the output holds no address, no token, no cookie name.
 * Also: the start refusals of the contract, and `compare.ts` refusing a non-localhost address.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { createDdbClients, type Clients } from '../src/db/ddb/client.ts';
import { createStore, prefixedTables, type Tables } from '../src/db/ddb/store.ts';
import { createTableSet, deleteTableSet } from '../src/db/ddb/schema.ts';
import { withStore } from '../src/db/backend-ddb.ts';
import { drainOutbox } from '../src/jobs/outbox.ts';
import { seedDemo } from '../scripts/seed-demo.ts';
import { checkCompareStart, startCompareServer, type Running } from '../scripts/compare-server.ts';
import { runCompare } from '../scripts/compare.ts';
import { compareFetch } from '../scripts/compare-http.ts';

const ENDPOINT = process.env['DDB_ENDPOINT'];
const PREFIX = `m28cmp${Math.random().toString(36).slice(2, 8)}`;
const env = { ...process.env, DDB_ENDPOINT: ENDPOINT, APP_ENV: 'dev' };
let clients: Clients;
let tables: Tables;
let oldSide: Running;
let newSide: Running;
const tokens: string[] = [];

/** The same request, but the session routes are listened to: every token minted is remembered so the output can be scanned for it. */
const spyingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (String(input).endsWith('/_compare/session')) tokens.push(((await res.clone().json()) as { token: string }).token);
  return res;
};

/** `fetch` that rewrites the JSON body of one path (the change a guard makes on one side). */
const changing = (path: string | RegExp, edit: (body: Record<string, unknown>) => void): typeof fetch => async (input, init) => {
  const res = await spyingFetch(input, init);
  const at = new URL(String(input)).pathname;
  if (typeof path === 'string' ? at !== path : !path.test(at)) return res;
  const body = (await res.json()) as Record<string, unknown>;
  edit(body);
  return new Response(JSON.stringify(body), { status: res.status, headers: { 'content-type': 'application/json' } });
};

before(async () => {
  assert.ok(ENDPOINT, 'DDB_ENDPOINT (DynamoDB Local) is required');
  clients = createDdbClients({ endpoint: ENDPOINT });
  tables = prefixedTables(PREFIX);
  await createTableSet(clients.raw, tables);
  const store = createStore({ clients, tables, secret: 'm28-compare-seed' });
  const db = withStore(undefined, store);
  let t = Date.now();
  const seedStore = { ...store, clock: { now: () => t } };
  await seedDemo(withStore(undefined, seedStore), { password: 'compare-seed-password-1', setClock: (ms) => { t = ms; } });
  await drainOutbox(store).catch(() => undefined);
  void db;
  oldSide = await startCompareServer({ prefix: PREFIX, aws: false, port: 0 }, env);
  newSide = await startCompareServer({ prefix: PREFIX, aws: false, port: 0 }, env);
});

after(async () => {
  await oldSide?.close();
  await newSide?.close();
  if (clients) {
    await deleteTableSet(clients.raw, tables);
    assert.ok(!((await clients.raw.send(new ListTablesCommand({}))).TableNames ?? []).includes(tables.main), 'the scratch tables are dropped');
    clients.raw.destroy();
  }
});

const run = (o: Partial<Parameters<typeof runCompare>[0]> = {}) =>
  runCompare({ oldUrl: oldSide.url, newUrl: newSide.url, sample: 5, rereadMs: 50, fetchOld: spyingFetch, fetchNew: spyingFetch, ...o });

test('two servers on one seed: 0 different, exit 0', async () => {
  const r = await run();
  assert.equal(r.exit, 0, r.lines.join('\n'));
  const last = r.lines.at(-1)!;
  assert.match(last, /^compared 20×5 answers; ignored \d+ fields; 0 different; \d+ order-only$/);
  assert.equal(r.different, 0);
  assert.equal(r.listeners, 5);
});

// /v1/me carries no follower count (its `listener` object is the account); the count lives in `profile.followers` of /v1/listeners/:me.
test('G-M28-CMP: a changed follower count on one side is 1 different, exit 1', async () => {
  const r = await run({ sample: 1, routes: ['/v1/listeners/:me'], fetchNew: changing(/^\/v1\/listeners\/[^/]+$/, (b) => { const o = b['profile'] as Record<string, unknown>; o['followers'] = Number(o['followers'] ?? 0) + 7; }) });
  assert.equal(r.exit, 1, r.lines.join('\n'));
  assert.equal(r.different, 1);
  assert.match(r.lines.at(-1)!, /; 1 different; /);
  assert.ok(r.lines.some((l) => /^DIFF \/v1\/listeners\/:me listener=\S+ path=\$\.profile\.followers kind=value old=\d+ new=\d+$/.test(l)), r.lines.join('\n'));
});

test('G-M28-CMP2: a compared field holding an email is reported but never printed; no token or cookie either', async () => {
  const seen: string[] = [];
  const r = await run({
    sample: 1, routes: ['/v1/me'], log: (l) => seen.push(l),
    fetchNew: changing('/v1/me', (b) => { const o = (b['listener'] ?? b) as Record<string, unknown>; o['email'] = 'someone.else@example.com'; o['displayName'] = 'Someone Else'; }),
  });
  assert.equal(r.exit, 1, 'the changed email is a difference');
  assert.ok(r.lines.some((l) => /path=\$\S*email kind=value/.test(l)), r.lines.join('\n'));
  const text = [...r.lines, ...seen].join('\n');
  assert.doesNotMatch(text, /@[^ ]+\./, 'no address in the output');
  assert.doesNotMatch(text, /Bearer/);
  assert.doesNotMatch(text, /sm_session/);
  assert.doesNotMatch(text, /Someone Else/, 'no name in the output');
  assert.ok(tokens.length >= 2, 'the sessions were spied on');
  for (const tk of tokens) assert.ok(!text.includes(tk), 'a minted token is never printed');
});

test('a clean run prints no address or token either', async () => {
  const r = await run({ sample: 2 });
  const text = r.lines.join('\n');
  assert.doesNotMatch(text, /@[^ ]+\./);
  for (const tk of tokens) assert.ok(!text.includes(tk));
});

test('sessions are ended: a minted token no longer opens /v1/me', async () => {
  const mint = await fetch(`${newSide.url}/_compare/session`, { method: 'POST', body: JSON.stringify({ listenerId: ((await (await fetch(`${newSide.url}/_compare/sample?n=1`)).json()) as { ids: string[] }).ids[0] }) });
  const { token } = (await mint.json()) as { token: string };
  assert.equal((await fetch(`${newSide.url}/v1/me`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  await fetch(`${newSide.url}/_compare/session/end`, { method: 'POST', body: JSON.stringify({ token }) });
  assert.equal((await fetch(`${newSide.url}/v1/me`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
});

test('compare.ts refuses an address that is not localhost, and the same server twice (exit 2)', async () => {
  const far = await runCompare({ oldUrl: 'http://example.com:4101', newUrl: newSide.url, sample: 1 });
  assert.equal(far.exit, 2);
  assert.match(far.lines.join('\n'), /only localhost/);
  const same = await runCompare({ oldUrl: newSide.url, newUrl: newSide.url, sample: 1 });
  assert.equal(same.exit, 2);
  const none = await runCompare({ oldUrl: oldSide.url, newUrl: newSide.url });
  assert.equal(none.exit, 2);
});

test('the /_compare routes answer only for a local host, and the server listens on 127.0.0.1', async () => {
  assert.match(newSide.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const hooks = { app: { fetch: () => new Response('app', { status: 418 }) }, mint: async () => 't', sample: async () => ['a'], episode: async () => 'e', byEmail: async () => 'a' };
  const f = compareFetch(hooks);
  assert.equal((await f(new Request('http://127.0.0.1:1/_compare/sample?n=1'))).status, 200);
  assert.equal((await f(new Request('http://example.com/_compare/sample?n=1'))).status, 418, 'a non-local host reaches the app, which has no such route');
});

test('start refusals: prod without --aws, --aws without credentials, a non-local endpoint', () => {
  const ok = { DDB_ENDPOINT: 'http://localhost:8000' };
  assert.throws(() => checkCompareStart({ prefix: 'x1', aws: false, port: 0 }, { ...ok, APP_ENV: 'prod' }), /APP_ENV=prod/);
  assert.throws(() => checkCompareStart({ prefix: 'x1', aws: true, port: 0 }, {}), /credentials/);
  assert.throws(() => checkCompareStart({ prefix: 'x1', aws: false, port: 0 }, { DDB_ENDPOINT: 'https://dynamodb.ap-southeast-1.amazonaws.com' }), /not a local endpoint/);
  assert.throws(() => checkCompareStart({ prefix: 'x1', aws: false, port: 0 }, {}), /DDB_ENDPOINT/);
  assert.throws(() => checkCompareStart({ prefix: 'X-1', aws: false, port: 0 }, ok), /--prefix/);
  assert.deepEqual(checkCompareStart({ prefix: 'sm', aws: true, port: 0 }, { AWS_PROFILE: 'sm-claude-ops' }).tables, { main: 'sm-main', events: 'sm-events', cache: 'sm-cache' });
  assert.equal(checkCompareStart({ prefix: 'reh1', aws: false, port: 0 }, ok).tables.main, 'reh1_main');
});
