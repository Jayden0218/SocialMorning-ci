// ios-journey diagnosis (docs/gate-logs/ios-journey-2026-10-31-e1-red.md): the test server logs every request, so a red run shows whether a POST arrived.
/**
 * scripts/request-log.ts wraps the test server's fetch handler. Per request it writes two lines to the sink (the server's stdout, which the
 * ios-journey workflow redirects to api.log and uploads in the `ios-journey` artifact):
 *   `<iso time> -> <id> <METHOD> <path>`            when the request arrives (a request that never finishes still leaves this line)
 *   `<iso time> <- <id> <status> <ms>ms`            when the response is ready
 * Never bodies, headers, tokens or the query string (/__e2e/code?email=… carries an address).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withRequestLog } from '../scripts/request-log.ts';

const run = async (handler: (req: Request) => Response | Promise<Response>, req: Request) => {
  const lines: string[] = [];
  const res = await withRequestLog(handler, (l) => lines.push(l))(req);
  return { lines, res };
};

test('a request leaves an arrival line and a finish line with the same id, method, path, status and a duration', async () => {
  const { lines, res } = await run(() => new Response('x', { status: 201 }), new Request('http://t/v1/episodes/abc/comments', { method: 'POST', body: '{"text":"hello"}' }));
  assert.equal(res.status, 201, 'the response passes through untouched');
  assert.equal(lines.length, 2);
  const a = /^\S+ -> (\w+) POST \/v1\/episodes\/abc\/comments$/.exec(lines[0]!);
  const b = /^\S+ <- (\w+) 201 (\d+)ms$/.exec(lines[1]!);
  assert.ok(a, `arrival line: ${lines[0]}`);
  assert.ok(b, `finish line: ${lines[1]}`);
  assert.equal(a[1], b[1], 'same request id on both lines');
});

test('two requests get different ids', async () => {
  const lines: string[] = [];
  const f = withRequestLog(() => new Response('ok'), (l) => lines.push(l));
  await f(new Request('http://t/a')); await f(new Request('http://t/b'));
  const ids = lines.filter((l) => l.includes(' -> ')).map((l) => l.split(' ')[2]);
  assert.equal(new Set(ids).size, 2);
});

test('no body, header value, token or query string reaches the log', async () => {
  const { lines } = await run(() => new Response('secret-response-body'), new Request('http://t/__e2e/code?email=a%40b.test&token=QUERYTOKEN', { method: 'POST', headers: { authorization: 'Bearer HEADERTOKEN', cookie: 'sid=COOKIEVALUE' }, body: 'REQUESTBODY' }));
  const all = lines.join('\n');
  for (const s of ['REQUESTBODY', 'HEADERTOKEN', 'COOKIEVALUE', 'QUERYTOKEN', 'a@b.test', 'a%40b.test', 'secret-response-body']) assert.ok(!all.includes(s), `${s} must not be logged`);
  assert.match(all, /POST \/__e2e\/code$/m);
});

test('a handler that throws is logged as 500 and the error still propagates', async () => {
  const lines: string[] = [];
  const f = withRequestLog(() => { throw new Error('boom'); }, (l) => lines.push(l));
  await assert.rejects(async () => f(new Request('http://t/v1/me')), /boom/);
  assert.match(lines.at(-1)!, /<- \w+ 500 \d+ms threw$/);
});

test('a request that never finishes still leaves its arrival line', async () => {
  const lines: string[] = [];
  const f = withRequestLog(() => new Promise<Response>(() => undefined), (l) => lines.push(l));
  void f(new Request('http://t/v1/hang', { method: 'POST' }));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, / -> \w+ POST \/v1\/hang$/);
});

test('the test server really uses it (a wrapper nobody calls logs nothing)', () => {
  const src = readFileSync(fileURLToPath(new URL('../scripts/e2e-server.ts', import.meta.url)), 'utf8');
  assert.match(src, /withRequestLog\(\s*async \(req, env\)/);
});
