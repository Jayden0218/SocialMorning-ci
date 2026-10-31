// Checks the seven M24 phone fixes (lane F-P) stay fixed.
/**
 * Owner, 2026-10-08, "fix all":
 *  1. the rating prompt opened on every start — it asks until any answer, then never again
 *     (guard G-M24-FP1; the break: make `shouldAskRating` return true again, as `EVERY_START` did —
 *     or stop an answer being recorded: the rendered sheet then slides up again on the next mount);
 *  2. the main Play buttons are the fixed strong yellow (`play`), whatever the accent theme;
 *  3. the Home pick card has the design's "▶ Play" pill AND keeps "+";
 *  4. an episode its creator hid leaves the phone's lists (guard G-M24-FP2; the break: make
 *     `withoutHidden` in src/feeds/hidden.ts return every episode);
 *  5. a multiple-choice poll shows every chosen option, and a tap toggles one;
 *  6. Notifications has "System notices" (server key `system`, on by default);
 *  7. after an email change: "Email changed. Signed out of N other devices."
 *
 * M25 lane GB: the checks that read component source are now RENDER tests (the rate sheet, the
 * Play pills, the pick card, the Notifications page, the change-email page). What still reads
 * source is marked KEPT with its reason: facts that live only inside the player, episode, show,
 * subscriptions and library pages (40–55 imports each) and the generated global.css.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { CachedEpisode } from '@/storage/types';

// jest.mock factories are hoisted, so anything they touch must be named `mock*`.
const mockVote = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockToast = jest.fn();
const mockMap = new Map<string, string>();
const mockSettings = { get: (k: string) => mockMap.get(k), set: (k: string, v: string) => { mockMap.set(k, v); }, delete: (k: string) => { mockMap.delete(k); } };
const mockAuthSet = jest.fn();
const mockRefreshListener = jest.fn();
const mockPushPrefs = jest.fn(() => Promise.resolve());
const mockM22 = { pushSwitches: jest.fn(() => Promise.resolve({} as Record<string, boolean>)), setPushSwitches: jest.fn((_p: Record<string, boolean>) => Promise.resolve()) };
const mockM12 = { notifyShows: () => Promise.resolve([]), setNotifyShow: () => Promise.resolve() };
const mockAccount = { startEmailChange: jest.fn((_e: string) => Promise.resolve()), confirmEmailChange: jest.fn((_a: string, _b: string) => Promise.resolve({ email: 'new@e.com', signedOut: 2 })) };
// One object each for the whole run, as the real providers give: a new one per render changes the
// pages' useCallback deps, re-runs their focus effects (which set state) and renders for ever —
// the gate 37744935171 timeouts on the Notifications and change-email pages.
const mockSocial = {
  api: { social: () => Promise.resolve({ status: 404 }), votePoll: (...a: unknown[]) => mockVote(...a), pushPrefs: (...a: unknown[]) => (mockPushPrefs as (...x: unknown[]) => Promise<void>)(...a) },
  listener: { listenerId: 'me', displayName: 'Me', email: 'old@e.com' },
  refreshListener: () => mockRefreshListener(),
};
const mockStores = { settings: mockSettings, feeds: { getShow: () => undefined }, auth: { set: (...a: unknown[]) => mockAuthSet(...a), get: () => undefined } };
const mockToastFn = (...a: unknown[]) => mockToast(...a);
const mockRouter = { back: () => mockBack(), push: (...a: unknown[]) => mockPush(...a) };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack() },
    useRouter: () => mockRouter,
    useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); },
    Link: (p: { children?: unknown }) => p.children,
  };
});
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockStores,
  useToast: () => mockToastFn,
  useCovered: () => false,
}));
jest.mock('@/ui/kit/PageHeader', () => ({ PageHeader: () => null }));
// M31 S-B: the Updates / Notifications pages sit in the settings page body (`PushedPage` under it needs the router's path); the bar is not what these guards are about.
const mockBody = (c: unknown): unknown => (typeof c === 'function' ? (c as (layout: { top: number; titleBottom: number; reserve: number }) => unknown)({ top: 0, titleBottom: 0, reserve: 0 }) : c);
// M31 S-A: a page with a bottom zone (Change email's button) passes it as `below`; draw it after the body.
jest.mock('@/ui/kit/PushedPage', () => ({
  PushedPage: (p: { children: unknown; below?: unknown }) => {
    const { createElement, Fragment } = require('react');
    return createElement(Fragment, null, mockBody(p.children), p.below ?? null);
  },
}));
jest.mock('@/notify/expo', () => ({ expoNotify: { status: () => Promise.resolve('granted') } }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/ui/settings/NotifyShows', () => ({ NotifyShows: () => null }));
jest.mock('@/social/api-m22-social', () => ({ useM22SocialApi: () => mockM22 }));
jest.mock('@/social/account-api', () => ({ ...(jest.requireActual('@/social/account-api') as Record<string, unknown>), useAccountApi: () => mockAccount }));

import { RATE_KEY, RateSheet, rateMayAsk, shouldAskRating } from '@/ui/shell/RateSheet';
import * as RateModule from '@/ui/shell/RateSheet';
import { ACCENTS, colour, PAIRS, contrastRatio, BODY_MIN } from '@/design';
import { applyAccent, withAccent } from '@/design/accent';
import { hiddenKey, readHiddenGuids, refreshHiddenGuids, saveHiddenGuids, visibleEpisodes, withoutHidden } from '@/feeds/hidden';
import { latestUpdates } from '@/me/updates';
import { searchLibrary } from '@/discover/local-search';
import { ShowExtrasBlock, chosenOptions } from '@/ui/show/ShowExtras';
import { createApi, type EpisodeCard, type NextUpItem, type ShowPoll } from '@/social/api';
import { getPref } from '@/settings/prefs';
import { createAccountApi, emailChangedLine } from '@/social/account-api';
import { KEY_PICKED } from '@/discover/interests';
import { getAppConfig } from '@/config/store';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { Icon } from '@/ui/kit/Icon';
import { EndOffer } from '@/ui/player/EndOffer';
import { QueueList } from '@/ui/queue/QueueList';
import { PicksSection } from '@/ui/discover/sections';
import PushSettings from '../app/settings/push';
import ChangeEmailScreen from '../app/settings/account-email';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); }, delete: (k: string) => { m.delete(k); } };
};
/** The first (outermost) node with this label that takes a tap. */
const tap = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
const classes = (n: ReactTestInstance): string[] => String(n.props['className'] ?? '').split(/\s+/);
/** The node a string is drawn by (its nearest node carrying a className). */
const textNode = (r: ReactTestRenderer, words: string): ReactTestInstance =>
  r.root.findAll((n) => n.props['children'] === words && typeof n.props['className'] === 'string')[0]!;

describe('1. G-M24-FP1: the rating prompt asks once, never again after any answer', () => {
  it('asks while there is no answer', () => {
    const s = memory();
    expect(shouldAskRating(s as never)).toBe(true);
    expect(rateMayAsk(s as never, { onTabs: true, blockedThisLaunch: false })).toBe(true);
  });
  it.each(['rate', 'feedback', 'closed'])('after "%s" it never asks again', (answer) => {
    const s = memory();
    s.set(RATE_KEY, answer);
    expect(shouldAskRating(s as never)).toBe(false);
    expect(rateMayAsk(s as never, { onTabs: true, blockedThisLaunch: false })).toBe(false);
  });
  it('the testing switch is gone', () => {
    expect('EVERY_START' in RateModule).toBe(false);
  });
});

describe('1 (rendered). every way out of the sheet records an answer, and the sheet never comes back', () => {
  // The sheet waits `delayMs` before it slides up, and gluestack's motion runs on timers.
  beforeAll(() => { jest.useFakeTimers(); });
  afterAll(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  beforeEach(() => {
    mockMap.clear();
    // Interests already picked, so the first-open interests page does not block the sheet.
    mockMap.set(KEY_PICKED, '[1,2]');
    mockPush.mockClear();
    mockToast.mockClear();
  });

  const mount = (): ReactTestRenderer => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(GluestackUIProvider, null, createElement(RateSheet, { onTabs: true, segment: '(tabs)', consent: true }))); });
    act(() => { jest.advanceTimersByTime(getAppConfig().ratePrompt.delayMs + 50); });
    return r;
  };
  const shown = (r: ReactTestRenderer): boolean => tap(r, 'Rate us') !== undefined;

  it.each([
    ['Give feedback', 'feedback'],
    ['Rate us', 'rate'],
  ])('"%s" records "%s"; the next start does not ask', (label, answer) => {
    const r = mount();
    expect(shown(r)).toBe(true);
    act(() => { tap(r, label)!.props['onPress'](); });
    expect(mockMap.get(RATE_KEY)).toBe(answer);
    if (answer === 'feedback') expect(mockPush).toHaveBeenCalledWith('/settings/feedback');
    if (answer === 'rate') expect(mockToast).toHaveBeenCalledWith('Thank you! Ratings open when SocialNet is in the store.');
    act(() => { jest.runOnlyPendingTimers(); });
    act(() => r.unmount());
    const again = mount();
    expect(shown(again)).toBe(false);
    act(() => again.unmount());
  });

  it('the backdrop / back gesture (the kit sheet\'s onClose) and the ✕ both record "closed"', () => {
    const r = mount();
    expect(shown(r)).toBe(true);
    act(() => { (r.root.findAll((n) => n.type === ActionSheet)[0]!.props['onClose'] as () => void)(); });
    expect(mockMap.get(RATE_KEY)).toBe('closed');
    act(() => { jest.runOnlyPendingTimers(); });
    act(() => r.unmount());
    mockMap.delete(RATE_KEY);
    const x = mount();
    act(() => { tap(x, 'Close')!.props['onPress'](); });
    expect(mockMap.get(RATE_KEY)).toBe('closed');
    act(() => { jest.runOnlyPendingTimers(); });
    act(() => x.unmount());
    expect(shown(mount())).toBe(false);
  });

  /**
   * M31 S-C (T062; design-pulse2 `rate-sheet--sheet`): the sheet's numbers read off the render — the close circle 36, the title
   * Unbounded 21, the thumbs disc 60, the two buttons 52 and side by side (ring then hot). Break that turns it red: change
   * `AUTH.rate.button` or `AUTH.rate.disc` (src/ui/auth/measures.ts).
   */
  it('M31: close 36, title 21, thumbs disc 60 round, Give feedback and Rate us 52 tall side by side', () => {
    const r = mount();
    const style = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
    expect(style(tap(r, 'Give feedback')!)['height']).toBe(52);
    expect(style(tap(r, 'Rate us')!)['height']).toBe(52);
    const close = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close' && typeof n.props['onPress'] === 'function' && style(n)['width'] === 36);
    expect(close.length).toBeGreaterThan(0);
    const disc = r.root.findAll((n) => n.props['testID'] === 'rate-disc' && typeof n.type === 'string')[0]!;
    expect(style(disc)).toMatchObject({ width: 60, height: 60, borderRadius: 30 });
    const title = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header' && style(n)['fontSize'] === 21)[0]!;
    expect(title).toBeDefined();
    // "A rating helps a lot" is drawn one character at a time, hot to violet: the first and last differ.
    const chars = r.root.findAll((n) => n.props['testID'] === 'glow-words')[0]!.findAll((n) => typeof n.type === 'string' && n.children.length === 1 && typeof n.children[0] === 'string' && n.children[0] !== ' ');
    const colourOf = (n: ReactTestInstance): unknown => style(n)['color'];
    expect(colourOf(chars[0]!)).not.toBe(colourOf(chars[chars.length - 1]!));
    act(() => { jest.runOnlyPendingTimers(); });
    act(() => r.unmount());
  });
});

describe('2. main Play buttons are the fixed light circle, whatever the accent', () => {
  it('`play` is the Pulse light circle #f4f2ee with void words under every accent theme, and the pair clears 4.5', () => {
    for (const name of Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]) {
      const p = withAccent(colour, name);
      expect(p.play).toBe('#f4f2ee');
      expect(p.onPlay).toBe('#060608');
    }
    expect(withAccent(colour, 'teal').primary).not.toBe('#f4f2ee');
    expect(PAIRS.some((p) => p.fg === colour.onPlay && p.bg === colour.play)).toBe(true);
    expect(contrastRatio(colour.onPlay, colour.play)).toBeGreaterThanOrEqual(BODY_MIN);
  });
  // KEPT as a source check: global.css is generated CSS, not a component — nothing to render.
  it('global.css carries the token (light, dark and the theme)', () => {
    expect(read('global.css').match(/--color-play: #f4f2ee;/g)).toHaveLength(3);
    expect(read('global.css').match(/--color-onPlay: #060608;/g)).toHaveLength(3);
  });

  describe('rendered under the Teal accent: the pills are `bg-play` / `text-onPlay`, the glyph is onPlay', () => {
    // `bg-play` and `bg-primary` are different colours, so the class names tell
    // them apart; under Teal the JS palette (icons, the ring) shows a `primary` slip as teal.
    beforeAll(() => { applyAccent('teal'); });
    afterAll(() => { applyAccent('sunrise'); });
    const teal = ACCENTS.teal.light;
    const pill = (n: ReactTestInstance) => {
      expect(classes(n)).toContain('bg-play');
      expect(classes(n)).not.toContain('bg-primary');
      const glyph = n.findAll((x) => x.type === Icon)[0]!;
      expect(glyph.props['color']).toBe(colour.onPlay);
      expect(glyph.props['color']).not.toBe(teal.primary);
    };

    it('Play it (the episode-end card)', () => {
      const onPlay = jest.fn();
      const item: NextUpItem = { episode: { id: 'e9', feedUrl: 'https://f/x.xml', guid: 'e9', title: 'Next one', showTitle: 'Show', enclosureUrl: 'https://a/e9.mp3' }, reason: 'alsoListened', label: 'People also listened' };
      let r!: ReactTestRenderer;
      act(() => { r = create(createElement(EndOffer, { item, onPlay })); });
      const button = r.root.findAll((n) => n.props['onPress'] === onPlay)[0]!;
      pill(button);
      expect(classes(textNode(r, 'Play it'))).toContain('text-onPlay');
      act(() => { button.props['onPress'](); });
      expect(onPlay).toHaveBeenCalled();
    });

    const stores = {
      feeds: {
        getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: id === 'e1' ? 'First' : 'Second', durationMs: 60_000 }),
        getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
      },
      positions: { get: () => undefined },
      downloads: { get: () => undefined },
    } as never;
    const list = (onPlay: (id: string) => void): ReactTestRenderer => {
      let r!: ReactTestRenderer;
      act(() => { r = create(createElement(GluestackUIProvider, null, createElement(QueueList, { ids: ['e1', 'e2'], stores, onChange: jest.fn(), onPlay, onOpen: jest.fn() }))); });
      return r;
    };

    // M31 W3-B: the queue page's pills are the Pulse light ones (`bg-text`, void glyph) — they do not follow the accent at all.
    it('Queue page: the next episode\'s Play now pill is light, with a void glyph, whatever the accent', () => {
      const onPlay = jest.fn();
      const r = list(onPlay);
      const button = tap(r, 'Play First')!;
      expect(classes(button)).toContain('bg-text');
      expect(classes(button)).not.toContain('bg-primary');
      expect(button.findAll((x) => x.type === Icon)[0]!.props['color']).toBe(colour.void);
      act(() => { button.props['onPress'](); });
      expect(onPlay).toHaveBeenCalledWith('e1');
    });

    it('Queue page: the Play circle on the other cards is light too (bg-text), not the Teal primary', () => {
      const onPlay = jest.fn();
      const r = list(onPlay);
      const button = tap(r, 'Play Second')!;
      expect(classes(button)).toContain('bg-text');
      expect(classes(button)).not.toContain('bg-primary');
      act(() => { button.props['onPress'](); });
      expect(onPlay).toHaveBeenCalledWith('e2');
    });
  });

  // KEPT as source checks: the player's big Play disc is drawn by src/ui/player/TransportRow.tsx (M31) and
  // the Episode page's by app/episode/[id].tsx (~52 imports); neither has a smaller part to render here.
  it('player and Episode page use it, not `primary`', () => {
    expect(read('src/ui/player/TransportRow.tsx')).toMatch(/className="rounded-pill bg-play items-center justify-center"/);
    expect(read('src/ui/player/TransportRow.tsx')).toMatch(/size=\{PLAYER\.playGlyph\} color=\{c\.onPlay\}/); // 32, the `player` token (round 2)
    // M31 W3-A (T040): the Episode page's Play is the Pulse light pill (`PulseButton kind="light"`: the text fill, void words),
    // never the accent. Rendered (48 tall) in m31-w3a-episode.test.tsx.
    const ep = read('src/ui/episode/EpisodeTitleBlock.tsx');
    expect(ep).toMatch(/<PulseButton label=\{props\.playing \? 'Pause' : 'Play this episode'\}[^>]*kind="light"/);
    expect(ep).not.toMatch(/bg-primary|kind="hot"/);
  });
});

describe('3. the Home pick card: "+" and the design\'s Play, side by side', () => {
  // M31 T030 (Pulse, `home--fold-a`): the deck card's foot has the "+" ring (38) and the light Play disc (38) in one row.
  // The break: draw Play in the accent (`bg-primary`), or put it before "+" / in another row.
  it('both sit in the card\'s foot, "+" first; Play is the fixed light disc and plays the pick', () => {
    const card: EpisodeCard = { id: 'p1', feedUrl: 'https://f/p1.xml', guid: 'p1', title: 'Title p1', showTitle: 'Show p1', enclosureUrl: 'https://a/p1.mp3' };
    const onPlay = jest.fn();
    const onQueue = jest.fn();
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode: card }], onOpen: jest.fn(), onPlay, onQueue })); });
    const add = tap(r, 'Add Title p1 to the queue')!;
    const button = tap(r, 'Play Title p1')!;
    // Siblings in one row: "+" then Play.
    // Each is wrapped by its own component (RingAdd, DiscPlay); those two are siblings in one row. (A failed toBe on instances would print the whole tree.)
    const row = add.parent!.parent!.children;
    expect(add.parent!.parent === button.parent!.parent).toBe(true);
    expect(row.indexOf(button.parent!)).toBe(row.indexOf(add.parent!) + 1);
    expect(classes(button)).toContain('bg-text');
    expect(classes(button)).not.toContain('bg-primary');
    expect(button.findAll((x) => x.type === Icon)[0]!.props['color']).toBe(colour.void);
    // Drawn 38 across, touched 48 (`hitSlop`).
    expect([StyleSheet.flatten(button.props['style']).width, StyleSheet.flatten(add.props['style']).width]).toEqual([38, 38]);
    act(() => { button.props['onPress'](); });
    expect(onPlay).toHaveBeenCalledWith(card);
    act(() => { add.props['onPress'](); });
    expect(onQueue).toHaveBeenCalledWith(card);
  });
});

const ep = (guid: string, publishedAt: number): CachedEpisode => ({
  id: `id-${guid}`, feedUrl: 'https://f/a.xml', guid, guidSource: 'guid', title: `Title ${guid}`, enclosureUrl: `https://a/${guid}.mp3`, publishedAt,
} as unknown as CachedEpisode);

describe('4. G-M24-FP2: an episode its creator hid is not listed', () => {
  const FEED = 'https://f/a.xml';
  const eps = [ep('new', 3), ep('hidden', 2), ep('old', 1)];
  const stores = (settings: ReturnType<typeof memory>) => ({
    settings: settings as never,
    subscriptions: { list: () => [{ feedUrl: FEED }] } as never,
    feeds: { listEpisodes: () => eps, getShow: () => ({ title: 'Show A' }), getEpisode: () => undefined } as never,
  });

  it('withoutHidden drops exactly the hidden guids', () => {
    expect(withoutHidden(eps, new Set(['hidden'])).map((e) => e.guid)).toEqual(['new', 'old']);
    expect(withoutHidden(eps, new Set()).map((e) => e.guid)).toEqual(['new', 'hidden', 'old']);
  });

  it('the remembered answer is read back; an empty answer clears it; junk reads as none', () => {
    const s = memory();
    saveHiddenGuids(s, FEED, ['hidden', 'hidden']);
    expect([...readHiddenGuids(s, FEED)]).toEqual(['hidden']);
    saveHiddenGuids(s, FEED, []);
    expect(readHiddenGuids(s, FEED).size).toBe(0);
    s.set(hiddenKey(FEED), 'not json');
    expect(readHiddenGuids(s, FEED).size).toBe(0);
    s.set(hiddenKey(FEED), '{"a":1}');
    expect(readHiddenGuids(s, FEED).size).toBe(0);
    expect(readHiddenGuids(undefined, FEED).size).toBe(0);
  });

  it('Updates (and so play-latest, the car, Siri), the library search and the show list leave it out', () => {
    const s = memory();
    saveHiddenGuids(s, FEED, ['hidden']);
    const st = stores(s);
    expect(visibleEpisodes(st, FEED).map((e) => e.guid)).toEqual(['new', 'old']);
    expect(latestUpdates(st, new Set()).map((r) => r.episode.guid)).toEqual(['new', 'old']);
    expect(searchLibrary(st, 'Title').episodes.map((e) => e.guid)).toEqual(['new', 'old']);
  });

  it('each refresh asks the server per show; a failed answer keeps the last one', async () => {
    const s = memory();
    saveHiddenGuids(s, FEED, ['hidden']);
    await refreshHiddenGuids(s, [FEED, 'https://f/b.xml'], async (f) => { if (f === FEED) throw new Error('offline'); return ['x']; });
    expect([...readHiddenGuids(s, FEED)]).toEqual(['hidden']);
    expect([...readHiddenGuids(s, 'https://f/b.xml')]).toEqual(['x']);
  });

  it('the client asks the server\'s hidden-episodes route for one show and reads its guids', async () => {
    const urls: string[] = [];
    const api = createApi({
      baseUrl: 'https://api.test', getToken: async () => undefined,
      fetch: (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify({ guids: ['g1'] }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch,
    });
    expect(await api.hiddenEpisodes('https://f/a b.xml')).toEqual(['g1']);
    expect(urls[0]).toBe(`https://api.test/v1/shows/hidden-episodes?feedUrl=${encodeURIComponent('https://f/a b.xml')}`);
  });

  // KEPT as source checks: the wiring lives only inside app/show/[feedUrl].tsx (~47 imports),
  // app/subscriptions.tsx (~31) and app/(tabs)/library.tsx (~35); the logic they call is rendered-free
  // and tested above.
  it('the show page, the subscriptions page and the library refresh are wired to it', () => {
    const show = read('app/show/[feedUrl].tsx');
    expect(show).toMatch(/const visible = withoutHidden\(episodes, hiddenGuids\)/);
    expect(show).toMatch(/saveHiddenGuids\(stores\.settings, feedUrl, serverHidden\)/);
    expect(read('app/subscriptions.tsx')).toMatch(/const latest = visibleEpisodes\(stores, feedUrl\)\[0\]/);
    // M32 C3: the screens call the shared refresh service; the hidden-episodes lookup is still passed.
    const wired = /refreshFeeds\(stores, \{[^}]*hiddenOf: (?:social\.)?api\?\.hiddenEpisodes/g;
    expect(read('app/subscriptions.tsx').match(wired)).toHaveLength(1);
    expect(read('app/(tabs)/library.tsx').match(wired)).toHaveLength(2);
  });
});

const texts = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const poll = (over: Partial<ShowPoll> = {}): ShowPoll => ({
  id: 'p1', question: 'Which topics?', episodeId: null, endsAt: '2026-10-30T00:00:00Z', closedAt: null, open: true, total: 3,
  options: [{ idx: 0, label: 'Books', votes: 2 }, { idx: 1, label: 'Films', votes: 1 }, { idx: 2, label: 'Games', votes: 0 }],
  multi: true, voters: 2, myVote: 0, myVotes: [0, 1], ...over,
});

describe('5. a multiple-choice poll shows every chosen option; a tap toggles one', () => {
  it('chosenOptions: myVotes when sent, else the single myVote', () => {
    expect([...chosenOptions({ myVotes: [0, 2] })]).toEqual([0, 2]);
    expect([...chosenOptions({ myVote: 1 })]).toEqual([1]);
    expect(chosenOptions({ myVote: null }).size).toBe(0);
    expect(chosenOptions({}).size).toBe(0);
  });

  it('both chosen options are marked; tapping a chosen one removes it, an unchosen one adds it', async () => {
    const onPoll = jest.fn();
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(ShowExtrasBlock, { extras: { overrides: null, announcements: [], polls: [poll()] }, onPoll })); });
    expect(texts(r)).toEqual(expect.arrayContaining(['Books ✓', 'Films ✓', 'Games', 'Poll from the host · choose any', '2 voters · tap an answer to add or remove it']));
    // Share of voters: Books 2 of 2.
    expect(texts(r)).toContain('100%');
    const toggled = poll({ myVotes: [0], options: [{ idx: 0, label: 'Books', votes: 2 }, { idx: 1, label: 'Films', votes: 0 }, { idx: 2, label: 'Games', votes: 0 }] });
    mockVote.mockResolvedValueOnce(toggled);
    await act(async () => { byLabel(r, 'Films: 50 percent, chosen, tap to remove').props['onPress'](); });
    expect(mockVote).toHaveBeenLastCalledWith('p1', 1);
    expect(onPoll).toHaveBeenLastCalledWith(toggled);
    mockVote.mockResolvedValueOnce(poll());
    await act(async () => { byLabel(r, 'Games: 0 percent, tap to add').props['onPress'](); });
    expect(mockVote).toHaveBeenLastCalledWith('p1', 2);
  });

  it('a single-choice poll is as before: one ✓, the chosen row takes no tap', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(ShowExtrasBlock, { extras: { overrides: null, announcements: [], polls: [poll({ multi: false, myVotes: [0], myVote: 0, total: 2, voters: 2, options: [{ idx: 0, label: 'Books', votes: 1 }, { idx: 1, label: 'Films', votes: 1 }] })] }, onPoll: jest.fn() })); });
    // (each string shows once per rendered layer, so compare the distinct ones)
    expect([...new Set(texts(r).filter((t) => t.endsWith('✓')))]).toEqual(['Books ✓']);
    expect(texts(r)).toContain('2 votes · tap another answer to change your vote');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Books: 50 percent, your vote' && typeof n.props['onPress'] === 'function' && n.props['disabled'] === false)).toHaveLength(0);
  });
});

describe('6. Notifications: "System notices", server key `system`, on by default', () => {
  beforeEach(() => { mockMap.clear(); mockM22.setPushSwitches.mockClear(); mockM22.pushSwitches.mockReset(); });

  it('the default', () => {
    expect(getPref(memory() as never, 'pushSystem')).toBe(true);
  });

  it('the page draws the row, on by default; a flip is kept here and sent as `system`', async () => {
    mockM22.pushSwitches.mockResolvedValue({});
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(PushSettings)); });
    // M31 S-B: the group is named by the edge label SOCIALNET (design-pulse2 `settings-push--screen`), drawn in capitals.
    expect(texts(r)).toEqual(expect.arrayContaining(['SOCIALNET', 'System notices', 'Notices from SocialNet']));
    const toggle = tap(r, 'System notices')!;
    expect(toggle.props['accessibilityState']).toEqual(expect.objectContaining({ checked: true }));
    await act(async () => { toggle.props['onPress'](); });
    expect(mockM22.setPushSwitches).toHaveBeenCalledWith({ system: false });
    expect(getPref(mockSettings as never, 'pushSystem')).toBe(false);
    expect(tap(r, 'System notices')!.props['accessibilityState']).toEqual(expect.objectContaining({ checked: false }));
    act(() => r.unmount());
  });

  it('on open the server\'s `system` value wins', async () => {
    mockM22.pushSwitches.mockResolvedValue({ system: false });
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(PushSettings)); });
    expect(tap(r, 'System notices')!.props['accessibilityState']).toEqual(expect.objectContaining({ checked: false }));
    act(() => r.unmount());
  });
});

describe('7. change email: how many other devices were signed out', () => {
  it('the line', () => {
    expect(emailChangedLine(0)).toBe('Email changed.');
    expect(emailChangedLine(1)).toBe('Email changed. Signed out of 1 other device.');
    expect(emailChangedLine(3)).toBe('Email changed. Signed out of 3 other devices.');
  });
  it('the client reads `signedOut` (absent → 0)', async () => {
    const answer = (body: unknown) => ({
      baseUrl: 'https://api.test', getToken: async () => 'tok',
      fetch: (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
    });
    expect(await createAccountApi(answer({ email: 'n@e.com', signedOut: 2 })).confirmEmailChange('123456', '654321')).toEqual({ email: 'n@e.com', signedOut: 2 });
    expect(await createAccountApi(answer({ email: 'n@e.com' })).confirmEmailChange('123456', '654321')).toEqual({ email: 'n@e.com', signedOut: 0 });
  });
  it('the page, rendered: both codes in, "Change email" → the toast says how many devices, then back', async () => {
    mockToast.mockClear();
    mockBack.mockClear();
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(ChangeEmailScreen)); });
    const field = (label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onChangeText'] === 'function')[0]!;
    act(() => { field('New email').props['onChangeText']('new@e.com'); });
    await act(async () => { tap(r, 'Email me a code')!.props['onPress'](); });
    expect(mockAccount.startEmailChange).toHaveBeenCalledWith('new@e.com');
    act(() => { field('Code from your new email').props['onChangeText']('123456'); });
    act(() => { field('Code from your current email').props['onChangeText']('654321'); });
    await act(async () => { tap(r, 'Change email')!.props['onPress'](); });
    expect(mockAccount.confirmEmailChange).toHaveBeenCalledWith('123456', '654321');
    expect(mockToast).toHaveBeenCalledWith('Email changed. Signed out of 2 other devices.');
    expect(mockBack).toHaveBeenCalled();
    expect(mockAuthSet).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@e.com' }), expect.any(Number));
    act(() => r.unmount());
  });
});
