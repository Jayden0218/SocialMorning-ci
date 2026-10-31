// Tests that the Pulse player is the drawing's: every position and size, read off the rendered page and the sheets.
/**
 * M31 round 2 (owner, 2026-10-28: "the design the code generated is very different, design is I want completely
 * same"). `design-pulse2/index.html#player--screen`, `listen.html` (`playerBody`, the More and Playback sheets, the end
 * offer, nothing playing) and `kit.js` (`nowbar`) are the source of every number asserted here. What this proves in Jest
 * (how it looks on a phone is NOT VERIFIED): the page puts each part where the drawing does on its 390 × 844 phone with a
 * 50 / 34 inset (`playerLayout`), the controls and the tray are the drawn sizes, the hot pill shows for the drawing's own
 * curve, the More sheet has every drawn tile and the chapter list, the Playback sheet has the drawn default line and the
 * drawn sleep line, the now bar is the drawn bar, and the raw sizes are tokens.
 *
 * The break that turns each red: change a number in `player` (src/design/tokens.ts); restore the old peak rule in
 * `hot.ts`; drop `chaptersFolded`'s default; lower-case "Set"; put `gap-row` back on the now bar.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockOpenQueue = jest.fn();
const mockToggle = jest.fn();
const mockBump = jest.fn();
const mockPlayableLoad = jest.fn();
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
jest.mock('@/social/live', () => ({ liveLabel: (n: number | undefined) => (n !== undefined && n >= 2 ? `${n} listening now` : undefined), useListeningNow: () => undefined }));
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';
import { NowBar } from '@/ui/kit/NowBar';
import { hotMoments } from '@/ui/player/hot';
import { PLAYER, playerLayout } from '@/ui/player/measures';
import { OPEN_CHAPTERS, moreSheetFraction } from '@/ui/player/PlayerMoreSheet';
import { GLOW_A, GLOW_B, glowPair, glowShape } from '@/ui/player/PlayerBackdrop';
import { colour } from '@/design';
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
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

function playing(h: ReturnType<typeof harness>, positionMs = 0): void {
  act(() => { h.runtime.load(EPISODE, 'play'); });
  act(() => { h.push({ type: 'LOADED', durationMs: 600_000 }); });
  if (positionMs > 0) act(() => { h.push({ type: 'TICK', positionMs }); });
}

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTest(true);
  mockPush.mockClear(); mockReplace.mockClear(); mockNavigate.mockClear(); mockOpenQueue.mockClear(); mockToggle.mockClear(); mockBump.mockClear(); mockPlayableLoad.mockClear();
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


const frame = { width: 390, height: 844 };
const DRAWN_INSETS = { top: 50, bottom: 34 };

/** The drawing's own heat curve (`PK.heat()` in kit.js: peaks at buckets 14, 30, 47, 63 and 82), rounded to 3 places. */
const DRAWING_HEAT: number[] = (() => {
  let seed = 11;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: 100 }, (_, k) => {
    let v = 0.06 + rand() * 0.08;
    for (const [c, h] of [[14, 0.5], [30, 1], [47, 0.35], [63, 0.75], [82, 0.5]] as [number, number][]) v += h * Math.exp(-((k - c) ** 2) / 20);
    return Math.min(1, v);
  });
})();

type Style = Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const hits = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
  if (hits.length === 0) throw new Error(`no testID "${id}"`);
  return hits[0]!;
};
const styleOf = (n: ReactTestInstance): Style => (StyleSheet.flatten(n.props['style']) ?? {}) as Style;
const pressableByLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = find(r, label);
  if (!n) throw new Error(`no "${label}" in: ${labels(r).join(' | ')}`);
  return n;
};
const host = (r: ReactTestRenderer, label: string): ReactTestInstance => pressableByLabel(r, label);
/** The sheets are drawn after the page, so a name the tray also has (Clip, Share) is the sheet's tile when this takes the last. */
const lastByLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function' && styleOf(n).height === 84)[0]!;

describe('where the drawing puts each part (390 × 844, 50 pt status bar, 34 pt home inset)', () => {
  it('playerLayout is the drawing: top row 58, ring 330 at 118, bubble 298, title 226, controls 124, tray 40', () => {
    const l = playerLayout(frame, DRAWN_INSETS);
    expect(l).toMatchObject({ ring: 330, topBarTop: 58, ringTop: 118, bubbleTop: 298, titleBottom: 226, controlsBottom: 124, trayBottom: 40, offerBottom: 116, emptyTextBottom: 150, emptyPillsBottom: 40 });
  });

  it('a taller status bar moves the top parts down, a taller home inset moves the bottom parts up, a short window shrinks only the ring', () => {
    const tall = playerLayout({ width: 430, height: 932 }, { top: 59, bottom: 34 });
    expect(tall).toMatchObject({ topBarTop: 67, ringTop: 127, ring: 330, trayBottom: 40 });
    const bar = playerLayout(frame, { top: 50, bottom: 40 });
    expect(bar).toMatchObject({ trayBottom: 46, controlsBottom: 130, titleBottom: 232 });
    const short = playerLayout({ width: 375, height: 667 }, { top: 20, bottom: 0 });
    expect(short.ring).toBeLessThan(330);
    expect(short.ringTop + short.ring).toBeLessThanOrEqual(667 - short.titleBottom - PLAYER.titleRoom);
  });

  it('the rendered page has the parts at those numbers', () => {
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    expect(styleOf(byId(r, 'player-top-pos'))).toMatchObject({ top: 58, left: 20, right: 20 });
    expect(styleOf(byId(r, 'player-ring-pos'))).toMatchObject({ top: 118 });
    expect(styleOf(byId(r, 'ring'))).toMatchObject({ width: 330, height: 330 });
    // 298 = 118 + 165 + 15, measured inside the ring's box.
    expect(styleOf(byId(r, 'player-bubble')).top).toBe(180);
    expect(styleOf(byId(r, 'player-title-pos'))).toMatchObject({ bottom: 226, left: 20, right: 20 });
    expect(styleOf(byId(r, 'player-bottom'))).toMatchObject({ bottom: 124, left: 20, right: 20 });
    expect(styleOf(byId(r, 'player-tray-pos'))).toMatchObject({ bottom: 40, left: 12, right: 12 });
    expect(styleOf(byId(r, 'player-tray'))).toMatchObject({ height: 60 });
  });

  it('the cover is 205 (0.62 of 330) and the top row holds a 44 close, the pill, a 44 More', () => {
    expect(Math.round(PLAYER.ring * PLAYER.inner)).toBe(205);
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    expect(styleOf(host(r, 'Close the player'))).toMatchObject({ width: 44, height: 44 });
    expect(styleOf(host(r, 'More'))).toMatchObject({ width: 44, height: 44 });
    expect(styleOf(byId(r, 'hot-pill'))).toMatchObject({ height: 32, borderRadius: 16, paddingHorizontal: 12, backgroundColor: PLAYER.pillFill });
    expect(styleOf(byId(r, 'hot-pill')).borderWidth).toBeUndefined();
  });
});

describe('the controls and the tray, as drawn', () => {
  it('play is 80, the skips are 30 wide with a 48 tap area, the speed label and the moon are 44; no number is printed on a skip', () => {
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    expect(styleOf(host(r, 'Pause'))).toMatchObject({ width: 80, height: 80 });
    for (const name of ['Skip back 15 seconds', 'Skip forward 30 seconds']) {
      expect(styleOf(host(r, name))).toMatchObject({ width: 30, height: 30 });
      expect(host(r, name).props['hitSlop']).toBe(9);
    }
    expect(styleOf(host(r, 'Speed 1.0×, sleep timer and chapters'))).toMatchObject({ width: 44 });
    expect(styleOf(host(r, 'Sleep timer, off'))).toMatchObject({ width: 44, height: 44 });
    const printed = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] !== undefined).map((n) => String(n.props['children']));
    expect(printed).not.toContain('15');
    expect(printed).not.toContain('30');
  });

  it('the tray items are as wide as their glyphs (22; Comments 22 + 6 + the count) with the drawn ink and the chat-box glyph', () => {
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    for (const name of ['React at this moment', 'Clip the last 30 seconds', 'Playlist', 'Share this episode']) {
      expect(styleOf(host(r, name))).toMatchObject({ height: 22 });
      expect(host(r, name).props['hitSlop']).toEqual({ top: 13, bottom: 13, left: 13, right: 13 });
    }
    expect(styleOf(host(r, 'Comments, 0'))).toMatchObject({ gap: 6 });
    const icons = r.root.findAll((n) => n.props['name'] === 'chatbox-outline');
    expect(icons.length).toBeGreaterThan(0);
    expect(icons[0]!.props['size']).toBe(22);
    expect(icons[0]!.props['color']).toBe(PLAYER.trayInk);
  });

  it('Follow is 34 tall, flush with the show line (no 7 lift), and the show link is the drawn 18 line with a 48 tap area', () => {
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    const follow = host(r, 'Subscribe to this show');
    expect(styleOf(follow)).toMatchObject({ height: 34, paddingHorizontal: 14 });
    expect(styleOf(follow).marginBottom).toBeUndefined();
    const show = host(r, 'Show: Morning Notes');
    expect(styleOf(show).minHeight).toBeUndefined();
    expect(show.props['hitSlop']).toMatchObject({ top: 15, bottom: 15 });
    const title = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'Why mornings matter')[0]!;
    expect(styleOf(title)).toMatchObject({ fontSize: 26, lineHeight: 33 });
  });
});

describe('the hot pill with the drawing\'s own curve', () => {
  it('hotMoments finds its five peaks (buckets 14, 30, 47, 63, 82) — the old rule found none', () => {
    const m = hotMoments(DRAWING_HEAT, 100_000);
    expect(m).toHaveLength(5);
    [14, 30, 47, 63, 82].forEach((bucket, i) => {
      expect(m[i]!.fromMs / 1000).toBeLessThanOrEqual(bucket + 2);
      expect(m[i]!.toMs / 1000).toBeGreaterThanOrEqual(bucket - 2);
    });
  });

  it('a flat curve and an all-zero curve still have no hot moment', () => {
    expect(hotMoments(Array.from({ length: 100 }, () => 0.3), 600_000)).toEqual([]);
    expect(hotMoments(Array.from({ length: 100 }, () => 0), 600_000)).toEqual([]);
  });

  it('the page shows "next hot moment in …" when the heat is the drawing\'s curve', () => {
    const heat = mockCached.social.heat as { buckets: number[] };
    const saved = heat.buckets;
    heat.buckets = DRAWING_HEAT;
    try {
      const h = harness();
      playing(h, 12_000);
      const r = mount(h.runtime);
      expect(labels(r).some((l) => /^next hot moment in \d+:\d\d\. Jump to it\.$/.test(l))).toBe(true);
      expect(text(r)).toContain('next hot moment in');
    } finally {
      heat.buckets = saved;
    }
  });
});

describe('the More sheet, as drawn, with a transcript and chapters', () => {
  const extras = {
    chaptersJson: JSON.stringify([{ startMs: 0, title: 'Cold open' }, { startMs: 252_000, title: 'Why the first hour counts' }, { startMs: 725_000, title: 'The coffee question' }, { startMs: 1_300_000, title: 'Light, noise and phones', url: 'https://x.test/p' }]),
    transcriptJson: JSON.stringify({ lines: [{ startMs: 1000, text: 'Hello there.' }] }),
    fetchedAt: 1,
  };

  it('has the title row (More + a 36 close), the 56 head, six 84 tiles, and the chapter list open', () => {
    mockExtrasRow = extras;
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'More');
    const all = labels(r);
    for (const l of ['Clip the last 30 seconds', 'Share this episode', 'Add to favourites', 'About this episode', 'Transcript', 'Chapters (4)', 'Chapter 1, Cold open', 'Chapter 4, Light, noise and phones']) expect(all).toContain(l);
    expect(all.filter((l) => l === 'Close').length).toBeGreaterThan(0);
    const close = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close' && typeof n.props['onPress'] === 'function' && styleOf(n).width === 36);
    expect(close.length).toBeGreaterThan(0);
    expect(text(r)).toContain('"More"');
    for (const name of ['Clip the last 30 seconds', 'Share this episode', 'Add to favourites', 'About this episode', 'Transcript', 'Chapters (4)']) {
      expect(styleOf(lastByLabel(r, name))).toMatchObject({ height: 84, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14 });
    }
    // Transcript is outlined hot (1.5); Chapters is ON (the list is open), so it has no outline.
    expect(styleOf(lastByLabel(r, 'Transcript'))).toMatchObject({ borderWidth: 1.5 });
    expect(styleOf(lastByLabel(r, 'Chapters (4)'))).toMatchObject({ borderWidth: 0 });
    expect(styleOf(byId(r, 'chapter-list'))).toMatchObject({ borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12, gap: 2 });
    for (let i = 1; i <= 4; i++) {
      const row = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith(`Chapter ${i},`))[0]!;
      expect(styleOf(row)).toMatchObject({ minHeight: 36, paddingVertical: 7, paddingHorizontal: 4 });
    }
  });

  it('the Chapters icon is the list glyph and Add to favourites is the star outline', () => {
    mockExtrasRow = extras;
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'More');
    const names = r.root.findAll((n) => typeof n.props['name'] === 'string').map((n) => n.props['name'] as string);
    for (const icon of ['cut-outline', 'share-outline', 'star-outline', 'information-circle-outline', 'document-text-outline', 'list']) expect(names).toContain(icon);
    expect(names).not.toContain('library-outline');
  });

  it('opens at the height the drawing\'s content makes: 647 of 844 for six tiles and four chapters', () => {
    expect(moreSheetFraction(844, 6, 4) * 844).toBeCloseTo(647, 0);
    expect(moreSheetFraction(844, 4, 0) * 844).toBeCloseTo(8 + 5 + 14 + 36 + 14 + 56 + 14 + 178 + 44, 0);
    expect(moreSheetFraction(400, 6, 30)).toBe(0.92);
  });

  it('round 3: the first height has room for four chapters however many there are (the list scrolls; the drawing\'s 647 with "6 chapters" on the tile)', () => {
    // Red if the height goes back to growing with the chapter count (six chapters opened at 723, 76 taller than drawn).
    expect(OPEN_CHAPTERS).toBe(4);
    expect(moreSheetFraction(844, 6, 6)).toBe(moreSheetFraction(844, 6, 4));
    expect(moreSheetFraction(844, 6, 30)).toBe(moreSheetFraction(844, 6, 4));
    expect(moreSheetFraction(844, 6, 2)).toBeLessThan(moreSheetFraction(844, 6, 4));
    expect(moreSheetFraction(844, 6, 6) * 844).toBeCloseTo(647, 0);
  });

  it('with no transcript and no chapters the tiles are four and no list is drawn', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'More');
    expect(labels(r)).not.toContain('Transcript');
    expect(labels(r).some((l) => l.startsWith('Chapters ('))).toBe(false);
    expect(labels(r)).toContain('About this episode');
    expect(r.root.findAll((n) => n.props['testID'] === 'chapter-list')).toHaveLength(0);
  });
});

describe('the Playback sheet, as drawn', () => {
  it('shows "Set 1.2× as default (this show remembers its own)" in hot-text when the rate is not the default', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'Speed 1.0×, sleep timer and chapters');
    expect(labels(r).some((l) => l.startsWith('Set '))).toBe(false);
    act(() => { h.runtime.setRate(1.2); });
    expect(labels(r)).toContain('Set 1.2× as default (this show remembers its own)');
    expect(text(r)).toContain('Set 1.2× as default (this show remembers its own)');
    press(r, 'Set 1.2× as default (this show remembers its own)');
    expect(h.runtime.defaultRate()).toBeCloseTo(1.2, 5);
  });

  it('shows the running sleep timer as "pausing in 30:00 · Cancel", lower case, and Cancel works', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'Speed 1.0×, sleep timer and chapters');
    act(() => { h.runtime.setSleepTimer(30); });
    expect(text(r)).toContain('pausing in 30:00');
    expect(text(r)).toContain(' · ');
    expect(text(r)).not.toContain('Pausing in');
    expect(text(r)).toContain('SLEEP');
    press(r, 'Cancel the sleep timer');
    expect(h.runtime.sleepTimer().minutes).toBeUndefined();
  });

  it('has the − and + at 48, the presets as 36 tall chips 6 apart, the dial at 176 and rings at 46', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'Speed 1.0×, sleep timer and chapters');
    expect(styleOf(host(r, 'Slower'))).toMatchObject({ width: 48, height: 48 });
    expect(styleOf(host(r, 'Faster'))).toMatchObject({ width: 48, height: 48 });
    for (const p of ['1×', '1.2×', '1.5×', '2×']) expect(styleOf(host(r, p))).toMatchObject({ height: 36 });
    expect(styleOf(byId(r, 'speed-presets'))).toMatchObject({ gap: 6 });
    const dial = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'adjustable' && n.props['accessibilityLabel'] === 'Speed')[0]!;
    expect(styleOf(dial)).toMatchObject({ width: 176, height: 176 });
    for (const m of [5, 10, 15, 30, 45, 60]) expect(styleOf(host(r, `Sleep in ${m} minutes`))).toMatchObject({ width: 46, height: 46 });
  });

  it('the blocks are 14 apart, the More settings row is radius 20 with its line wrapping, page two is Unbounded 24 with no close', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'Speed 1.0×, sleep timer and chapters');
    expect(styleOf(byId(r, 'sleep-block'))).toMatchObject({ gap: 14 });
    const more = host(r, 'More settings: loop, audio output, skip silence, voice boost');
    const flat = StyleSheet.flatten(more.props['style']) as Style;
    expect(flat).toMatchObject({ borderRadius: 20, minHeight: 56, paddingHorizontal: 14, paddingVertical: 12 });
    const detail = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'Loop, audio output, skip silence, voice boost')[0]!;
    expect(detail.props['numberOfLines']).toBeUndefined();
    press(r, 'More settings: loop, audio output, skip silence, voice boost');
    expect(labels(r)).toContain('Back to Playback');
    expect(labels(r)).not.toContain('Close the player settings');
    expect(styleOf(byId(r, 'speed-finer'))).toMatchObject({ borderRadius: 20, padding: 14, gap: 10 });
    expect(styleOf(byId(r, 'sleep-longer'))).toMatchObject({ borderRadius: 20, padding: 14, gap: 10 });
    expect(styleOf(byId(r, 'settings-tile'))).toMatchObject({ borderRadius: 20 });
    const names = r.root.findAll((n) => typeof n.props['name'] === 'string').map((n) => n.props['name'] as string);
    expect(names).toContain('repeat-outline');
  });
});

describe('nothing playing, as drawn', () => {
  it('the ring is at 118, the sentence ends 150 from the bottom, the pills 40 from the bottom, 20 in', () => {
    const h = harness();
    const r = mount(h.runtime);
    expect(styleOf(byId(r, 'player-ring'))).toMatchObject({ top: 118, width: 330, height: 330 });
    expect(styleOf(byId(r, 'player-empty-text'))).toMatchObject({ bottom: 150, left: 20, right: 20, gap: 12 });
    expect(styleOf(byId(r, 'player-empty-pills'))).toMatchObject({ bottom: 40, left: 20, right: 20, gap: 10 });
    expect(text(r)).toContain('Nothing is playing yet.');
  });
});

describe('the backdrop is the drawing\'s glow', () => {
  it('uses the drawing\'s pink and indigo, and its closest-side reach', () => {
    expect(glowPair(undefined, colour.hot)).toEqual(['#ff6b8b', '#5b3df5']);
    expect(glowPair('#336699', colour.hot)).toEqual(['#336699', '#5b3df5']);
    expect(glowPair(undefined, '#2dd4bf')[0]).toBe('#2dd4bf');
    expect(glowShape(GLOW_A)).toEqual({ cx: 0.35, cy: 0.5, rx: 0.35, ry: 0.5 });
    expect(glowShape(GLOW_B)).toEqual({ cx: 0.7, cy: 0.4, rx: expect.closeTo(0.3, 5), ry: 0.4 });
  });
});

describe('the now bar, as drawn (kit.js nowbar)', () => {
  const props = { mode: 'bar' as const, title: 'Why mornings matter', playing: true, positionMs: 752_000, durationMs: 2_890_000, bottom: 100, onToggle: jest.fn(), onOpen: jest.fn(), onQueue: jest.fn() };
  it('is 58 tall, 10 from each side, radius 18, 8 in, its parts 10 apart; the cover 42, the buttons 40', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(NowBar, props)); });
    rendered.push(r);
    expect(styleOf(byId(r, 'now-bar'))).toMatchObject({ left: 10, right: 10, bottom: 100 });
    expect(styleOf(byId(r, 'now-bar-row'))).toMatchObject({ minHeight: 58, borderRadius: 18, gap: 10, paddingHorizontal: 8 });
    expect(styleOf(byId(r, 'now-cover'))).toMatchObject({ width: 42, height: 42 });
    expect(styleOf(host(r, 'Pause'))).toMatchObject({ width: 40, height: 40 });
    expect(styleOf(host(r, 'Playlist'))).toMatchObject({ width: 40, height: 40 });
    expect(text(r)).toContain('12:32 / 48:10');
  });
});

describe('raw sizes are tokens (PlayerMoreSheet, PlayerTopBar and the rest of the player parts)', () => {
  const RAW = /\b(?:fontSize|lineHeight|paddingHorizontal|paddingVertical|padding|gap|borderRadius|width|height|minHeight|marginTop|marginBottom)\s*[:=]\s*\{?\s*-?\d/;
  const FILES = ['PlayerMoreSheet', 'PlayerTopBar', 'PlayerTitleBlock', 'PlayerTray', 'TransportRow', 'PlayerRing', 'SpeedControl', 'SleepTimerControl', 'NothingPlaying', 'EndOffer', 'ChapterList', 'PlayerBottom', 'MoonButton', 'Cap'];
  it.each(FILES)('%s has no raw size in a style', (name) => {
    const src = readFileSync(path.join(__dirname, '..', 'src', 'ui', 'player', `${name}.tsx`), 'utf8');
    const bad = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l) && RAW.test(l));
    expect(bad).toEqual([]);
  });
  it('the 26 px title is the `player` token, not a bare number', () => {
    expect(PLAYER.title).toBe(26);
    expect(PLAYER.titleLine).toBe(33);
    const src = readFileSync(path.join(__dirname, '..', 'src', 'ui', 'player', 'measures.ts'), 'utf8');
    expect(src).not.toMatch(/title:\s*26/);
  });
});

describe('the tray stays above the home inset (owner, 2026-10-06), whatever the inset', () => {
  it.each([0, 20, 34, 40, 50, 60])('inset %i: the tray\'s foot is at least 6 above it and never under the drawn 40', (bottom) => {
    const l = playerLayout(frame, { top: 50, bottom });
    expect(l.trayBottom).toBeGreaterThanOrEqual(Math.max(40, bottom + 6));
  });
});
