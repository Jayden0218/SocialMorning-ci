// Wave 5b, Updates page: the library tab hands each card its hot moment from the Moments hook.
/**
 * Planner, contact/wave-5b. Companion of m31-wave5b-updates-hot.test.tsx (the row and the hook): here the Updates tab (app/(tabs)/library.tsx)
 * is mounted with the hook faked, and the card of the episode that has a moment shows "41 already reacting"; the hook is asked with the feeds of the
 * cards in the deck. RED before phase 2 (library.tsx does not call the hook). Break: stop passing `hot` from library.tsx.
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { allText, episode, FEED, hash, mount, seededStores } from './support/screen-kit';
import { episodeId } from '@/storage/schema';

jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockRef.stores, useToast: () => mockToast, useDownloads: () => mockDl, useSubscriptionSync: () => mockSync, usePositionSync: () => mockPos,
}));
const mockRef: { stores: ReturnType<typeof seededStores> } = { stores: undefined as never };
const mockToast = jest.fn();
const mockRouter = { push: jest.fn() };
const mockSocial: { listener: unknown } = { listener: undefined };
const mockPlayer = { load: jest.fn(), pause: jest.fn() };
const mockDl = { subscribe: jest.fn(() => () => undefined), request: jest.fn(() => Promise.resolve({ kind: 'ok' })) };
const mockPos = { flush: jest.fn(() => Promise.resolve()) };
const mockSync = { push: jest.fn(), reconcile: jest.fn(() => Promise.resolve()) };
const mockHot: { map: Map<string, { startMs: number; reactions: number }> } = { map: new Map() };
const mockHotCalls: (readonly string[])[] = [];
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => mockRouter, useScrollToTop: () => undefined, useFocusEffect: (f: () => void) => { useEffect(() => f(), [f]); }, router: mockRouter };
});
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: true, now: false, player: false }) }));
const mockSafety = { hiddenFeeds: new Set<string>() };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }), voicePosts: () => Promise.resolve([]), deleteVoicePost: jest.fn() };
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
const mockProfile = { me: undefined };
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfile }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => true, selectIdle: () => true }));
const mockDiscoverApi = { view: undefined, open: jest.fn() };
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => mockDiscoverApi }));
jest.mock('@/feeds/refresh-service', () => ({ refreshFeeds: () => Promise.resolve({ stale: [] as string[] }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: ({ list }: { list: React.ReactElement }) => list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/social/VoicePosts', () => ({ VoicePosts: () => null }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));
// The hook is faked: its own behaviour is in m31-wave5b-updates-hot.test.tsx.
jest.mock('@/ui/episode/useEpisodeHotMoments', () => ({
  useEpisodeHotMoments: (feeds: readonly string[]) => { mockHotCalls.push(feeds); return mockHot.map; },
  useEpisodeHotMomentsWith: () => mockHot.map,
}));

describe('the Updates page hands each card its hot moment', () => {
  it('draws "14:32 · 41 already reacting" on the episode that has one and nothing on the other', async () => {
    const stores = seededStores([episode('a', 'Why mornings matter', Date.now() - 3_600_000), episode('b', 'Cities that sleep late', Date.now() - 7_200_000)]);
    stores.subscriptions.add(FEED, 1);
    mockRef.stores = stores as never;
    mockHot.map = new Map([[episodeId(FEED, 'a', hash), { startMs: 14 * 60_000 + 32_000, reactions: 41 }]]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require('../app/(tabs)/library').default;
    const r = await mount(createElement(Screen));
    expect(mockHotCalls.length).toBeGreaterThan(0);
    expect(mockHotCalls[0]).toContain(FEED);
    expect(r.root.findAll((n) => n.props['testID'] === 'update-hot' && typeof n.type === 'string')).toHaveLength(1);
    expect(allText(r)).toContain('41 already reacting');
    act(() => r.unmount());
  });
});
