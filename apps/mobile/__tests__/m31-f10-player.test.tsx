// The player at 200 % text (README fontscale2 F1-F5, widths W1): the top pill, the title, the speed label and the dial keep their place.
/**
 * M31 F10 (FR-031; specs/033-m31-redesign/contact/fontscale2/README.md F1 F2 F3 F4 F5, widths/README.md W1). Written BEFORE the fix: red where noted.
 * The player page is rendered whole (the m31-player.test.tsx harness) with `useWindowDimensions().fontScale` = 2 on a 390 x 844 window.
 *   F1  the next-hot-moment pill must leave both 44 circles of the top row: at most 390 - 2 x (20 + 44 + 8) = 246 wide, one line.
 *   F2  the title takes two lines at most and shrinks to fit (`adjustsFontSizeToFit`); the clock bubble is one line that shrinks to fit.
 *   F3  the speed label "1.0x" is one line (it was "1." / "0x").
 *   F4  the Follow pill does not push the show line to wrap: the show line does not wrap, its status tail is one line, Follow is one line.
 *   F5  the Playback sheet's dial read-out and its ends ("0.5", "3.0") are one line each; the More settings row has a minHeight, no height.
 *   W1  "12345678 listening now" prints as "12.3M listening now".
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockOpenQueue = jest.fn();
const mockToggle = jest.fn();
const mockBump = jest.fn();
let mockListener: { listenerId: string } | undefined = { listenerId: 'me' };
let mockExtrasRow: Record<string, unknown> | undefined;
let mockNextUp: unknown[] = [];
let mockQueueIds: string[] = [];
const mockSettings = new Map<string, string>();
const mockCached = { social: { episode: { id: 'e1', durationMs: 600_000 }, comments: [] as unknown[], heat: { available: true, buckets: Array.from({ length: 100 }, (_, i) => (i === 40 || i === 41 ? 1 : 0.1)) }, myReactionBuckets: [] as number[] } };

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), navigate: (...a: unknown[]) => mockNavigate(...a), canGoBack: () => true, back: jest.fn() },
  useFocusEffect: () => undefined,
  usePathname: () => '/player',
  useIsFocused: () => true,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/shell/providers', () => {
  const stores = {
    settings: { get: (k: string) => mockSettings.get(k), set: (k: string, v: string) => { mockSettings.set(k, v); }, delete: (k: string) => { mockSettings.delete(k); } },
    feeds: {
      getEpisode: (id: string) => (id === 'e1' ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Why mornings matter', imageUrl: 'https://img/e1.png', durationMs: 600_000, enclosureType: 'audio/mpeg', enclosureUrl: 'https://a/e1.mp3', transcripts: [], ...(mockExtrasRow ? { chaptersUrl: 'https://f/ch.json' } : {}) } : undefined),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Morning Notes' }),
    },
    subscriptions: { has: () => false, add: jest.fn() },
    queue: { list: () => mockQueueIds },
    extras: { get: () => mockExtrasRow, put: () => undefined },
    speed: { get: () => undefined, set: () => undefined, clear: () => undefined },
  };
  return { useStores: () => stores, useSubscriptionSync: () => ({ push: jest.fn() }), useToast: () => jest.fn(), useDownloads: () => undefined };
});
jest.mock('@/social/context', () => {
  const value = {
    api: { nextUp: () => Promise.resolve({ items: mockNextUp }), recordShare: () => Promise.resolve(), showExtras: () => new Promise(() => undefined) },
    listener: undefined as unknown,
    composer: { open: jest.fn() },
    reactToggle: { isReacted: () => false, toggle: (...a: unknown[]) => { mockToggle(...a); return { optimistic: [41], settled: Promise.resolve({ myBuckets: [41] }) }; } },
    bump: (...a: unknown[]) => mockBump(...a),
    refresh: jest.fn(),
    useEpisodeSocial: () => ({ cached: mockCached, stale: false }),
  };
  return { useSocial: () => { value.listener = mockListener; return value; } };
});
jest.mock('@/social/usePoll', () => ({ usePoll: () => undefined }));
jest.mock('@/social/live', () => ({ ...jest.requireActual('@/social/live'), useListeningNow: () => 12_345_678 }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 2 })) }));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => [undefined, jest.fn()] }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ useQueueSheet: () => ({ open: mockOpenQueue, close: jest.fn() }), useSwipeUpToOpen: () => ({}) }));
jest.mock('@/ui/settings/AudioRows', () => ({ RouteRow: () => null, VoiceBoostRow: () => null, useEffectsBlocked: () => false }));
jest.mock('@/ui/comments/Composer', () => ({ ComposerSheet: () => null }));
jest.mock('@/ui/comments/MomentSheet', () => ({ MomentSheet: () => null }));
jest.mock('@/ui/clips/ShareChooser', () => {
  const { createElement: h } = jest.requireActual('react');
  return { ShareChooser: (p: { open: boolean }) => (p.open ? h('ShareChooserOpen', { accessibilityLabel: 'Share panel' }) : null) };
});
jest.mock('@/ui/player/QuoteShare', () => ({ useQuoteShare: () => jest.fn(), useQuoteVideo: () => undefined }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => ({ open: jest.fn() }) }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ id, url: 'https://a/x.mp3', title: 't', showTitle: 's' }) }));

import PlayerScreen from '../app/player';
import { PlayerProvider, createPlayerRuntime, type PlayableEpisode, type PlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import { resetReactionStore } from '@/ui/player/useReaction';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';

const EPISODE: PlayableEpisode = { id: 'e1', url: 'https://a/e1.mp3', title: 'Why mornings matter', showTitle: 'Morning Notes', feedUrl: 'https://f/x.xml' };

function harness(): { runtime: PlayerRuntime; push: (e: AdapterEvent) => void } {
  let listener: ((event: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async () => undefined,
    subscribe: (l) => { listener = l; return () => undefined; },
    configure: async () => undefined,
    release: () => undefined,
  };
  const runtime = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1, notify: () => undefined });
  return { runtime, push: (e) => listener?.(e) };
}

const rendered: ReactTestRenderer[] = [];
function mount(runtime: PlayerRuntime): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } },
      createElement(PlayerProvider, { runtime }, createElement(PlayerScreen))));
  });
  rendered.push(r);
  return r;
}
const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const find = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
const press = (r: ReactTestRenderer, label: string) => {
  const n = find(r, label);
  if (!n) throw new Error(`no pressable "${label}" in: ${labels(r).join(' | ')}`);
  act(() => { n.props['onPress'](); });
};

function playing(h: ReturnType<typeof harness>, positionMs = 0): void {
  act(() => { h.runtime.load(EPISODE, 'play'); });
  act(() => { h.push({ type: 'LOADED', durationMs: 600_000 }); });
  if (positionMs > 0) act(() => { h.push({ type: 'TICK', positionMs }); });
}


const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const texts = (r: ReactTestRenderer | ReactTestInstance, pred: (t: ReactTestInstance) => boolean): ReactTestInstance[] => 'root' in r ? r.root.findAll((n) => String(n.type) === 'Text' && pred(n)) : r.findAll((n) => String(n.type) === 'Text' && pred(n));
const said = (n: ReactTestInstance): string => { const c = n.props['children']; return Array.isArray(c) ? c.map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : ''; };

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTest(true);
  mockListener = { listenerId: 'me' };
  mockExtrasRow = undefined;
  mockNextUp = [];
  mockQueueIds = [];
  mockSettings.clear();
  mockCached.social.comments = [];
  resetReactionStore();
});
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

function page(): ReactTestRenderer {
  const h = harness();
  playing(h, 12_000);
  return mount(h.runtime);
}

describe('F10-P1 the top row (F1)', () => {
  it('the hot-moment pill cannot be wider than the room between the two 44 circles (246 on a 390 window) and is one line', () => {
    const r = page();
    const pill = r.root.findAll((n) => n.props['testID'] === 'hot-pill' && typeof n.type === 'string')[0]!;
    // The tightest width on the way up from the pill to the top row.
    let limit = Infinity;
    for (let n: ReactTestInstance | null = pill; n && n.props['testID'] !== 'player-top'; n = n.parent) {
      const s = flat(n);
      for (const k of ['maxWidth', 'width']) if (typeof s[k] === 'number') limit = Math.min(limit, s[k] as number);
    }
    expect(limit).toBeLessThanOrEqual(390 - 2 * (20 + 44 + 8));
    const words = texts(pill, () => true)[0]!;
    expect(words.props['numberOfLines']).toBe(1);
  });
});

describe('F10-P2 the title block and the clock (F2, F3, F4, W1)', () => {
  it('the title takes two lines at most and shrinks to fit', () => {
    const r = page();
    const box = r.root.findAll((n) => n.props['testID'] === 'player-title' && typeof n.type === 'string')[0]!;
    const title = texts(box, (t) => said(t) === 'Why mornings matter')[0]!;
    expect(Number(title.props['numberOfLines'])).toBeLessThanOrEqual(2);
    expect(title.props['adjustsFontSizeToFit']).toBe(true);
  });

  it('the clock bubble ("0:12 · -9:48") is one line that shrinks to fit the ring', () => {
    const r = page();
    const bubble = r.root.findAll((n) => n.props['testID'] === 'player-bubble' && typeof n.type === 'string')[0]!;
    const t = texts(bubble, () => true)[0]!;
    expect(t.props['numberOfLines']).toBe(1);
    expect(t.props['adjustsFontSizeToFit']).toBe(true);
  });

  it('the speed label "1.0x" is one line that shrinks to fit its 44 slot', () => {
    const r = page();
    const speed = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Speed 1.0\u00d7, sleep timer and chapters' && typeof n.type === 'string')[0]!;
    const t = texts(speed, () => true)[0]!;
    expect(t.props['numberOfLines']).toBe(1);
    expect(t.props['adjustsFontSizeToFit']).toBe(true);
  });

  it('Follow does not push the show line to wrap: no wrapping show line, one-line status tail, one-line Follow', () => {
    const r = page();
    const box = r.root.findAll((n) => n.props['testID'] === 'player-title' && typeof n.type === 'string')[0]!;
    const wrapping = box.findAll((n) => typeof n.type === 'string' && (/\bflex-wrap\b/.test(String(n.props['className'] ?? '')) || flat(n)['flexWrap'] === 'wrap'));
    expect(wrapping.length).toBe(0);
    const status = texts(box, (t) => /listening now/.test(said(t)))[0]!;
    expect(status.props['numberOfLines']).toBe(1);
    const follow = texts(box, (t) => said(t) === 'Follow')[0]!;
    expect(follow.props['numberOfLines']).toBe(1);
  });

  it('W1: twelve million listening reads "12.3M listening now", not 12345678', () => {
    const r = page();
    const all = texts(r, () => true).map(said).join(' | ');
    expect(all).toContain('12.3M listening now');
    expect(all).not.toContain('12345678');
  });
});

describe('F10-P3 the Playback sheet (F5)', () => {
  const sheet = (): ReactTestRenderer => { const r = page(); press(r, 'Speed 1.0\u00d7, sleep timer and chapters'); return r; };

  it('every "1.0x" read-out (the transport label and the dial) is one line', () => {
    const r = sheet();
    const readouts = texts(r, (t) => said(t) === '1.0\u00d7');
    expect(readouts.length).toBeGreaterThanOrEqual(2);
    for (const t of readouts) expect(t.props['numberOfLines']).toBe(1);
  });

  it('the dial ends "0.5" and "3.0" are one line each, so they cannot run together ("0.53.0")', () => {
    const r = sheet();
    for (const end of ['0.5', '3.0']) {
      const t = texts(r, (x) => said(x) === end)[0]!;
      expect([end, t.props['numberOfLines']]).toEqual([end, 1]);
    }
  });

  it('the "More settings" row has a minHeight and no height (expected to pass today)', () => {
    const r = sheet();
    const row = r.root.findAll((n) => typeof n.type === 'string' && String(n.props['accessibilityLabel'] ?? '').startsWith('More settings:'))[0]!;
    const s = flat(row);
    expect(s['height']).toBeUndefined();
    expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(56);
  });
});
