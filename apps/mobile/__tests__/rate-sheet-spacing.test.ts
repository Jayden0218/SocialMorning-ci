// Tests that the rate sheet asks at most once per 30 days, and never before the tabs.
/**
 * 035 T070 (device check C1; FR-017). "Enjoying SocialNet?" came up on back-to-back launches: an app killed before the listener answered
 * recorded nothing, so every launch asked again. Now a sheet that was SHOWN is remembered (`rate.shownAt`): with no answer yet it is not
 * shown again for 30 days. Before the tabs it is never shown (onTabs false, or onboarding blocking the launch). A fake clock and store.
 * Breaks that turn it red: stop writing/reading `rate.shownAt`; shorten the 30 days; let `rateMayAsk` ignore `onTabs`.
 */
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/token', () => ({ secureToken: { get: async () => undefined } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));

import { RATE_SHOWN_KEY, RATE_SPACING_DAYS, rateMayAsk, shouldAskRating } from '@/ui/shell/RateSheet';
import type { RatePrompt } from '@socialmorning/social-core';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 9);
const rule = { enabled: true, reaskAfterDays: null, delayMs: 1500, storeUrls: {} } as unknown as RatePrompt;
const store = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); } } as never; };

it('the spacing is 30 days', () => expect(RATE_SPACING_DAYS).toBe(30));

it('never asked before: it asks', () => expect(shouldAskRating(store(), rule, T0)).toBe(true));

it('shown a day ago and not answered (the app was killed): it does not ask again at the next launch', () => {
  expect(shouldAskRating(store({ [RATE_SHOWN_KEY]: String(T0 - DAY) }), rule, T0)).toBe(false);
  expect(shouldAskRating(store({ [RATE_SHOWN_KEY]: String(T0 - 29 * DAY) }), rule, T0)).toBe(false);
});

it('30 days after it was shown, still unanswered: it asks once more', () => {
  expect(shouldAskRating(store({ [RATE_SHOWN_KEY]: String(T0 - 30 * DAY) }), rule, T0)).toBe(true);
});

it('answered: never again, whatever the dates', () => {
  expect(shouldAskRating(store({ 'rate.answered': 'rate', [RATE_SHOWN_KEY]: String(T0 - 90 * DAY) }), rule, T0)).toBe(false);
});

it('never before the tabs, and never when onboarding blocked this launch', () => {
  expect(rateMayAsk(store(), { onTabs: false, blockedThisLaunch: false })).toBe(false);
  expect(rateMayAsk(store(), { onTabs: true, blockedThisLaunch: true })).toBe(false);
});
