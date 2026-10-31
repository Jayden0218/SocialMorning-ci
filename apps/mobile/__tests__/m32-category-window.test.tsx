// Guard G-M32-C5: the category page mounts a window of rows, not every loaded page.
/**
 * M32 T030 (review C5): the page once rendered every loaded show with `.map` inside a ScrollView,
 * so memory grew with each page. Break to watch red: put the grid back to `.map` rows.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockShows = Array.from({ length: 200 }, (_, i) => ({
  feedUrl: `https://f/${i}`, title: `Show ${i}`, author: 'A', imageUrl: '', genres: ['Comedy'], latestEpisode: undefined,
}));
const mockApi = { category: jest.fn(() => Promise.resolve({ shows: [], hasMore: false })) };
const mockStores = {
  settings: { get: () => undefined, set: () => undefined, delete: () => undefined },
  feedCache: {},
  subscriptions: { list: () => [], has: () => false, add: () => undefined, remove: () => undefined },
};
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useLocalSearchParams: () => ({ id: '1303' }),
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); },
  };
});
jest.mock('react-native-reanimated', () => ({ runOnJS: (f: unknown) => f }));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: (p: { children?: unknown }) => p.children,
  usePanGesture: () => ({}),
}));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ hiddenFeeds: new Set<string>() }) }));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockStores,
  useSubscriptionSync: () => ({ push: jest.fn() }),
}));
// D-C: the page is a PushedPage (the title bar low); its layout reads where the bars are.
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/discover/category-cache', () => ({
  cachedCategory: () => ({ shows: mockShows, hasMore: true, stale: false }),
  fetchCategory: () => Promise.resolve({ shows: mockShows, hasMore: true, stale: false }),
  firstCovers: () => [],
}));

import CategoryScreen from '../app/category/[id]';

it('mounts only a window of the 200 loaded shows', async () => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(CategoryScreen)); });
  const mounted = new Set(r.root.findAll(
    (n) => typeof n.props['accessibilityLabel'] === 'string' && /^Show \d+, A$/.test(n.props['accessibilityLabel'] as string) && typeof n.props['onPress'] === 'function',
  ).map((n) => n.props['accessibilityLabel'] as string));
  expect(mounted.size).toBeGreaterThan(0);
  expect(mounted.size).toBeLessThan(40);
});

it('reaching the end asks the server for the next page (page 1)', async () => {
  mockApi.category.mockClear();
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(CategoryScreen)); });
  const list = r.root.findAll((n) => typeof n.props['onEndReached'] === 'function' && n.props['numColumns'] === 2)[0]!;
  await act(async () => { (list.props['onEndReached'] as () => void)(); });
  expect(mockApi.category).toHaveBeenCalledWith(1303, 1);
});
