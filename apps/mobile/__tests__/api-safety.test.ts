/** The M6 client calls and the suspended hook (FR-015). */
import { ApiError, createApi } from '../src/social/api';

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = handler(String(url), init ?? {});
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

it('report, block, unblock, hidden, meta hit the contract routes', async () => {
  const { f, calls } = fakeFetch((url) => (url.endsWith('/v1/reports') ? { status: 201, body: { id: 'r', duplicate: false } } : url.endsWith('/v1/me/hidden') ? { status: 200, body: { reported: [], blocked: [], hiddenFeeds: [] } } : url.endsWith('/v1/meta') ? { status: 200, body: { appealsEmail: 'a@x' } } : { status: 200, body: {} }));
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 't' });
  expect(await api.report('comment', 'c1', 'spam', 'n')).toEqual({ id: 'r', duplicate: false });
  await api.block('b'); await api.unblock('b');
  expect(await api.hidden()).toEqual({ reported: [], blocked: [], hiddenFeeds: [] });
  expect(await api.meta()).toEqual({ appealsEmail: 'a@x' });
  expect(calls.map((c) => `${c.init.method} ${c.url.replace('https://api', '')}`)).toEqual(['POST /v1/reports', 'POST /v1/me/blocks', 'DELETE /v1/me/blocks/b', 'GET /v1/me/hidden', 'GET /v1/meta']);
  expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ targetKind: 'comment', targetId: 'c1', reason: 'spam', note: 'n' });
});

it('a 403 suspended answer calls onSuspended with the message and appeals address, then throws ApiError(suspended)', async () => {
  const { f } = fakeFetch(() => ({ status: 403, body: { error: 'suspended', message: 'This account is suspended. Write to a@x.', appeals: 'a@x' } }));
  const seen: unknown[] = [];
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 't', onSuspended: (m, a) => seen.push([m, a]) });
  await expect(api.me()).rejects.toMatchObject({ code: 'suspended', status: 403 });
  expect(seen).toEqual([['This account is suspended. Write to a@x.', 'a@x']]);
  const e = await api.me().catch((x) => x as ApiError);
  expect(e).toBeInstanceOf(ApiError);
});
