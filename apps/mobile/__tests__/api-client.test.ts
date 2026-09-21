import { ApiError, createApi } from '../src/social/api';

type Call = { url: string; init: RequestInit };

function fakeFetch(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler({ url, init });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

it('sends the bearer token and JSON body, and parses the answer', async () => {
  const { f, calls } = fakeFetch(() => json({ token: 't', listener: { id: 'L', email: 'a@x', displayName: 'A', createdAt: 'now' } }));
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok' });
  const r = await api.signIn('a@x', 'pw');
  expect(r.token).toBe('t');
  expect(calls[0]!.url).toBe('https://api/v1/auth/sign-in');
  expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
  expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ email: 'a@x', password: 'pw' });
});

it('maps a server error body to ApiError with its code and extras', async () => {
  const { f } = fakeFetch(() => json({ error: 'locked', message: 'Too many attempts.', retryAfterSeconds: 4 }, 429));
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined });
  await expect(api.signIn('a@x', 'pw')).rejects.toMatchObject({ code: 'locked', status: 429, retryAfterSeconds: 4 });
});

it('a thrown fetch becomes ApiError("network") — distinguishable from a server refusal', async () => {
  const { f } = fakeFetch(() => { throw new TypeError('Network request failed'); });
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined });
  const err = await api.social('e').catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe('network');
});

it('social: sends If-None-Match and returns {status: 304} untouched, or the body + etag', async () => {
  let n = 0;
  const { f, calls } = fakeFetch(() => (n++ === 0
    ? json({ serverTime: 's', episode: { id: 'e', durationMs: null }, comments: [], heat: { available: false } }, 200, { etag: '"v1"' })
    : new Response(null, { status: 304 })));
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined });
  const first = await api.social('e');
  expect(first).toMatchObject({ status: 200, etag: '"v1"' });
  const second = await api.social('e', '"v1"');
  expect(second).toEqual({ status: 304 });
  expect((calls[1]!.init.headers as Record<string, string>)['if-none-match']).toBe('"v1"');
});
