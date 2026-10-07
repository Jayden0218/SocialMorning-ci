// Tests M22 lane 5's phone rules: gift products, the translation language, the pending-deletion store and the server calls.
import { consumable, giftProductFor, kindOf } from '@/billing/products';
import { createM22Api, dueDateText, pendingDeletionStore, targetLang } from '@/social/api-m22-server';

it('gifts: gift_tier_n is the show\'s own level, consumable (a second gift can be bought)', () => {
  expect([giftProductFor('show_tier_3'), giftProductFor('plus_monthly'), giftProductFor('show_tier_9')]).toEqual(['gift_tier_3', undefined, undefined]);
  expect([kindOf('gift_tier_1'), consumable('gift_tier_1'), consumable('show_tier_1')]).toEqual(['gift', true, false]);
});

it('translation language: English, or Simplified Chinese for an English show on a Chinese phone', () => {
  const en = { lines: [{ startMs: 0, text: 'Welcome to the show' }] };
  const fr = { lines: [{ startMs: 0, text: 'Bienvenue à tous' }] };
  const zh = { lines: [{ startMs: 0, text: '大家好 welcome' }] };
  expect(targetLang(en, 'zh-Hans-CN')).toBe('zh-Hans');
  expect(targetLang(en, 'en-GB')).toBe('en');
  expect(targetLang(zh, 'zh-CN')).toBe('en');
  expect(targetLang(undefined, 'zh-CN')).toBe('en');
  expect(targetLang({ text: 'Plain text transcript' }, 'zh-TW')).toBe('zh-Hans');
  // A phone not set to Chinese always asks for English.
  expect(targetLang(fr, 'en-US')).toBe('en');
});

it('the pending-deletion store tells its listeners', () => {
  const seen: unknown[] = [];
  const off = pendingDeletionStore.subscribe(() => seen.push(pendingDeletionStore.get()));
  pendingDeletionStore.set({ dueAt: '2026-10-22T00:00:00.000Z' });
  pendingDeletionStore.set(null);
  off();
  pendingDeletionStore.set({ dueAt: 'x' });
  expect(seen).toEqual([{ dueAt: '2026-10-22T00:00:00.000Z' }, null]);
  pendingDeletionStore.set(null);
  expect(dueDateText('not a date')).toBe('not a date');
  expect(dueDateText('2026-10-22T12:00:00.000Z')).toMatch(/2026/);
});

it('server calls: a 403 plus_required and a 409 already_claimed come back as states, not throws', async () => {
  const answers: Record<string, { status: number; body: unknown }> = {
    'GET /v1/episodes/e1/translation?lang=en': { status: 403, body: { error: 'plus_required', message: 'PLUS' } },
    'GET /v1/episodes/e2/translation?lang=en': { status: 404, body: { error: 'not_offered', message: 'no' } },
    'POST /v1/gifts/ABCDEFGHJKMNPQRS/claim': { status: 409, body: { error: 'already_claimed', message: 'Already claimed.' } },
    'PUT /v1/comments/c1/pin-bottom': { status: 204, body: null },
  };
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace('https://api.test', '')}`;
    calls.push(key);
    const a = answers[key] ?? { status: 500, body: { error: 'internal', message: 'no fixture' } };
    return new Response(a.status === 204 ? null : JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const api = createM22Api({ baseUrl: 'https://api.test', fetch: fakeFetch, getToken: async () => 'tok' });
  await expect(api.translation('e1', 'en')).resolves.toEqual({ state: 'plus_required' });
  await expect(api.translation('e2', 'en')).resolves.toEqual({ state: 'not_offered' });
  await expect(api.claimGift('ABCDEFGHJKMNPQRS')).resolves.toBe('already_claimed');
  await api.pinBottom('c1', true);
  expect(calls).toContain('PUT /v1/comments/c1/pin-bottom');
});
