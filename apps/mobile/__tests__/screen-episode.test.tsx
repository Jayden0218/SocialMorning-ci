// Renders the episode page with real stores: title, meta, Play, Subscribe, Queue, Favourite, comments, missing episode.
/**
 * M32 T060 (review F1). Children that need native modules or their own contexts (show notes with the
 * picture viewer, the sheets, related episodes, clips) are stubbed; the page's own logic is real.
 * Break to watch red: throw in `EpisodeScreen`; make `toggleSubscription` skip `subscriptions.add`;
 * make `addToQueue` skip `queue.replace`.
 */
import { createElement } from 'react';
import { episode, FEED, hash, mount, press, allText, seededStores } from './support/screen-kit';
import { episodeId } from '@/storage/schema';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockRef: { stores: ReturnType<typeof seededStores>; id: string } = { stores: undefined as never, id: '' };
const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockToast = jest.fn();
const mockSync = { push: jest.fn() };
const mockPlayer = { load: jest.fn(), play: jest.fn(), pause: jest.fn(), seek: jest.fn() };
const mockSocial = {
  composer: undefined, refresh: jest.fn(), api: { recordShare: () => Promise.resolve() }, listener: undefined,
  useEpisodeSocial: () => ({
    stale: false,
    cached: { social: { serverTime: '2026-10-28T00:00:00Z', episode: { id: 'x', durationMs: 5_400_000 }, heat: { available: true, buckets: Array.from({ length: 100 }, (_, i) => (i === 30 ? 1 : 0.1)) }, comments: [
      { id: 'c1', body: 'hi', deleted: false, replies: [{ id: 'r1', deleted: false }] },
      { id: 'c2', body: 'gone', deleted: true, replies: [] },
    ] } },
  }),
};
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => ({ usePathname: () => '/', useIsFocused: () => true,  useLocalSearchParams: () => ({ id: mockRef.id }), useRouter: () => mockRouter }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useSubscriptionSync: () => mockSync, useToast: () => mockToast }));
jest.mock('@/playback/store', () => ({
  usePlayer: () => mockPlayer,
  usePlayerSelector: () => ({ loaded: false, playing: false }),
  episodePlayView: () => ({ loaded: false, playing: false }),
  sameEpisodePlayView: () => true,
  livePositionMs: () => undefined,
}));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/usePoll', () => ({ usePoll: () => undefined }));
jest.mock('@/ui/player/NextUp', () => ({ useNextUp: () => ({ items: [] }) }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => ({ open: jest.fn() }) }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => ({ episodeLike: () => Promise.resolve({ liked: false }) }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => [undefined, jest.fn()], ShowExtrasBlock: () => null }));
jest.mock('@/ui/episode/ShowNotes', () => ({ ShowNotes: () => null, hasNotes: () => false }));
jest.mock('@/ui/episode/HeroArtwork', () => ({ HeroArtwork: () => null }));
jest.mock('@/ui/comments/CommentPreview', () => ({ CommentPreview: () => null }));
jest.mock('@/ui/clips/ShareChooser', () => ({ ShareChooser: () => null }));
jest.mock('@/ui/clips/ClipList', () => ({ ClipList: () => null }));
jest.mock('@/ui/episode/RelatedEpisodes', () => ({ RelatedEpisodes: () => null }));
jest.mock('@/ui/social/LikeSheet', () => ({ LikeSheet: () => null }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('@/ui/comments/Composer', () => ({ ComposerSheet: () => null }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));
jest.mock('@/ui/episode/DownloadButton', () => ({ DownloadButton: () => null }));
jest.mock('@/ui/episode/WatchTile', () => ({ WatchTile: () => null }));
jest.mock('@/ui/queue/QueueButtons', () => ({ QueueButtons: () => null, SheetTile: () => null, TileRow: () => null }));
jest.mock('@/ui/me/EpisodeExtras', () => ({ EpisodeExtras: () => null, FavouriteTile: () => null }));

jest.mock('@/graph/context', () => ({ useGraph: () => ({ useEpisodeClips: () => ({ clips: [], pending: [], loading: false, refresh: jest.fn() }) }) }));
jest.mock('@/social/m12-api', () => { const api = { episodeCounts: () => Promise.resolve({ counts: {}, listeners: {} }) }; return { useM12Api: () => api }; });
jest.mock('@/social/m19-api', () => { const api = { myPlaylists: () => Promise.resolve([]) }; return { PLAYLIST_TITLE_MAX: 60, useM19Api: () => api }; });
jest.mock('../modules/watch-link', () => ({ watchState: () => ({ supported: false, paired: false, appInstalled: false, reachable: false }), sendEpisode: () => false }));
jest.mock('react-native-zoom-toolkit', () => ({ Gallery: () => null, fitContainer: () => ({ width: 1, height: 1 }), useImageResolution: () => ({ resolution: undefined, error: false }) }));
jest.mock('@/ui/player/PlayerBackdrop', () => ({ PlayerBackdrop: () => null }));

import EpisodeScreen from '../app/episode/[id]';

beforeEach(() => { setReducedMotionForTest(true); }); // the Pulse page animates (curve, sheets); no timers in a render test
afterEach(() => { setReducedMotionForTest(undefined); });

function setup(withSaved = true) {
  const stores = seededStores([episode('ep1', 'Why the moon is rusty', Date.now() - 3 * 3600_000, 5_400_000)]);
  mockRef.stores = stores;
  mockRef.id = episodeId(FEED, 'ep1', hash);
  if (withSaved) stores.positions.save({ episodeId: mockRef.id, offsetMs: 1_597_000, finished: false }, 1);
  mockRouter.push.mockClear(); mockPlayer.load.mockClear(); mockToast.mockClear();
  return stores;
}

it('shows the show, title, length, where you stopped and the comment count', async () => {
  setup();
  const r = await mount(createElement(EpisodeScreen));
  const t = allText(r);
  expect(t).toContain('The Morning Show');
  expect(t).toContain('Why the moon is rusty');
  expect(t).toContain('1:30:00'); // the Pulse meta line: date · length
  expect(t).toContain('resumes at 26:37');
  expect(t).toContain('2 comments'); // one comment and its reply; the deleted one is not counted
});

it('Play loads the episode and opens the player', async () => {
  setup();
  const r = await mount(createElement(EpisodeScreen));
  await press(r, 'Play this episode');
  expect(mockPlayer.load).toHaveBeenCalledWith(expect.objectContaining({ id: mockRef.id, title: 'Why the moon is rusty' }), 'play');
  expect(mockRouter.push).toHaveBeenCalledWith('/player');
});

it('Subscribe adds the show and syncs; pressing again removes it', async () => {
  const stores = setup();
  const r = await mount(createElement(EpisodeScreen));
  expect(stores.subscriptions.has(FEED)).toBe(false);
  await press(r, 'Subscribe to this show');
  expect(stores.subscriptions.has(FEED)).toBe(true);
  expect(mockSync.push).toHaveBeenCalled();
  expect(allText(r)).toContain('Subscribed');
  await press(r, 'Unsubscribe from this show');
  expect(stores.subscriptions.has(FEED)).toBe(false);
});

it('Add to queue puts the episode in the queue and says so', async () => {
  const stores = setup();
  const r = await mount(createElement(EpisodeScreen));
  await press(r, 'Add to queue');
  expect(stores.queue.list()).toEqual([mockRef.id]);
  expect(mockToast).toHaveBeenCalledWith('Added to the queue');
});

// Favourite moved into the ⋯ sheet in the Pulse page; m31-w3a-episode.test.tsx covers the sheet's tiles.
it('Comments opens the conversation at the current moment', async () => {
  setup();
  const r = await mount(createElement(EpisodeScreen));
  await press(r, /^Comments, 2/);
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/comments/[episodeId]', params: { episodeId: mockRef.id, at: '1597000' } });
});

it('an episode that left the feed says so', async () => {
  setup();
  mockRef.id = 'gone';
  const r = await mount(createElement(EpisodeScreen));
  expect(allText(r)).toContain('This episode is no longer in the feed.');
});
