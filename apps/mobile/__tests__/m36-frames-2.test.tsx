// Tests that five more Discover and comment controls are touched as a 44 pt frame, not by hitSlop alone (036 T015b).
/**
 * 036 T015b (lane L3b). The extended frame guard (`.maestro/check/a11y-frames.mjs`) read these off a device-check
 * hierarchy: "Not liking these? Tell us why" 115 x 18, the chart names "Top chart" / "Talked about chart" 240 x 20, a
 * chart row 186 x 40, the daily pick's "Open the show" 104 x 19. Jest has no layout engine, so this reads the style
 * the engine is given: `minHeight` 44 on the pressable, and the negative margin (or, for the link under a deck whose
 * margin is pinned, the `top` offset) that keeps the row as drawn.
 *
 * The break that turns it red: take `minHeight: bars.circle` off one of them (each was red before the fix, 2026-11-02).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { RecFeedbackLink } from '@/ui/discover/RecFeedback';
import { ChartSection } from '@/ui/discover/ChartSection';
import { DeckLink } from '@/ui/discover/Deck';
import { bars } from '@/design';
import type { EpisodeCard } from '@/social/api';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: { View }, runOnJS: (f: unknown) => f, useAnimatedReaction: () => undefined, useAnimatedStyle: (f: () => object) => f(), useSharedValue: (v: number) => ({ value: v }), withDecay: (o: unknown) => o };
});
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: () => ({}) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/x',
  useLocalSearchParams: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined }, feeds: {}, feedCache: {}, subscriptions: { list: () => [], has: () => false } }), useToast: () => jest.fn(), useDownloads: () => ({}), useSubscriptionSync: () => ({ push: jest.fn() }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: (p: { list: unknown }) => p.list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: jest.fn(), play: jest.fn(), queue: jest.fn() }) }));
const mockDaily = { daily: () => Promise.resolve({ date: '2026-10-27', items: [{ feedUrl: 'f9', guid: 'g9', why: 'A note.', episode: null }] }) };
jest.mock('@/discover/explore-api', () => ({ CHART_LABELS: {}, useExploreApi: () => mockDaily }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: { listenerId: 'me' } }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ hiddenFeeds: new Set<string>() }) }));
jest.mock('@/config/store', () => ({ useSectionTitle: (t: string) => t, useAppConfig: () => undefined }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
jest.mock('@/playback/store', () => ({ usePlayer: () => ({ load: jest.fn() }), usePlayerSelector: () => true }));
jest.mock('@/storage/playable', () => ({ toPlayable: () => undefined }));
jest.mock('@/settings/queue', () => ({ queueEpisode: jest.fn(() => ({ kind: 'queued' })) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import DailyScreen from '../app/picks/daily';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  const found = r.root.findAll((n) => is(n) && n.props['style'] !== undefined && !(is(n.parent) && n.parent!.props['style'] !== undefined)); // the first one that carries a style (a wrapper component with only the label does not)
  if (found.length === 0) throw new Error(`no pressable named "${label}"`);
  return found[0]!;
};
const card = (id: string): EpisodeCard => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `Title ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3` });

describe('036 T015b: the frame is 44, the row is as drawn', () => {
  it('the link under a deck ("Not liking these? Tell us why", "Full chart") is a 44 frame, lifted so its words stay 10 below the deck', async () => {
    const r = await render(createElement(RecFeedbackLink));
    const s = flat(byLabel(r, 'Not liking these? Tell us why'));
    expect(s['minHeight']).toBe(bars.circle);
    // Spec 039 D4 (was: lifted by -half with `marginBottom` giving back the excess, `marginTop` 10 under the deck): on Discover the link sits in a Section's
    // 12 gap, a plain 44 tall frame with no lift; only the search page's `DeckLink` below keeps the lifted frame.
    expect(s['marginBottom']).toBeUndefined();
    expect(s['top']).toBeUndefined();
    const d = await render(createElement(DeckLink, { label: 'Full chart', onPress: jest.fn() }));
    expect(flat(byLabel(d, 'Full chart'))['minHeight']).toBe(bars.circle);
  });
  // Spec 039 integration: the chart name is a control again (it scrolls the Charts shelf to its card), so the 036 frame assertion is back as it was.
  it('a chart name ("Top chart") is a 44 frame inside the header, -12 above and below its 20 line', async () => {
    const tabs = [{ key: 'top' as const, label: 'Top', rows: [card('a')] }, { key: 'talked' as const, label: 'Talked about', rows: [card('b')] }];
    const r = await render(createElement(ChartSection, { tabs, onOpen: jest.fn(), onPlay: jest.fn() }));
    for (const name of ['Top chart', 'Talked about chart']) {
      const s = flat(byLabel(r, name));
      expect([name, s['minHeight']]).toEqual([name, bars.circle]);
      expect([name, s['marginVertical']]).toEqual([name, -12]);
    }
  });
  it('a chart row ("Episode 1, Show") is a 44 frame, -2 above and below, so the 54 row stays 54', async () => {
    const r = await render(createElement(ChartSection, { tabs: [{ key: 'top' as const, label: 'Top', rows: [card('a')] }], onOpen: jest.fn(), onPlay: jest.fn() }));
    const s = flat(byLabel(r, 'Title a, Show a'));
    expect(s['minHeight']).toBe(bars.circle);
    expect(s['marginVertical']).toBe(-2);
  });
  it('the daily pick\'s "Open the show" is a 44 frame that ends at the cover\'s foot, its words kept 10 above it by padding', async () => {
    const r = await render(createElement(DailyScreen));
    const s = flat(byLabel(r, 'Open the show'));
    expect(s['minHeight']).toBe(bars.circle);
    expect(s['bottom']).toBe(0); // the whole frame is inside the cover (a touch outside its parent is lost on Android)
    expect(s['paddingBottom']).toBe(10); // the words stay where they were drawn: bottom 10
    expect(s['justifyContent']).toBe('flex-end');
  });
});
