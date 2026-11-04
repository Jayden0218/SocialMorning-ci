// Tests that a category page that cannot load says why and offers Retry, and Retry fetches again.
/**
 * Real-iPhone check P4: with the catalogue off or failing, "Couldn't load this category right now." was a dead end.
 * Guard: the error tile also gives a reason and a Retry; Retry asks `fetchCategory` again and the list appears.
 * Break to see it red: remove the RetryTile from the error branch in app/category/[id].tsx. Device: NOT VERIFIED here.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockShows = Array.from({ length: 200 }, (_, i) => ({
  feedUrl: `https://f/${i}`, title: `Show ${i}`, author: 'A', imageUrl: '', genres: ['Comedy'], latestEpisode: undefined,
}));
const mockFetch = jest.fn();
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
  cachedCategory: () => undefined,
  fetchCategory: (...a: unknown[]) => mockFetch(...a),
  firstCovers: () => [],
}));

import { ApiError } from '@/social/api';
import CategoryScreen from '../app/category/[id]';

const words = (r: ReactTestRenderer): string =>
  r.root.findAll((n) => typeof n.type === 'string').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string')).join(' ');
const retry = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function')[0];

it('a failed load says why and offers Retry; Retry fetches again and the shows appear', async () => {
  mockFetch.mockReset()
    .mockRejectedValueOnce(new ApiError('unavailable' as never, 'The catalogue is switched off for now.', 503))
    .mockResolvedValueOnce({ shows: mockShows.slice(0, 4), hasMore: false, stale: false });
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(CategoryScreen)); });
  expect(words(r)).toContain("Couldn't load this category right now.");
  expect(words(r)).toContain('The catalogue is switched off for now.');
  expect(retry(r)).toBeDefined();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  await act(async () => { retry(r)!.props['onPress'](); });
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(words(r)).not.toContain("Couldn't load this category right now.");
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Show 0, A' && typeof n.props['onPress'] === 'function').length).toBeGreaterThan(0);
  act(() => r.unmount());
});
