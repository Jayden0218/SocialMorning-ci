// The Updates tab as drawn (design-pulse2 index.html#updates--screen): Voice, Starred, the Deck, the title bar, the swipes.
/**
 * M31 D-A (T031). Reads positions and sizes off the render: the Voice block is 92 tall under the safe top + 8, the Starred block 70, the cards
 * 290 x 350 snapping 300 apart from 20, the title bar low with "My subscriptions · n ›". The break: change `UPDATES.starredTop` (the pitch of
 * the Voice block), `UPDATES.card.width`, or drop `onSubtitle` — each fails below. Behaviour: Mark played / Remove / Queue / Play keep
 * their handlers; with no subscriptions Discover's sections sit under the empty block; the refresh passes `hiddenOf`.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act } from 'react-test-renderer';
import { allText, episode, FEED, hash, mount, press, seededStores } from './support/screen-kit';
import { episodeId } from '@/storage/schema';
import { createMemoryStores } from '@/storage/memory';

const mockRef: { stores: ReturnType<typeof seededStores> } = { stores: undefined as never };
const mockToast = jest.fn();
const mockRouter = { push: jest.fn() };
const mockSocial: { listener: unknown; api?: unknown } = { listener: undefined };
const mockPlayer = { load: jest.fn(), pause: jest.fn() };
const mockDl = { subscribe: jest.fn(() => () => undefined), request: jest.fn(() => Promise.resolve({ kind: 'ok' })) };
const mockPos = { flush: jest.fn(() => Promise.resolve()) };
const mockSync = { push: jest.fn(), reconcile: jest.fn(() => Promise.resolve()) };
const mockDiscover: { view: unknown } = { view: undefined };
const mockRefresh = jest.fn(() => Promise.resolve({ stale: [] as string[] }));
const mockSheet: { props?: { actions: { label: string; onPress: () => void }[] } } = {};
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => mockRouter, useScrollToTop: () => undefined, useFocusEffect: (f: () => void) => { useEffect(() => f(), [f]); }, router: mockRouter };
});
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockRef.stores, useToast: () => mockToast, useDownloads: () => mockDl, useSubscriptionSync: () => mockSync, usePositionSync: () => mockPos,
}));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: true, now: false, player: false }) }));
const mockSafety = { hiddenFeeds: new Set<string>() };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: { x: 3 } }), voicePosts: () => Promise.resolve([]), deleteVoicePost: jest.fn() };
const mockProfile = { me: undefined };
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfile }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => true, selectIdle: () => true }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => mockDiscoverApi }));
const mockDiscoverApi = { get view() { return mockDiscover.view; }, open: jest.fn() };
jest.mock('@/feeds/refresh-service', () => ({ refreshFeeds: (...a: unknown[]) => (mockRefresh as (...x: unknown[]) => unknown)(...a) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: ({ list }: { list: React.ReactElement }) => list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/social/VoicePosts', () => ({ VoicePosts: (p: { variant?: string }) => require('react').createElement('View', { testID: 'voice-posts', variant: p.variant }) }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: (p: { actions: { label: string; onPress: () => void }[] }) => { mockSheet.props = p; return null; } }));

import UpdatesScreen from '../app/(tabs)/library';

const NOW = Date.now();
const id = (g: string) => episodeId(FEED, g, hash);
const style = (n: { props: Record<string, unknown> }) => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, number>;
function setup(opts: { starred?: boolean; subscribed?: boolean } = {}) {
  const stores = opts.subscribed === false ? createMemoryStores(hash) : seededStores([episode('a', 'Why mornings matter', NOW - 3_600_000), episode('b', 'Cities that sleep late', NOW - 7_200_000)]);
  if (opts.subscribed !== false) stores.subscriptions.add(FEED, 1);
  if (opts.starred) stores.subscriptions.setStarred(FEED, true, 2);
  mockRef.stores = stores as never;
  mockRouter.push.mockClear(); mockToast.mockClear(); mockRefresh.mockClear();
  return stores;
}
const mounted: { unmount: () => void }[] = [];
const mountScreen = async () => { const r = await mount(createElement(UpdatesScreen)); mounted.push(r); return r; };
const cards = (r: Awaited<ReturnType<typeof mount>>) => r.root.findAllByProps({ testID: 'update-card' }).filter((n) => typeof n.type === 'string');

describe('Updates, as drawn', () => {
  beforeEach(() => { mockSocial.listener = undefined; mockDiscover.view = undefined; mockSheet.props = undefined; });
  afterEach(() => { while (mounted.length) act(() => { mounted.pop()!.unmount(); }); });

  it('the new episodes are 290 x 350 cards in a snapping deck, the first 20 in, 10 apart', async () => {
    setup();
    const r = await mountScreen();
    expect(cards(r)).toHaveLength(2);
    const deck = r.root.findAllByProps({ testID: 'deck' }).find((n) => typeof n.type === 'string')!;
    expect(deck.props['snapToInterval']).toBe(300);
    expect(style(deck)['height']).toBe(350);
    expect((StyleSheet.flatten(deck.props['contentContainerStyle'] as never) as Record<string, number>)['paddingLeft']).toBe(20);
    expect((StyleSheet.flatten(deck.props['contentContainerStyle'] as never) as Record<string, number>)['gap']).toBe(10);
  });

  it('the page starts 8 under the status bar; Voice (signed in) is 92 tall, Starred 70, only when there is something', async () => {
    setup({ starred: true });
    mockSocial.listener = { listenerId: 'me', displayName: 'Me' };
    const r = await mountScreen();
    const page = r.root.findAllByProps({ testID: 'updates-page' }).find((n) => typeof n.type === 'string')!;
    expect((StyleSheet.flatten(page.props['contentContainerStyle'] as never) as Record<string, number>)['paddingTop']).toBe(8);
    expect(style(r.root.findByProps({ testID: 'voice-block' }))['minHeight']).toBe(92); // F10: a minimum; the turned label can make it taller
    expect(style(r.root.findByProps({ testID: 'starred-block' }))['minHeight']).toBe(70);
    expect(r.root.findByProps({ testID: 'voice-posts' }).props['variant']).toBe('updates');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Open The Morning Show, starred').length).toBeGreaterThan(0);
    const covers = r.root.findAllByProps({ testID: 'lib-cover' }).filter((n) => typeof n.type === 'string');
    expect([style(covers[0]!)['width'], style(covers[0]!)['borderRadius']]).toEqual([52, 14]);
  });

  it('signed out and nothing starred: no Voice and no Starred block', async () => {
    setup();
    const r = await mountScreen();
    expect(r.root.findAllByProps({ testID: 'voice-block' })).toHaveLength(0);
    expect(r.root.findAllByProps({ testID: 'starred-block' })).toHaveLength(0);
  });

  it('the title bar is low: "Updates" and "My subscriptions · 1 ›", which opens /subscriptions', async () => {
    setup();
    const r = await mountScreen();
    expect(allText(r)).toContain('Updates');
    await press(r, 'My subscriptions · 1 ›');
    expect(mockRouter.push).toHaveBeenCalledWith('/subscriptions');
  });

  it('the refresh still passes the creators\' hidden-episode lookup', async () => {
    setup();
    mockSocial.api = { hiddenEpisodes: () => Promise.resolve([]) };
    jest.useFakeTimers();
    await mountScreen();
    await act(async () => { jest.advanceTimersByTime(500); });
    jest.useRealTimers();
    expect(mockRefresh).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ hiddenOf: expect.any(Function) }));
    mockSocial.api = undefined;
  });

  it('a card keeps Queue, Download, Comments, More, Play and the show link', async () => {
    const stores = setup();
    const r = await mountScreen();
    await press(r, 'Add Why mornings matter to the queue');
    expect(stores.queue.list()).toContain(id('a'));
    expect(mockToast).toHaveBeenCalledWith('Added to the queue.');
    await press(r, 'Play Why mornings matter');
    expect(mockPlayer.load).toHaveBeenCalled();
    await press(r, 'Comments on Why mornings matter');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/comments/[episodeId]', params: { episodeId: id('a') } });
    await press(r, 'Open The Morning Show');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(FEED) } });
    await press(r, 'Download Why mornings matter');
    expect(mockDl.request).toHaveBeenCalledWith(id('a'));
  });

  it('swiping a card up marks it played, down removes it (the same handlers the row swipes had)', async () => {
    const stores = setup();
    const r = await mountScreen();
    const first = r.root.findAllByProps({ testID: 'swipe-card' }).find((n) => typeof n.type === 'string')!;
    const pan = first.props['onResponderRelease'] as (e: unknown) => void;
    expect(typeof pan).toBe('function');
    // The PanResponder reads gestureState from the touch history; drive the accessibility actions, which call the same functions.
    const title = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && (n.props['accessibilityLabel'] as string).startsWith('Why mornings matter, The Morning Show'))[0]!;
    await act(async () => { (title.props['onAccessibilityAction'] as (e: unknown) => void)({ nativeEvent: { actionName: 'played' } }); });
    expect(mockToast).toHaveBeenCalledWith('Marked as played.');
    expect(stores.positions.all().some((p) => p.episodeId === id('a') && p.finished)).toBe(true);
    await act(async () => { (title.props['onAccessibilityAction'] as (e: unknown) => void)({ nativeEvent: { actionName: 'remove' } }); });
    expect(mockToast).toHaveBeenCalledWith('Removed from Updates. The show stays subscribed.');
    expect(allText(r)).not.toContain('Why mornings matter');
  });

  it('the More sheet keeps Remove from Updates and Star, and gains Mark as played', async () => {
    setup();
    const r = await mountScreen();
    await press(r, 'More for Why mornings matter');
    expect(mockSheet.props!.actions.map((a) => a.label)).toEqual(['Mark as played', 'Remove from Updates', 'Star this show']);
  });

  it('with no subscriptions the deck gives way to the empty block and Discover\'s sections', async () => {
    setup({ subscribed: false });
    mockDiscover.view = { stale: false, body: { date: '2026-10-28', picks: [{ key: 'p', why: 'Because', episode: { id: 'e', title: 'A pick', showTitle: 'Pick show' } }], talkedAbout: [], trending: [] } };
    const r = await mountScreen();
    expect(cards(r)).toHaveLength(0);
    expect(allText(r)).toContain('No subscriptions yet.');
    expect(allText(r)).toContain('A pick');
    expect(allText(r)).toContain('PICKS');
  });
});
