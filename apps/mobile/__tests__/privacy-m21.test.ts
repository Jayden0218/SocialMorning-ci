// Tests M21 privacy switches on the phone: read from GET /v1/me safely, each sent alone as PATCH /v1/me.
import { createProfileApi, PRIVACY_SWITCHES, privacySwitchesOf } from '@/social/profile-api';

it('reads the four switches, off unless the server says true', () => {
  expect(privacySwitchesOf({ id: 'L', hideBadge: true, privateSubscriptions: 'yes' })).toEqual({ hideBadge: true, hideStickers: false, hideDecorations: false, privateSubscriptions: false });
  expect(privacySwitchesOf(undefined)).toEqual({ hideBadge: false, hideStickers: false, hideDecorations: false, privateSubscriptions: false });
  expect(PRIVACY_SWITCHES).toEqual(['hideBadge', 'hideStickers', 'hideDecorations', 'privateSubscriptions']);
});

it('sends one switch as PATCH /v1/me with its server name', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ listener: { id: 'L', hideStickers: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const api = createProfileApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok' });
  await api.update({ hideStickers: true });
  expect(calls[0]!.url).toBe('https://api/v1/me');
  expect(calls[0]!.init.method).toBe('PATCH');
  expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ hideStickers: true });
});
