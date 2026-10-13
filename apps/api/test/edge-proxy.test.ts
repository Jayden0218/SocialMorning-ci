// M28 US2 (T025): the drafted Vercel edge proxy signs the client address, drops client-sent x-sm-* headers, and passes the answer through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeProxy } from '../src/edge-proxy.ts';

type Seen = { url: string; method: string; headers: Headers; body: string };
function origin(seen: Seen[], answer: () => Response = () => new Response('{"ok":true}', { status: 201, headers: { 'content-type': 'application/json', 'x-custom': 'yes' } })): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? await new Response(init.body as BodyInit).text() : '';
    seen.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body });
    return answer();
  }) as typeof fetch;
}

test('forwards method, path, query, body and headers; adds x-sm-edge and the first x-forwarded-for as x-sm-client-ip', async () => {
  const seen: Seen[] = [];
  const proxy = createEdgeProxy({ origin: 'https://abc.lambda-url.ap-southeast-1.on.aws/', secret: 'edge-secret', fetch: origin(seen) });
  const res = await proxy(new Request('https://socialmorning-api.vercel.app/v1/auth/code?x=1', {
    method: 'POST', body: '{"email":"a@b.c"}',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t', 'x-forwarded-for': '203.0.113.9, 76.76.21.21' },
  }));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('x-custom'), 'yes');
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, 'https://abc.lambda-url.ap-southeast-1.on.aws/v1/auth/code?x=1');
  assert.equal(seen[0]!.method, 'POST');
  assert.equal(seen[0]!.body, '{"email":"a@b.c"}');
  assert.equal(seen[0]!.headers.get('authorization'), 'Bearer t');
  assert.equal(seen[0]!.headers.get('x-sm-edge'), 'edge-secret');
  assert.equal(seen[0]!.headers.get('x-sm-client-ip'), '203.0.113.9');
});

test('a client-sent x-sm-* header is replaced, never forwarded', async () => {
  const seen: Seen[] = [];
  const proxy = createEdgeProxy({ origin: 'https://o.example', secret: 'edge-secret', fetch: origin(seen) });
  await proxy(new Request('https://x.example/v1/health', { headers: { 'x-sm-edge': 'guess', 'x-sm-client-ip': '6.6.6.6', 'x-sm-trusted-ip': '6.6.6.6', 'x-forwarded-for': '1.1.1.1' } }));
  assert.equal(seen[0]!.headers.get('x-sm-edge'), 'edge-secret');
  assert.equal(seen[0]!.headers.get('x-sm-client-ip'), '1.1.1.1');
  assert.equal(seen[0]!.headers.get('x-sm-trusted-ip'), null);
});

test('without a forwarded address no x-sm-client-ip is sent; set-cookie and status pass through', async () => {
  const seen: Seen[] = [];
  const answer = () => { const h = new Headers({ 'content-type': 'text/plain' }); h.append('set-cookie', 'a=1; Path=/'); h.append('set-cookie', 'b=2; Path=/'); return new Response('no', { status: 404, headers: h }); };
  const proxy = createEdgeProxy({ origin: 'https://o.example', secret: 's', fetch: origin(seen, answer) });
  const res = await proxy(new Request('https://x.example/nope'));
  assert.equal(seen[0]!.headers.get('x-sm-client-ip'), null);
  assert.equal(res.status, 404);
  assert.deepEqual(res.headers.getSetCookie(), ['a=1; Path=/', 'b=2; Path=/']);
});

test('fails closed: no secret or no origin means 500 and nothing is forwarded', async () => {
  const seen: Seen[] = [];
  for (const deps of [{ origin: 'https://o.example', secret: '' }, { origin: '', secret: 's' }]) {
    const res = await createEdgeProxy({ ...deps, fetch: origin(seen) })(new Request('https://x.example/v1/health'));
    assert.equal(res.status, 500);
  }
  assert.equal(seen.length, 0);
});
