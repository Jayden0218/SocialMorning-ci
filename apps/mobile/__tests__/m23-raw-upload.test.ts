// Tests that every upload goes through the shared request helper: token, timeout, suspended, maintenance.
/**
 * M23 US9 (FR-014): the five hand-written uploads (voice status, comment picture, voice comment,
 * avatar, status voice/photo) skipped the helper's timeout and its suspended / maintenance
 * handling. They now call `requester(deps).raw(...)`.
 *
 * The break that turns it red: in `src/social/api.ts` `requester`, make `call.raw` call
 * `deps.fetch` directly without the abort timer — the timeout case then hangs past 60 s.
 */
import { requester, setMaintenanceListener, UPLOAD_TIMEOUT_MS, ApiError, type ApiDeps } from '@/social/api';
import { createProfileApi } from '@/social/profile-api';
import { createCommentExtrasApi } from '@/social/comment-extras-api';
import { createM12Api } from '@/social/m12-api';

/** A stand-in for the phone's file Blob (the body is passed through untouched). */
const blob = (type: string) => ({ type, size: 1 }) as unknown as Blob;

function deps(answer: (url: string, init: RequestInit) => Promise<Response>, extra: Partial<ApiDeps> = {}): ApiDeps & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    baseUrl: 'https://api.test',
    getToken: async () => 'tok',
    fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return answer(url, init); }) as unknown as typeof fetch,
    ...extra,
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { setMaintenanceListener(undefined); jest.useRealTimers(); });

it('raw sends the bytes with the token and the caller\'s headers, and parses the answer', async () => {
  const d = deps(async () => json(200, { avatarUrl: 'https://cdn/a.jpg' }));
  const file = blob('image/jpeg');
  expect(await createProfileApi(d).uploadAvatar(file)).toBe('https://cdn/a.jpg');
  const { url, init } = d.calls[0]!;
  expect(url).toBe('https://api.test/v1/me/avatar');
  expect(init.method).toBe('PUT');
  expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'content-type': 'image/jpeg' });
  expect(init.body).toBe(file);
  expect(init.signal).toBeDefined();
});

it('a suspended account is told to the app from an upload too', async () => {
  const onSuspended = jest.fn();
  const d = deps(async () => json(403, { error: 'suspended', message: 'Suspended.' }), { onSuspended });
  await expect(createCommentExtrasApi(d).postImage('c1', blob('image/jpeg'), 10, 10)).rejects.toBeInstanceOf(ApiError);
  expect(onSuspended).toHaveBeenCalledWith('Suspended.', undefined);
});

it('maintenance (503) reaches the maintenance listener from an upload too', async () => {
  const seen = jest.fn();
  setMaintenanceListener(seen);
  const d = deps(async () => json(503, { maintenance: { until: 'soon' } }));
  await expect(createM12Api(d).postVoice(blob('audio/mp4'), 5000)).rejects.toMatchObject({ status: 503 });
  expect(seen).toHaveBeenCalled();
});

it('an upload that never answers fails as "Couldn\'t reach the server" after the upload timeout', async () => {
  jest.useFakeTimers();
  const d = deps((_u, init) => new Promise<Response>((_res, rej) => {
    init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
  }));
  const p = createCommentExtrasApi(d).postVoice('e1', blob('audio/mp4'), { durationMs: 1000 });
  const caught = p.catch((e: unknown) => e);
  await jest.advanceTimersByTimeAsync(0); // the token lookup, then the request and its timer
  expect(d.calls).toHaveLength(1);
  await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
  expect(await caught).toMatchObject({ code: 'network', status: 0 });
});

it('the JSON calls still work the same way', async () => {
  const d = deps(async () => json(200, { ok: true }));
  const call = requester(d);
  expect((await call<{ ok: boolean }>('POST', '/v1/x', { a: 1 })).json).toEqual({ ok: true });
  expect(d.calls[0]!.init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer tok' });
  expect(d.calls[0]!.init.body).toBe('{"a":1}');
});

it('no phone API file writes its own fetch to our server any more', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync, readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const dir = join(__dirname, '..', 'src', 'social');
  const own = readdirSync(dir).filter((f) => f !== 'api.ts' && /\.tsx?$/.test(f) && /deps\.fetch\(/.test(readFileSync(join(dir, f), 'utf8')));
  expect(own).toEqual([]);
});
