// Tests M25 lane SB on the phone: the rotated session token is handed on, devices calls, and the device line.
import { createApi, setTokenRotatedListener } from '@/social/api';
import { createAccountApi, deviceLine, type Device } from '@/social/account-api';

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler({ url, init }); }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];

afterEach(() => setTokenRotatedListener(undefined));

it('asks for rotation only while the app listens, and hands on the new token with the one the call used', async () => {
  const { f, calls } = fakeFetch(() => json({ listener: { id: 'L' } }, { 'x-session-token': 'NEW' }));
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'OLD' });
  await api.me();
  expect(header(calls[0]!, 'x-session-rotate')).toBeUndefined();
  const seen: [string, string][] = [];
  setTokenRotatedListener((fresh, sentWith) => seen.push([fresh, sentWith]));
  await api.me();
  expect(header(calls[1]!, 'x-session-rotate')).toBe('1');
  expect(seen).toEqual([['NEW', 'OLD']]);
});

it('a signed-out call never asks and never hands a token on', async () => {
  const { f, calls } = fakeFetch(() => json({ items: [] }, { 'x-session-token': 'NEW' }));
  const seen: string[] = [];
  setTokenRotatedListener((fresh) => seen.push(fresh));
  await createAccountApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined }).devices().catch(() => undefined);
  expect(header(calls[0]!, 'x-session-rotate')).toBeUndefined();
  expect(seen).toEqual([]);
});

it('devices: list, sign one out, sign out the others, ask for the data export', async () => {
  const { f, calls } = fakeFetch((c) => json(c.url.endsWith('/sign-out-others') ? { signedOut: 2 } : c.url.endsWith('/export') ? { sent: true, expiresInHours: 24 } : { items: [] }));
  const a = createAccountApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 't' });
  expect(await a.devices()).toEqual([]);
  await a.signOutDevice('abc');
  expect(await a.signOutOthers()).toBe(2);
  expect(await a.requestDataExport()).toEqual({ sent: true, expiresInHours: 24 });
  expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
    'GET https://api/v1/me/sessions', 'DELETE https://api/v1/me/sessions/abc', 'POST https://api/v1/me/sessions/sign-out-others', 'POST https://api/v1/me/export',
  ]);
});

it('the device line: country by name, then how long ago; this phone says so', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const d = (lastSeenAt: string, extra: Partial<Device> = {}): Device => ({ id: 'x', kind: 'phone', label: 'Pixel', country: 'MY', signedInAt: lastSeenAt, lastSeenAt, current: false, ...extra });
  const name = (c: string) => (c === 'MY' ? 'Malaysia' : c);
  expect(deviceLine(d('2026-10-08T11:58:00Z'), now, name)).toBe('Malaysia · active now');
  expect(deviceLine(d('2026-10-08T11:30:00Z'), now, name)).toBe('Malaysia · active 30 min ago');
  expect(deviceLine(d('2026-10-08T07:00:00Z'), now, name)).toBe('Malaysia · active 5 h ago');
  expect(deviceLine(d('2026-10-01T12:00:00Z'), now, name)).toBe('Malaysia · active 7 days ago');
  expect(deviceLine(d('2026-10-08T12:00:00Z', { current: true, country: null }), now)).toBe('this phone');
  expect(deviceLine(d('2026-10-08T11:00:00Z', { country: 'SG' }), now)).toBe('SG · active 1 h ago');
});
