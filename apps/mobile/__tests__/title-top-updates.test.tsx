// 037 M4 (spec 037 FR-003): the Updates tab draws its title at the TOP.
/**
 * Written BEFORE the change: red today (library.tsx hands `TitleBar` a `bottom`). Mounted like m31-wave5b-updates-page.test.tsx.
 * Asks: the title bar has `top` = `titleBarTop(0)` and no `bottom`; the scroll content starts under the title block and its foot leaves
 * room for the bars only (no title part).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bottomInset, spacing } from '@/design';
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

// 039 (Feed lane): was "the Updates title bar sits 6 from the top of its pane; the content starts under the block; the foot leaves the bars' room only" (a TitleBar over a fade).
// Updates is a `PageList` now: the title row is the list's header, the content starts below the status bar (inset + spacing.section) and the foot clears the bars.
describe('039 the Updates tab title is the page\'s first row', () => {
  const withInsets = (top: number, el: React.ReactElement): React.ReactElement => createElement(SafeAreaInsetsContext.Provider, { value: { top, bottom: 34, left: 0, right: 0 } }, el);
  const content = (r: Awaited<ReturnType<typeof mount>>): Record<string, number> =>
    (StyleSheet.flatten(r.root.findAll((n) => n.props['testID'] === 'page-scroll' && n.props['contentContainerStyle'] !== undefined)[0]?.props['contentContainerStyle'] as never) ?? {}) as Record<string, number>;
  it('with a 47 pt status bar the content starts below it, and there is no TitleBar', async () => {
    mockIdle = true;
    mockRef.stores = seededStores([]) as never;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require('../app/(tabs)/library').default;
    const r = await mount(withInsets(47, createElement(Screen)));
    expect(r.root.findAllByType(TitleBar)).toHaveLength(0);
    expect(content(r)['paddingTop']).toBe(47 + spacing.section);
    expect(r.root.findAll((n) => n.props['testID'] === 'page-title-row').length).toBeGreaterThan(0);
    act(() => r.unmount());
  });
  for (const idle of [true, false]) {
    it(`${idle ? 'idle' : 'with a now bar'}: the foot leaves the tab bar${idle ? '' : ' and the now bar'} room only`, async () => {
      mockIdle = idle;
      mockRef.stores = seededStores([]) as never;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Screen = require('../app/(tabs)/library').default;
      const r = await mount(withInsets(0, createElement(Screen)));
      expect(content(r)['paddingBottom']).toBe(bottomInset(34, { tabs: true, now: !idle }));
      act(() => r.unmount());
    });
  }
});
