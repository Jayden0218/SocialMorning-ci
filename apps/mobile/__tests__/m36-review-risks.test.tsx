// Tests the five review risks of 035 (US5 a-e): icon key, one keyboard lift, chat list padding, search limit, rating floor.
/**
 * 036 Phase 4 (T030-T034). Each test names the break that turns it red (each was seen red once, then restored):
 *  - T030 no `Icon` is given a colour that animates, so keying the drawing by colour never remounts per frame: a source scan of every `<Icon ... color={...}>` for
 *    animation helpers (`interpolate`, `mixColour`, `Animated`, shared values). Break: put `color={mixColour(a, b, t)}` on an Icon in any file;
 *  - T031 the title bar and the status reply bar each lift ONCE by the reported keyboard height (300, strip 34: bar at 300 - 34 + 8 = 274, not 548), also with a
 *    `PushedPage` around the bar, and `barLift` is `liftedBottom` (one owner). Break: add the keyboard twice in `barLift` or `usePushedLayout`;
 *  - T032 the chat list leaves room for the raised foot zone (padding grows by the lift). Break: take the lift off the list's `paddingBottom`;
 *  - T033 `search` keeps its 25 s limit when a client sets a shorter `timeoutMs`. Break: `deps.timeoutMs ?? SEARCH_TIMEOUT_MS` again;
 *  - T034 the rate sheet never asks again sooner than RATE_SPACING_DAYS (30), whatever the admin's `reaskAfterDays` (FR-017; 036 D6 moved the m25-config pin to 45 days).
 *    Break: use `rule.reaskAfterDays` alone in `shouldAskRating`;
 * NOT VERIFIED: any of it on a phone (jest has no keyboard, no layout engine, no clock but the fake one).
 */
import { createElement } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockStores = { settings: { get: () => undefined, set: () => undefined }, queue: { list: () => [] }, feedCache: {}, feeds: { getEpisode: () => undefined, getShow: () => undefined }, auth: { get: () => undefined } };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/chat/ana',
  useLocalSearchParams: () => ({ id: 'ana', name: 'Ana' }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn(), useDownloads: () => ({}), useCovered: () => false }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/token', () => ({ secureToken: { get: async () => undefined } }));
const mockApi = { profile: (id: string) => Promise.resolve({ id, displayName: 'Ana' }), follow: jest.fn(), unfollow: jest.fn(), registerEpisode: jest.fn() };
const mockSocial = { api: mockApi, listener: { listenerId: 'me', displayName: 'Mei Lin' } };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
const mockMessages = [{ id: 'm1', fromMe: false, body: 'Hello', createdAt: '2026-11-01T09:00:00.000Z' }];
const mockChatApi = { thread: () => Promise.resolve({ with: { id: 'ana', displayName: 'Ana' }, canSend: true, messages: mockMessages }), friends: () => Promise.resolve([]), send: jest.fn() };
jest.mock('@/social/chat-api', () => ({ ...jest.requireActual('@/social/chat-api'), useChatApi: () => mockChatApi }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: jest.fn(), play: jest.fn() }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ safety: { isHidden: () => false }, feed: (x: unknown) => x }) }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
const mockM22 = { replies: () => Promise.resolve([]), react: () => Promise.resolve(), unreact: () => Promise.resolve() };
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => mockM22 }));
jest.mock('@/playback/expo-audio-adapter', () => ({
  askMicrophone: () => Promise.resolve(true), playVoice: () => ({ stop: jest.fn() }),
  useVoiceRecorder: () => ({ recorder: { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }, state: { durationMillis: 0 } }),
  voiceSessionOn: () => Promise.resolve(), voiceSessionOff: () => Promise.resolve(),
}));
jest.mock('@/telemetry/reportError', () => ({ reportAndDrop: () => () => undefined }));
jest.mock('@/ui/kit/haptics', () => ({ tick: () => undefined }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ChatThread from '../app/chat/[id]';
import { PushedPage } from '@/ui/kit/PushedPage';
import { TitleBar } from '@/ui/kit/TitleBar';
import { StatusReplies } from '@/ui/social/StatusReplies';
import { liftedBottom } from '@/ui/kit/useKeyboardHeight';
import { barLift } from '@/ui/status/useKeyboardHeight';
import { STAGE } from '@/ui/status/measures';
import { COMMENTS, ZONE_BOTTOM } from '@/ui/comments/measures';
import { createApi, SEARCH_TIMEOUT_MS } from '@/social/api';
import { shouldAskRating, RATE_KEY, RATE_AT_KEY, RATE_SPACING_DAYS } from '@/ui/shell/RateSheet';
import { CONFIG_DEFAULTS } from '@socialmorning/social-core';

const STRIP = 34;
type Handler = (e: { endCoordinates: { height: number } }) => void;
let handlers: Record<string, Handler[]> = {};
let r: ReactTestRenderer | undefined;
beforeEach(() => {
  setReducedMotionForTest(true);
  handlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: Handler) => {
    (handlers[name] ??= []).push(fn);
    return { remove: () => { handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn); } };
  }) as never);
});
afterEach(() => { act(() => r?.unmount()); r = undefined; jest.restoreAllMocks(); setReducedMotionForTest(undefined); });
const emit = (name: string, height = 0) => act(() => { for (const h of handlers[name] ?? []) h({ endCoordinates: { height } }); });
const mount = async (el: React.ReactElement): Promise<ReactTestRenderer> => {
  await act(async () => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: STRIP, left: 0, right: 0 } }, el));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  return r!;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const host = (testID: string) => r!.root.findAll((n) => n.props['testID'] === testID && typeof n.type === 'string');

// ---------------------------------------------------------------- T030
const SRC = join(__dirname, '..');
function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}
/** Every `color={...}` expression of an `<Icon ...>` in a source text (the expression may hold one level of braces). */
export function iconColourExpressions(src: string): string[] {
  return [...src.matchAll(/<Icon\b[^>]*?\bcolor=\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map((m) => m[1]!);
}
const ANIMATED = /interpolate|mixColour|Animated|useSharedValue|useAnimated|\.__getValue|Value\(/;

describe('T030 Icon key: no icon animates its colour', () => {
  it('the scanner finds animated colours in a snippet (so a clean tree means something)', () => {
    const bad = '<Icon name="x" size={1} color={mixColour(a, b, t)} />';
    expect(iconColourExpressions(bad)).toHaveLength(1);
    expect(iconColourExpressions(bad).some((e) => ANIMATED.test(e))).toBe(true);
    expect(iconColourExpressions('<Icon name="x" size={1} color={on ? c.void : c.text} />').some((e) => ANIMATED.test(e))).toBe(false);
  });
  it('no <Icon color=...> in src/ or app/ is built from an animation', () => {
    const files = [...sources(join(SRC, 'src')), ...sources(join(SRC, 'app'))];
    const found = files.flatMap((f) => iconColourExpressions(readFileSync(f, 'utf8')).filter((e) => ANIMATED.test(e)).map((e) => `${f}: ${e}`));
    expect(found).toEqual([]);
    // The scan reads real call sites (not zero): there are hundreds.
    expect(files.flatMap((f) => iconColourExpressions(readFileSync(f, 'utf8'))).length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------- T031
const status = { id: 's1', mine: false, author: { id: 'u2', name: 'Ana', initials: 'A' }, durationMs: 41_000, url: 'https://x/a.m4a', text: 'Hi', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), items: [], reactions: [], myReaction: null, suggested: false };
const replies = (inside: boolean) => {
  const el = createElement(StatusReplies, { status: status as never, colours: { accent: '#fff', muted: '#888', text: '#fff', onPrimary: '#000' }, pauseAll: () => undefined, onChanged: () => undefined });
  return inside ? createElement(PushedPage, { title: 'Status', tone: 'none' as const, children: el }) : el;
};
const titleBarBottom = () => r!.root.findAllByType(TitleBar)[0]!.props['bottom'] as number;

describe('T031 one owner of the keyboard lift', () => {
  it('barLift is liftedBottom (one formula)', () => {
    for (const [k, s, rest, gap] of [[0, 34, 6, 8], [262, 34, 6, 8], [300, 34, 6, 8], [20, 34, 6, 8]] as const) expect(barLift(k, s, rest, gap)).toBe(liftedBottom(rest, k, s, gap));
  });
  it('the reply bar lifts once: keyboard 300, strip 34 -> 300 - 34 + 8 = 274 (not 548)', async () => {
    await mount(replies(false));
    expect(flat(host('status-bar')[0]!)['bottom']).toBe(STAGE.barBottom);
    emit('keyboardWillShow', 300);
    expect(flat(host('status-bar')[0]!)['bottom']).toBe(300 - STRIP + STAGE.keyboardGap);
  });
  it('inside a PushedPage the bar still lifts once, and so does the page\'s own title bar', async () => {
    await mount(replies(true));
    const rest = titleBarBottom();
    emit('keyboardWillShow', 300);
    expect(flat(host('status-bar')[0]!)['bottom']).toBe(300 - STRIP + STAGE.keyboardGap);
    expect(titleBarBottom()).toBe(liftedBottom(rest, 300, STRIP, 8));
    expect(titleBarBottom() - rest).toBeLessThan(300);
  });
});

// ---------------------------------------------------------------- T032
describe('T032 chat list follows the raised zone', () => {
  const listPad = () => {
    const list = r!.root.findAll((n) => n.props['contentContainerStyle'] !== undefined && typeof n.props['renderItem'] === 'function')[0]!;
    return StyleSheet.flatten(list.props['contentContainerStyle'] as never)['paddingBottom'] as number;
  };
  it('keyboard 336 (strip 34): the list pads by the zone\'s lift, and returns when the keyboard hides', async () => {
    await mount(createElement(ChatThread));
    const rest = listPad();
    emit('keyboardWillShow', 336);
    const lift = liftedBottom(ZONE_BOTTOM, 336, STRIP, ZONE_BOTTOM) - ZONE_BOTTOM;
    expect(lift).toBeGreaterThan(0);
    expect(listPad() - rest).toBe(lift);
    emit('keyboardWillHide');
    expect(listPad()).toBe(rest);
    expect(rest).toBeGreaterThanOrEqual(COMMENTS.nodeGap);
  });
});

// ---------------------------------------------------------------- T033
describe('T033 search keeps its 25 s limit', () => {
  it('a client timeoutMs of 5 s does not cut a search at 5 s; it ends at 25 s', async () => {
    jest.useFakeTimers();
    try {
      let aborted = false;
      const f = ((_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => { init.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }); })) as never;
      const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => undefined, timeoutMs: 5_000 });
      const p = api.search('news').catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(6_000);
      expect(aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS);
      expect(aborted).toBe(true);
      await p;
    } finally { jest.useRealTimers(); }
  });
});

// ---------------------------------------------------------------- T034
describe('T034 the rate sheet keeps its 30-day floor', () => {
  const DAY = 86_400_000;
  const store = (answer: string, at: number) => {
    const m = new Map<string, string>([[RATE_KEY, answer], [RATE_AT_KEY, String(at)]]);
    return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); } };
  };
  const rule = (days: number) => ({ ...CONFIG_DEFAULTS.ratePrompt, reaskAfterDays: days });
  const NOW = 1_000_000_000_000;
  it('the floor is 30 days', () => { expect(RATE_SPACING_DAYS).toBe(30); });
  it('closed 3 days ago with an admin re-ask of 7 days: still no', () => {
    expect(shouldAskRating(store('closed', NOW - 3 * DAY) as never, rule(7), NOW)).toBe(false);
  });
  it('answered 10 days ago with 7: no (the floor wins)', () => {
    expect(shouldAskRating(store('feedback', NOW - 10 * DAY) as never, rule(7), NOW)).toBe(false);
  });
  it('answered 30 days ago with 7: asks', () => {
    expect(shouldAskRating(store('feedback', NOW - 30 * DAY) as never, rule(7), NOW)).toBe(true);
  });
  it('40 days ago with 60: no; 61 days with 60: asks (a longer admin value still wins)', () => {
    expect(shouldAskRating(store('closed', NOW - 40 * DAY) as never, rule(60), NOW)).toBe(false);
    expect(shouldAskRating(store('closed', NOW - 61 * DAY) as never, rule(60), NOW)).toBe(true);
  });
});
