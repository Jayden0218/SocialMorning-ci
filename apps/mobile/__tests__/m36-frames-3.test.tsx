// Tests that the Search tabs and chips, the consent tick, the Updates card links, two "Show:" links and the hot pill are 44 pt frames, and that the iOS home screen is not judged.
/**
 * 036 T015c (lane B). The frame guard (`.maestro/check/a11y-frames.mjs`) read these off the hierarchies of run 41448376367: Search tabs 33 tall, the
 * Published chips 30, the "Search podcasts" field 31, the consent tick 22 x 22, the Updates card's "Open <show>" 16 and episode title 25, "Show: <name>" 18, the hot
 * pill 32. Jest has no layout engine, so this reads the style the engine is given: `minHeight` / `minWidth` 44 on the pressable that carries the name, and the
 * negative margin that keeps the row as drawn (never `hitSlop` alone). Where a pinned test reads the pill's own style (the chip's `height` 30, the hot pill's testID
 * on the 32 pill) the pill moved into the frame and the pinned node keeps its style.
 *
 * Not here: the Notifications switch's two tabs and the comments capsule (blocked by pins, tasks.md "Open questions"), the 18 pt avatar pins on the player ring
 * (a design decision, tasks.md "Open questions").
 *
 * The break that turns it red: take `minHeight` off one of them, or the `Dock` skip out of the guard (each was red before the fix, 2026-11-02).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { bars } from '@/design';
import { Animated } from 'react-native';
import { SearchZone } from '@/ui/search/SearchZone';
import { ConsentRow } from '@/ui/auth/Consent';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import { EpisodeTitleBlock } from '@/ui/episode/EpisodeTitleBlock';
import { EpisodeSheetBody } from '@/ui/episode/EpisodeSheetBody';
import { PlayerTopBar } from '@/ui/player/PlayerTopBar';
import type { UpdateRow } from '@/me/updates';

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: { View, createAnimatedComponent: (c: unknown) => c }, createAnimatedComponent: (c: unknown) => c, runOnJS: (f: unknown) => f, useAnimatedReaction: () => undefined, useAnimatedStyle: (f: () => object) => f(), useSharedValue: (v: number) => ({ value: v }), withDecay: (o: unknown) => o };
});
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: () => ({}) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/x',
  useLocalSearchParams: () => ({}),
}));
const mockStores = { downloads: { get: () => undefined, list: () => [], subscribe: () => () => undefined }, settings: { get: () => undefined, set: () => undefined }, feeds: { getEpisode: () => undefined, getShow: () => undefined }, subscriptions: { list: () => [], has: () => false }, speed: { get: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn(), useDownloads: () => new Proxy({}, { get: (_t, k) => (k === 'subscribe' ? () => () => undefined : () => Promise.resolve(undefined)) }), useSubscriptionSync: () => ({ push: jest.fn() }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: { listenerId: 'me' }, useEpisodeSocial: () => ({ cached: undefined }) }) }));
jest.mock('@/ui/player/hot', () => ({ hotMoments: () => [{ fromMs: 60_000, toMs: 70_000 }], hotPillText: () => 'next hot moment in 0:57', nextHot: () => ({ fromMs: 60_000, toMs: 70_000 }) }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ seek: () => undefined, subscribe: () => () => undefined, load: jest.fn() }),
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'playing', episodeId: 'e1', positionMs: 3_000, lastSavedMs: 0, durationMs: 600_000 }),
}));
jest.mock('@/storage/playable', () => ({ toPlayable: () => undefined }));
jest.mock('@/settings/queue', () => ({ queueEpisode: jest.fn(() => ({ kind: 'queued' })) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, el)); for (let i = 0; i < 4; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
/** The host that carries the name and a style (a wrapper component with only the label does not). */
const byLabel = (r: ReactTestRenderer, label: string | RegExp): ReactTestInstance => {
  const named = (n: ReactTestInstance | null): boolean => n !== null && typeof n.props['accessibilityLabel'] === 'string' && (typeof label === 'string' ? n.props['accessibilityLabel'] === label : label.test(n.props['accessibilityLabel'] as string));
  const found = r.root.findAll((n) => typeof n.type === 'string' && named(n) && n.props['style'] !== undefined);
  if (found.length === 0) throw new Error(`no host named ${String(label)}`);
  return found[0]!;
};
const MIN = bars.circle;

const zoneProps = (over: Record<string, unknown> = {}) => ({
  bottom: 6, results: true, tab: 'all' as const, onTab: jest.fn(), since: '30d' as const, onSince: jest.fn(), term: 'Journey', placeholder: 'Search', autoFocus: false,
  onChangeText: jest.fn(), onSubmit: jest.fn(), onClear: jest.fn(), onCancel: jest.fn(), onScan: jest.fn(),
  field: { ref: { current: null }, onLayout: jest.fn(), style: {} }, fadeIn: new Animated.Value(1).interpolate({ inputRange: [0, 1], outputRange: [0, 1] }), ...over,
});

describe('036 T015c: Search', () => {
  it('a result tab is a 44 frame: its 33 drawn height plus 11 of padding above, the row pulled up by 11, the underline still 2 at the foot', async () => {
    const r = await render(createElement(SearchZone, zoneProps()));
    for (const name of ['All', 'Shows', 'Episodes', 'Moments', 'People']) {
      const s = flat(byLabel(r, name));
      expect([name, s['minHeight'], s['paddingTop']]).toEqual([name, MIN, 11]);
      expect(s['borderBottomWidth']).toBe(2);
    }
    const row = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tablist')[0]!;
    expect(flat(row)['marginTop']).toBe(-11); // the row still takes the 33 it took
  });
  it('a Published chip is a 44 frame (-7 above and below) round the 30 pill; the pinned 30 height stays on the named node', async () => {
    const r = await render(createElement(SearchZone, zoneProps()));
    const s = flat(byLabel(r, 'Published: Any'));
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-7);
    expect(s['height']).toBe(30); // m31-t030-search pins it
    const pill = byLabel(r, 'Published: Any').findAll((n) => typeof n.type === 'string' && String(n.props['className'] ?? '').includes('rounded-pill'))[0]!;
    expect(flat(pill)['height']).toBe(30);
  });
  it('the search field\'s input is a 44 frame inside the 48 field', async () => {
    const r = await render(createElement(SearchZone, zoneProps()));
    expect(flat(byLabel(r, 'Search podcasts'))['minHeight']).toBe(MIN);
  });
});

describe('036 T015c: the consent tick, the Updates card, the Show links, the hot pill', () => {
  it('the consent tick is a 44 x 44 frame round the 22 box, -11 on each side so the row is as drawn', async () => {
    const r = await render(createElement(ConsentRow, { agreed: false, onToggle: jest.fn(), open: jest.fn() }));
    const s = flat(byLabel(r, /^I have read and agree/));
    expect([s['minWidth'], s['minHeight']]).toEqual([MIN, MIN]);
    expect([s['marginHorizontal'], s['marginVertical']]).toEqual([-11, -11]);
  });
  const item = { episode: { id: 'e1', feedUrl: 'https://f', title: 'Ep', durationMs: 69 * 60_000, publishedAt: Date.now() - 3_600_000 }, showTitle: 'Show', summary: 'Notes' } as unknown as UpdateRow;
  const noop = () => undefined;
  it('the Updates card\'s "Open <show>" is a 44 frame (-14 above and below its 16 line) and the episode title is at least 44', async () => {
    const r = await render(createElement(UpdateEpisodeRow, { item, now: Date.now(), onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop }));
    const show = flat(byLabel(r, 'Open Show'));
    expect(show['minHeight']).toBe(MIN);
    expect(show['marginVertical']).toBe(-14);
    expect(flat(byLabel(r, /^Ep, Show\./))['minHeight']).toBe(MIN);
  });
  it('"Show: <name>" on the Episode page is a 44 frame, -13 above and below its 18 line', async () => {
    const r = await render(createElement(EpisodeTitleBlock, { title: 'T', showTitle: 'Journey Morning', playing: false, subscribed: false, onBack: noop, onShow: noop, onPlay: noop, onSubscribe: noop, onCopyTitle: noop }));
    const s = flat(byLabel(r, 'Show: Journey Morning'));
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-13);
  });
  it('"Show: <name>" in the row sheet is the same 44 frame', async () => {
    const r = await render(createElement(EpisodeSheetBody, { episodeId: 'e1', title: 'T', showTitle: 'Journey Morning', onShow: noop, onClose: noop, onQueued: noop } as never));
    const s = flat(byLabel(r, 'Show: Journey Morning'));
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-13);
  });
  it('the hot pill\'s Pressable is a 44 frame (the top row\'s height); the 32 pill inside keeps its testID, height, radius and padding', async () => {
    const r = await render(createElement(PlayerTopBar, { episodeId: 'e1', onClose: noop, onMore: noop }));
    const frame = flat(byLabel(r, 'next hot moment in 0:57. Jump to it.'));
    expect(frame['minHeight']).toBe(MIN);
    const pill = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'hot-pill')[0]!;
    expect(flat(pill)).toMatchObject({ height: 32, borderRadius: 16, paddingHorizontal: 12 });
  });
});

describe('036 T015c: the guard does not judge the iOS home screen', () => {
  const SCRIPT = path.join(__dirname, '..', '.maestro', 'check', 'a11y-frames.mjs');
  const live = (label: string, bounds: string, children: unknown[] = []) => ({ attributes: { accessibilityText: label, 'resource-id': '', bounds, enabled: 'true' }, children });
  function run(tree: unknown): { status: number | null; out: string } {
    const dir = mkdtempSync(path.join(tmpdir(), 'frames3-'));
    mkdirSync(path.join(dir, 'hierarchy'), { recursive: true });
    writeFileSync(path.join(dir, 'hierarchy', 'r1-end.json'), JSON.stringify(tree));
    const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    return { status: res.status, out: res.stdout + res.stderr };
  }
  it('the Springboard\'s own "Search" pill (78 x 30, beside the Dock) is not our app\'s control', () => {
    const home = live('', '[0,0][390,844]', [live('Search', '[156,688][234,718]', [live('', '[156,688][234,718]', [live('Search', '[167,697][179,708]'), live('Search', '[182,695][222,710]')])]), live('Dock', '[0,736][390,832]', [live('Safari', '[116,750][184,818]')])]);
    expect(run(home).status).toBe(0);
  });
  it('the same 78 x 30 "Search" on a screen with no Dock is still a finding', () => {
    const r = run(live('', '[0,0][390,844]', [live('Search', '[156,688][234,718]')]));
    expect(r.status).toBe(1);
    expect(r.out).toContain('"Search" is 78 x 30 pt');
  });
});
