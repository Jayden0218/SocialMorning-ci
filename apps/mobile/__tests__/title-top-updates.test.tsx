// 037 M4 (spec 037 FR-003): the Updates tab draws its title at the TOP.
/**
 * Written BEFORE the change: red today (library.tsx hands `TitleBar` a `bottom`). Mounted like m31-wave5b-updates-page.test.tsx.
 * Asks: the title bar has `top` = `titleBarTop(0)` and no `bottom`; the scroll content starts under the title block and its foot leaves
 * room for the bars only (no title part).
 */
import { createElement } from 'react';
import { ScrollView } from 'react-native';
import { act } from 'react-test-renderer';
import { barsReserve, contentTopReserve, titleBarTop } from '@/design';
import { TitleBar } from '@/ui/kit/TitleBar';
import { seededStores, mount } from './support/screen-kit';

// One object each, as the real hooks give: a new one per render re-runs the tab's focus effect for ever.
const mockRef: { stores: ReturnType<typeof seededStores> } = { stores: undefined as never };
const mockToast = jest.fn();
const mockDl = { subscribe: jest.fn(() => () => undefined), request: jest.fn(() => Promise.resolve({ kind: 'ok' })) };
const mockPos = { flush: jest.fn(() => Promise.resolve()) };
const mockSync = { push: jest.fn(), reconcile: jest.fn(() => Promise.resolve()) };
const mockRouter = { push: jest.fn() };
const mockSafety = { hiddenFeeds: new Set<string>() };
const mockSocial = { listener: undefined };
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }), voicePosts: () => Promise.resolve([]), deleteVoicePost: jest.fn() };
const mockProfile = { me: undefined };
const mockPlayer = { load: jest.fn(), pause: jest.fn() };
const mockDiscoverApi = { view: undefined, open: jest.fn() };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => mockToast, useDownloads: () => mockDl, useSubscriptionSync: () => mockSync, usePositionSync: () => mockPos }));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => mockRouter, useScrollToTop: () => undefined, useFocusEffect: (f: () => void) => { useEffect(() => f(), [f]); }, router: mockRouter };
});
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: true, now: false, player: false }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfile }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
let mockIdle = true;
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => mockIdle, selectIdle: () => true }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => mockDiscoverApi }));
jest.mock('@/feeds/refresh-service', () => ({ refreshFeeds: () => Promise.resolve({ stale: [] as string[] }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: ({ list }: { list: React.ReactElement }) => list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/social/VoicePosts', () => ({ VoicePosts: () => null }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));
jest.mock('@/ui/episode/useEpisodeHotMoments', () => ({ useEpisodeHotMoments: () => new Map(), useEpisodeHotMomentsWith: () => new Map() }));

describe('037 M4 the Updates tab title at the top', () => {
  for (const idle of [true, false]) {
    it(`${idle ? 'idle' : 'with a now bar'}: top 6, no bottom; the content starts under the block; the foot leaves the bars' room only`, async () => {
      mockIdle = idle;
      mockRef.stores = seededStores([]) as never;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Screen = require('../app/(tabs)/library').default;
      const r = await mount(createElement(Screen));
      const bar = r.root.findByType(TitleBar);
      expect(bar.props['top']).toBe(titleBarTop(0));
      expect(bar.props['bottom']).toBeUndefined();
      const style = (r.root.findAll((n) => n.props['testID'] === 'updates-page' && n.type === ScrollView)[0]?.props['contentContainerStyle'] ?? {}) as Record<string, number>;
      expect(Number(style['paddingTop'])).toBeGreaterThanOrEqual(titleBarTop(0) + contentTopReserve());
      expect(style['paddingBottom']).toBe(barsReserve({ tabs: true, now: !idle }));
      act(() => r.unmount());
    });
  }
});
