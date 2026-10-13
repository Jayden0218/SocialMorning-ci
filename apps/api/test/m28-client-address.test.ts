// M28 US2 (T016): per-address limits count the address AWS reports (or the Vercel edge proxy signs), never one a client sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { fromApp, trustedAddress } from '../src/lambda-entry.ts';
import { bumpRateCounter } from '../src/db/repos/account/rate-limits.ts';
import { HOUR_MS } from '../src/auth/rate.ts';

type Ev = Record<string, any>;
/** A Function URL (payload 2.0) request for `POST /v1/auth/code`, as AWS would deliver it. */
const codeEvent = (n: number, headers: Record<string, string>, sourceIp: string): Ev => ({
  version: '2.0', routeKey: '$default', rawPath: '/v1/auth/code', rawQueryString: '',
  headers: { host: 'abc123.lambda-url.ap-southeast-1.on.aws', 'content-type': 'application/json', ...headers },
  requestContext: { accountId: 'anonymous', apiId: 'abc123', domainName: 'abc123.lambda-url.ap-southeast-1.on.aws', http: { method: 'POST', path: '/v1/auth/code', protocol: 'HTTP/1.1', sourceIp, userAgent: 'test' }, requestId: 'r', routeKey: '$default', stage: '$default', time: 'x', timeEpoch: 0 },
  body: JSON.stringify({ email: `person${n}@example.com` }), isBase64Encoded: false,
});
const status = async (h: ReturnType<typeof fromApp>, e: Ev): Promise<number> => ((await h(e as never, {} as never)) as { statusCode: number }).statusCode;
/** How many requests the counter for `addr` holds now (this probe adds one and takes it off again in the count). */
const counted = async (t: Awaited<ReturnType<typeof freshDb>>, addr: string): Promise<number> =>
  ((await bumpRateCounter(t.db, `code:ip:${addr}`, new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS)))[0]?.count ?? 0) - 1;

async function withSecret<T>(secret: string | undefined, fn: () => Promise<T>): Promise<T> {
  const was = process.env['EDGE_SECRET'];
  if (secret === undefined) delete process.env['EDGE_SECRET']; else process.env['EDGE_SECRET'] = secret;
  try { return await fn(); } finally { if (was === undefined) delete process.env['EDGE_SECRET']; else process.env['EDGE_SECRET'] = was; }
}

test('G-M28-IP: a forged x-forwarded-for is ignored on Lambda; the 11th code request from sourceIp is refused', async () => {
  const t = await freshDb();
  try {
    await withSecret(undefined, async () => {
      const h = fromApp(t.app);
      for (let i = 1; i <= 10; i++) assert.equal(await status(h, codeEvent(i, { 'x-forwarded-for': '1.2.3.4' }, '5.6.7.8')), 200, `request ${i}`);
      assert.equal(await status(h, codeEvent(11, { 'x-forwarded-for': '1.2.3.4' }, '5.6.7.8')), 429, 'the 11th is refused');
      assert.equal(await counted(t, '5.6.7.8'), 11, 'the counter key is code:ip:5.6.7.8');
      assert.equal(await counted(t, '1.2.3.4'), 0, 'the forged address was never counted');
    });
  } finally { await t.close(); }
});

test('a client cannot send the entry\'s own headers: x-sm-trusted-ip / x-sm-client-ip are dropped on Lambda', async () => {
  const t = await freshDb();
  try {
    await withSecret('s3cret-value', async () => {
      const h = fromApp(t.app);
      await status(h, codeEvent(1, { 'x-sm-trusted-ip': '9.9.9.9', 'X-SM-Client-IP': '8.8.8.8' }, '5.6.7.8'));
      assert.equal(await counted(t, '5.6.7.8'), 1);
      assert.equal(await counted(t, '9.9.9.9'), 0);
      assert.equal(await counted(t, '8.8.8.8'), 0, 'a client address without the edge secret is not believed');
    });
  } finally { await t.close(); }
});

test('G-M28-EDGE: x-sm-client-ip counts only with the right x-sm-edge secret', async () => {
  const t = await freshDb();
  try {
    await withSecret('s3cret-value', async () => {
      const h = fromApp(t.app);
      await status(h, codeEvent(1, { 'x-sm-edge': 's3cret-value', 'x-sm-client-ip': '7.7.7.7' }, '76.76.21.21')); // the Vercel proxy
      await status(h, codeEvent(2, { 'x-sm-edge': 'wrong-value-xx', 'x-sm-client-ip': '6.6.6.6' }, '5.6.7.8'));
      await status(h, codeEvent(3, { 'x-sm-client-ip': '4.4.4.4' }, '5.6.7.8'));
      assert.equal(await counted(t, '7.7.7.7'), 1, 'the signed address is counted');
      assert.equal(await counted(t, '76.76.21.21'), 0, 'not the proxy\'s own address');
      assert.equal(await counted(t, '6.6.6.6'), 0, 'a wrong secret: not counted');
      assert.equal(await counted(t, '4.4.4.4'), 0, 'no secret: not counted');
      assert.equal(await counted(t, '5.6.7.8'), 2, 'those two fall back to sourceIp');
    });
    await withSecret(undefined, async () => {
      // No EDGE_SECRET configured: an empty header must not match an empty secret.
      assert.equal(trustedAddress({ headers: { 'x-sm-edge': '', 'x-sm-client-ip': '3.3.3.3' }, requestContext: { http: { sourceIp: '5.6.7.8' } } }).address, '5.6.7.8');
    });
  } finally { await t.close(); }
});

test('Node and Vercel entries keep the first x-forwarded-for, and a forged x-sm-trusted-ip is stripped by the app', async () => {
  const t = await freshDb();
  try {
    for (let i = 1; i <= 11; i++) {
      const r = await t.call('POST', '/v1/auth/code', { email: `node${i}@example.com` }, undefined, { 'x-forwarded-for': '2.2.2.2, 10.0.0.1', 'x-sm-trusted-ip': `9.9.9.${i}` });
      assert.equal(r.status, i <= 10 ? 200 : 429, `request ${i}`);
    }
    assert.equal(await counted(t, '2.2.2.2'), 11);
    assert.equal(await counted(t, '9.9.9.1'), 0, 'the forged header was never counted');
  } finally { await t.close(); }
});
