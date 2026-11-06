// Spec 039 I2 (plan D2: behaviour stays): the chart page fetches the chart before and the chart after the one shown, in the background.
/**
 * The old `FullPager` kept the shown chart and its two neighbours mounted, so each neighbour had already asked for its data when a swipe reached it.
 * The Detail lane drew one chart at a time and lost that. Asks: showing chart N requests N-1 and N+1 (the order of the three kinds is Talked about,
 * New shows, Rising); a chart that was already asked for is not asked again when it is reached; a neighbour that failed is asked again when it is reached.
 * Break to watch red: delete the prefetch effect in app/chart.tsx (showing chart 2 then requests only chart 2).
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: { View }, runOnJS: (f: unknown) => f, useAnimatedReaction: () => undefined, useAnimatedStyle: (f: () => object) => f(), useSharedValue: (v: number) => ({ value: v }), withDecay: (o: unknown) => o };
});
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: () => ({}) }));
const mockChart = jest.fn((kind: string): Promise<unknown> => Promise.resolve({ kind, items: [], updatedAt: new Date().toISOString() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/x',
  useLocalSearchParams: () => ({}),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => jest.fn(), useDownloads: () => ({}), useSubscriptionSync: () => ({ push: jest.fn() }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: (p: { list: unknown }) => p.list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: jest.fn(), play: jest.fn(), queue: jest.fn() }) }));
const mockExplore = { chart: (k: string) => mockChart(k) };
jest.mock('@/discover/explore-api', () => ({ CHART_LABELS: { talked: 'Talked about', new: 'New shows', rising: 'Rising' }, useExploreApi: () => mockExplore }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ hiddenFeeds: new Set<string>() }) }));
jest.mock('@/ui/episode/CardSheet', () => ({ CardSheetHost: () => null, openCardSheet: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ChartScreen from '../app/chart';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => { mockChart.mockClear(); setReducedMotionForTest(true); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(ChartScreen)); await settle(); });
  mounted.push(r);
  return r;
}
async function tab(r: ReactTestRenderer, label: string): Promise<void> {
  const n: ReactTestInstance | undefined = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no tab "${label}"`);
  await act(async () => { n.props['onPress'](); await settle(); });
}
const asked = (): string[] => mockChart.mock.calls.map((c) => c[0]);

describe('chart neighbour prefetch', () => {
  it('showing the first chart asks for it and the one after (there is none before)', async () => {
    await render();
    expect([...asked()].sort()).toEqual(['new', 'talked']);
  });
  it('showing chart 2 requests charts 1 and 3', async () => {
    const r = await render();
    await tab(r, 'New shows chart');
    expect(new Set(asked())).toEqual(new Set(['talked', 'new', 'rising']));
  });
  it('a chart already asked for is not asked again when it is reached', async () => {
    const r = await render();
    await tab(r, 'New shows chart');
    await tab(r, 'Rising chart');
    await tab(r, 'Talked about chart');
    expect([...asked()].sort()).toEqual(['new', 'rising', 'talked']);
  });
  it('a neighbour that failed is asked again when it is reached, and the page shows the answer', async () => {
    let newCalls = 0;
    mockChart.mockImplementation((kind: string) => {
      if (kind === 'new') { newCalls += 1; if (newCalls === 1) return Promise.reject(new Error('x')); }
      return Promise.resolve({ kind, items: [], updatedAt: new Date().toISOString() });
    });
    const r = await render();
    await tab(r, 'New shows chart');
    expect(newCalls).toBe(2);
    expect(r.root.findAll((x) => x.props['testID'] === 'inline-notice')).toHaveLength(0);
    mockChart.mockImplementation((kind: string) => Promise.resolve({ kind, items: [], updatedAt: new Date().toISOString() }));
  });
});
