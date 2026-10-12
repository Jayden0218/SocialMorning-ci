// M27 T019 (G-RT1): the Lambda entry answers a recorded Function-URL event exactly as the Node app answers the same request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb, signUp, TEST_PEPPER, type TestDb } from './harness.ts';
import { fromApp } from '../src/lambda-entry.ts';

const DIR = fileURLToPath(new URL('./fixtures/lambda-events/', import.meta.url));
type LambdaEvent = Record<string, any>;
const load = (name: string, vars: Record<string, string> = {}): LambdaEvent => {
  let text = readFileSync(`${DIR}${name}.json`, 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{{${k}}}`, v);
  return JSON.parse(text) as LambdaEvent;
};

/** The same request as a Web Request (what the Node server hands the app). */
function asRequest(e: LambdaEvent): Request {
  const headers = new Headers(e['headers']);
  if (Array.isArray(e['cookies']) && e['cookies'].length) headers.set('cookie', e['cookies'].join('; '));
  const method: string = e['requestContext'].http.method;
  const url = `https://${e['headers'].host}${e['rawPath']}${e['rawQueryString'] ? `?${e['rawQueryString']}` : ''}`;
  const raw = e['body'] === undefined ? undefined : e['isBase64Encoded'] ? Buffer.from(e['body'], 'base64') : e['body'];
  return new Request(url, { method, headers, ...(raw !== undefined && method !== 'GET' && method !== 'HEAD' && raw.length > 0 ? { body: raw } : {}) });
}

const VARY = new Set(['date', 'x-request-id']);
const norm = (h: Headers | Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of h instanceof Headers ? h.entries() : Object.entries(h)) if (!VARY.has(k.toLowerCase()) && k.toLowerCase() !== 'set-cookie') out[k.toLowerCase()] = v;
  return Object.fromEntries(Object.entries(out).sort());
};
/** A cookie without its (random) value: name + attributes. */
const shape = (c: string): string => c.replace(/^([^=]+)=[^;]*/, '$1=<v>');

async function same(t: TestDb, event: LambdaEvent) {
  const handler = fromApp(t.app);
  const node = await t.app.request(asRequest(event));
  const lambda = (await handler(event as never, {} as never)) as { statusCode: number; headers: Record<string, string>; body: string; isBase64Encoded: boolean; cookies?: string[] };
  const nodeBody = Buffer.from(await node.arrayBuffer());
  const lambdaBody = lambda.isBase64Encoded ? Buffer.from(lambda.body, 'base64') : Buffer.from(lambda.body ?? '');
  // A text answer may carry the server's clock (`serverTime`); mask timestamps so two calls a few ms apart compare equal.
  const view = (b: Buffer) => (lambda.isBase64Encoded ? b : Buffer.from(b.toString().replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>')));
  assert.equal(lambda.statusCode, node.status, 'status');
  assert.deepEqual(norm(lambda.headers), norm(node.headers), 'headers');
  assert.deepEqual((lambda.cookies ?? []).map(shape), node.headers.getSetCookie().map(shape), 'cookies');
  assert.ok(view(lambdaBody).equals(view(nodeBody)), `body: ${lambdaBody.toString().slice(0, 120)} vs ${nodeBody.toString().slice(0, 120)}`);
  return { node, lambda, body: nodeBody };
}

test('Lambda answers = Node answers for the recorded events', async () => {
  const t = await freshDb();
  try {
    const a = await signUp(t);
    await same(t, load('health'));
    await same(t, load('config'));
    const refused = await same(t, load('sign-in-json-body'));
    assert.ok(refused.node.status >= 400 && refused.node.status < 500, 'a wrong password is a 4xx');
    const b64 = await same(t, load('base64-body'));
    assert.equal(b64.node.status, refused.node.status, 'a base64 body is decoded before the app reads it');
    const authed = await same(t, load('authenticated-get', { TOKEN: a.token }));
    assert.equal(authed.node.status, 200);
    const unauth = await same(t, load('authenticated-get', { TOKEN: 'not-a-token' }));
    assert.equal(unauth.node.status, 401);
    const img = await same(t, load('image'));
    assert.equal(img.node.headers.get('content-type'), 'image/png');
    assert.equal(img.lambda.isBase64Encoded, true, 'binary answers come back base64');
    assert.deepEqual([...img.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'a real PNG');
  } finally { await t.close(); }
});

test('Set-Cookie survives: the Studio session cookie arrives in `cookies` with its attributes', async () => {
  const t = await freshDb();
  try {
    await signUp(t, 'studio@example.com', 'Sam');
    // Two Studio sign-ins (a session is single-use here: the cookie replaces the bearer token), one per channel.
    const studioToken = async () => ((await (await t.call('POST', '/v1/auth/sign-in', { email: 'studio@example.com', password: 'correct horse', deviceLabel: 'studio-web' })).json()) as { token: string }).token;
    const handler = fromApp(t.app);
    const node = await t.app.request(asRequest(load('studio-session', { TOKEN: await studioToken() })));
    assert.equal(node.status, 200);
    const nodeCookies = node.headers.getSetCookie();
    assert.equal(nodeCookies.length, 1);
    const lambda = (await handler(load('studio-session', { TOKEN: await studioToken() }) as never, {} as never)) as { statusCode: number; cookies?: string[]; headers: Record<string, string> };
    assert.equal(lambda.statusCode, 200);
    assert.deepEqual((lambda.cookies ?? []).map(shape), nodeCookies.map(shape));
    assert.match(lambda.cookies![0]!, /^sm_studio=[^;]+;.*HttpOnly/i);
    assert.ok(!('set-cookie' in lambda.headers), 'the cookie is in `cookies`, not duplicated in headers');
  } finally { await t.close(); }
});

test('the default handler builds the app from the environment on first use (DynamoDB Local)', async (t) => {
  const endpoint = process.env['DDB_ENDPOINT'];
  if (!endpoint) return t.skip('needs DynamoDB Local (DDB_ENDPOINT)');
  const prefix = `lam${process.pid}x${Math.random().toString(36).slice(2, 7)}`;
  const saved = { ...process.env };
  Object.assign(process.env, { SESSION_PEPPER: TEST_PEPPER, APP_ENV: 'dev', DATA_BACKEND: 'ddb', DDB_ENDPOINT: endpoint, DDB_TABLE_PREFIX: prefix, AWS_REGION: 'ap-southeast-1' });
  const { dbFromConfig, readConfig, tablesFor } = await import('../src/config.ts');
  const { createTableSet, deleteTableSet } = await import('../src/db/ddb/schema.ts');
  const { ddb } = await dbFromConfig(readConfig(process.env));
  await createTableSet(ddb!.raw, tablesFor(prefix));
  try {
    const { handler } = await import('../src/lambda-entry.ts');
    const res = (await handler(load('health') as never, {} as never)) as { statusCode: number; body: string };
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /ok/);
  } finally {
    await deleteTableSet(ddb!.raw, tablesFor(prefix)); ddb!.raw.destroy();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
