// Renders "My subscriptions" with real stores: starred strip, all shows, search, the ⋮ sheet (star, unsubscribe).
/**
 * M32 T060 (review F1). Break to watch red: throw in `SubscriptionsScreen`; make `star` skip
 * `setStarred`; make `unsubscribe` skip `subscriptions.remove`; drop the search filter.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act } from 'react-test-renderer';
import { allText, mount, press, episode, hash } from './support/screen-kit';
import { createMemoryStores } from '@/storage/memory';

const mockRef: { stores: ReturnType<typeof createMemoryStores> } = { stores: undefined as never };
const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockToast = jest.fn();
const mockSync = { push: jest.fn() };
const mockSocial = { api: { hiddenEpisodes: undefined, showExtras: () => Promise.resolve({ hosts: [] }) }, listener: undefined };
const mockSafety = { safety: { isHidden: () => false }, hiddenFeeds: new Set<string>() };
const mockUs8 = {};
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => mockRouter, useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); } };
});
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useSubscriptionSync: () => mockSync, useToast: () => mockToast }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/us8-api', () => ({ useUs8Api: () => mockUs8 }));
jest.mock('@/feeds/refresh-service', () => ({ refreshFeeds: () => Promise.resolve({ stale: [] }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
// The kit sheet is a native Modal; here it renders in place while open.
jest.mock('@/ui/kit/ActionSheet', () => ({ ActionSheet: ({ open, children }: { open: boolean; children: unknown }) => (open ? children : null) }));

import SubscriptionsScreen from '../app/subscriptions';

const A = 'https://a.example/feed.xml';
const B = 'https://b.example/feed.xml';
function setup() {
  const stores = createMemoryStores(hash);
  const put = (url: string, title: string, ep: string) => stores.feeds.put(url, {
    show: { feedUrl: url, title, explicit: false, categories: [], contentHash: title },
    episodes: [episode(ep, ep, Date.now() - 86_400_000)], warnings: [],
  }, {}, 1);
  put(A, 'Alpha Hour', 'Alpha newest');
  put(B, 'Beta Radio', 'Beta newest');
  stores.subscriptions.add(A, 1);
  stores.subscriptions.add(B, 2);
  mockRef.stores = stores;
  mockRouter.push.mockClear(); mockToast.mockClear(); mockSync.push.mockClear();
  return stores;
}

it('lists every subscribed show with its newest episode', async () => {
  setup();
  const r = await mount(createElement(SubscriptionsScreen));
  const t = allText(r);
  expect(t).toContain('My subscriptions');
  expect(t).toContain('Alpha Hour');
  expect(t).toContain('Beta Radio');
  expect(t).toContain('2 shows');
  expect(t).toContain('ALL SHOWS');
  expect(t).toMatch(/Updated 1 d ago/);
  expect(t).not.toContain('STARRED');
});

it('searching narrows the list', async () => {
  setup();
  const r = await mount(createElement(SubscriptionsScreen));
  await press(r, 'Search your shows');
  const input = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Search your shows' && typeof n.props['onChangeText'] === 'function')[0]!;
  await act(async () => { (input.props['onChangeText'] as (s: string) => void)('beta'); });
  const t = allText(r);
  expect(t).toContain('Beta Radio');
  expect(t).not.toContain('Alpha Hour');
});

it('⋮ then Star stars the show (stored and synced) and a Starred strip appears', async () => {
  const stores = setup();
  const r = await mount(createElement(SubscriptionsScreen));
  await press(r, 'More for Alpha Hour');
  await press(r, 'Star');
  expect(stores.subscriptions.list().find((s) => s.feedUrl === A)?.starred).toBe(true);
  expect(mockSync.push).toHaveBeenCalled();
  expect(allText(r)).toContain('STARRED');
  expect(r.root.findAllByProps({ testID: 'starred-tile' }).length).toBeGreaterThan(0);
});

it('⋮ then Unsubscribe removes the show and says so', async () => {
  const stores = setup();
  const r = await mount(createElement(SubscriptionsScreen));
  await press(r, 'More for Beta Radio');
  await press(r, 'Unsubscribe');
  expect(stores.subscriptions.has(B)).toBe(false);
  expect(stores.subscriptions.has(A)).toBe(true);
  expect(mockToast).toHaveBeenCalledWith('Unsubscribed from Beta Radio.');
  expect(allText(r)).not.toContain('Beta Radio');
});

it('tapping a show opens it', async () => {
  setup();
  const r = await mount(createElement(SubscriptionsScreen));
  await press(r, /^Alpha Hour\. Newest/);
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(A) } });
});

it('with no subscriptions shows the empty state', async () => {
  mockRef.stores = createMemoryStores(hash);
  const r = await mount(createElement(SubscriptionsScreen));
  expect(allText(r)).not.toContain('Alpha Hour');
  expect(allText(r)).toContain('My subscriptions');
  expect(allText(r)).toContain('No subscriptions yet.');
});

describe('as drawn (design-pulse2 subscriptions--screen)', () => {
  const sizeOf = (n: { props: Record<string, unknown> }) => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, number>;

  it('a show is a 2 x 1 tile 84 tall (radius 22) with a 56 cover, and ··· opens the menu', async () => {
    setup();
    const r = await mount(createElement(SubscriptionsScreen));
    const tiles = r.root.findAllByProps({ testID: 'show-tile' }).filter((n) => typeof n.type === 'string');
    expect(tiles).toHaveLength(2);
    expect([sizeOf(tiles[0]!)['height'], sizeOf(tiles[0]!)['borderRadius']]).toEqual([84, 22]);
    expect(r.root.findAllByProps({ testID: 'lib-cover' }).filter((n) => typeof n.type === 'string').map((n) => sizeOf(n)['width'])).toEqual([56, 56]);
    await press(r, 'More for Alpha Hour');
    expect(allText(r)).toContain('Unsubscribe');
    expect(allText(r)).toContain('Starred shows sit first');
  });

  it('a starred show is a 1 x 2 tile, 178 tall', async () => {
    const stores = setup();
    stores.subscriptions.setStarred(A, true, 5);
    const r = await mount(createElement(SubscriptionsScreen));
    const tile = r.root.findAllByProps({ testID: 'starred-tile' }).find((n) => typeof n.type === 'string')!;
    expect(sizeOf(tile)['height']).toBe(178);
    expect(r.root.findAllByProps({ testID: 'show-tile' }).filter((n) => typeof n.type === 'string')).toHaveLength(1);
  });

  it('the grid is three covers a line (radius 18), the starred ones carry the star', async () => {
    const stores = setup();
    stores.subscriptions.setStarred(A, true, 5);
    const r = await mount(createElement(SubscriptionsScreen));
    await press(r, 'Show as a grid');
    const covers = r.root.findAllByProps({ testID: 'lib-cover' }).filter((n) => typeof n.type === 'string');
    expect(covers).toHaveLength(2);
    expect(sizeOf(covers[0]!)['borderRadius']).toBe(18);
    expect(r.root.findAllByProps({ testID: 'grid-tile' }).filter((n) => typeof n.type === 'string')).toHaveLength(2);
    await press(r, 'Show as a list');
    expect(r.root.findAllByProps({ testID: 'show-tile' }).filter((n) => typeof n.type === 'string')).toHaveLength(1);
  });

  it('the chips: four sorts (each keeps its spoken name), search, Manage order, Share some shows', async () => {
    setup();
    const r = await mount(createElement(SubscriptionsScreen));
    for (const l of ['Sort: Default', 'Sort: Recently updated', 'Sort: A–Z', 'Sort: Recently added', 'Search your shows']) await press(r, l);
    await press(r, 'Manage order');
    expect(mockRouter.push).toHaveBeenCalledWith('/subscriptions/manage');
    await press(r, 'Share some shows');
    expect(mockRouter.push).toHaveBeenCalledWith('/lists/new');
  });

  it('Share my list signed out says so in a toast', async () => {
    setup();
    const r = await mount(createElement(SubscriptionsScreen));
    await press(r, 'Share my list');
    expect(mockToast).toHaveBeenCalledWith('Sign in to share your list.');
  });
});
