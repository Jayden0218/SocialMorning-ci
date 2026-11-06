// 037 M4 (spec 037 FR-003): the Me, Updates and Chat tabs draw their title at the TOP, under the status bar.
/**
 * Written BEFORE the change: red today (each tab hands `TitleBar` a `bottom` from `useTabTitleBottom`).
 * Asks of Me and Chat (Updates is `title-top-updates.test.tsx`): the title bar has `top` = `titleBarTop(0)` (the tab page's SafeAreaView already pads the
 * status bar) and no `bottom`, with or without a now bar; the scroll content starts under the title block; its foot leaves room for the bars only.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bars, barsReserve, bottomInset, spacing } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
let mockStoreReady = false;
let mockIdle = true;
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Mei Lin' };
let mockChats: () => Promise<unknown[]> = () => Promise.resolve([]);
const mockStores = {
  settings: { get: (k: string) => (k === 'store.ready' && mockStoreReady ? '1' : undefined), set: () => undefined },
  feedCache: {},
};
const mockFeed = { unread: () => 4, cached: () => undefined };
// One object, as the real hook gives: a new one per render re-runs the tab's focus effect for ever.
const mockChatApi = { conversations: () => mockChats(), unread: () => Promise.resolve(0) };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
  useScrollToTop: () => undefined,
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: mockListener }) }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => ({ me: () => new Promise(() => undefined) }) }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/me/moments', () => ({ listMoments: () => [1, 2, 3] }));
jest.mock('@/graph/feed', () => ({ createFeed: () => mockFeed }));
jest.mock('@/social/m19-api', () => ({ lastMonth: () => '2026-09', monthName: () => 'September' }));
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayerSelector: () => mockIdle }));
jest.mock('@/social/chat-api', () => ({
  ...jest.requireActual('@/social/chat-api'),
  useChatApi: () => mockChatApi,
}));
jest.mock('@/ui/lib/alert-dialog', () => ({ AlertDialog: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import MeScreen from '../app/(tabs)/me';
import ChatTab from '../app/(tabs)/chat';
import { TitleBar } from '@/ui/kit/TitleBar';


const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); mockPush.mockClear(); mockStoreReady = false; mockIdle = true; mockListener = { listenerId: 'me', displayName: 'Mei Lin' }; mockChats = () => Promise.resolve([]); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;

describe('037 M4 tab titles at the top', () => {
  for (const idle of [true, false]) {
    // 039 D4: was "Me: the title bar has top 6 and no bottom; the content starts under the title block (EdgeLabel page, absolute TitleBar)". Me is now a `Page` (no TitleBar): its foot clears the tab bar and, while something plays, the now bar.
    it(`Me (${idle ? 'idle' : 'now bar'}): no title bar; the page foot clears the tab bar${idle ? '' : ' and the now bar'}`, async () => {
      mockIdle = idle;
      const r = await render(createElement(SafeAreaInsetsContext.Provider, { value: { top: 0, bottom: 34, left: 0, right: 0 } }, createElement(MeScreen)));
      expect(r.root.findAllByType(TitleBar).length).toBe(0);
      const page = r.root.findAll((n) => n.props['testID'] === 'page-scroll')[0]!;
      const style = flat({ props: { style: page.props['contentContainerStyle'] } } as never);
      expect(style['paddingBottom']).toBe(bottomInset(34, { tabs: true, now: !idle }));
    });

    // 039 (Feed lane): was "Chat: the title bar has top 6 and no bottom". Chat is a `PageList` now (no TitleBar): its foot clears the tab bar and, while something plays, the now bar.
    it(`Chat (${idle ? 'idle' : 'now bar'}), signed in: no title bar; the page foot clears the tab bar${idle ? '' : ' and the now bar'}`, async () => {
      mockIdle = idle;
      mockChats = () => Promise.resolve([{ with: { id: 'u2', displayName: 'Ana', avatarUrl: undefined }, last: { createdAt: Date.now(), kind: 'text', body: 'hi' }, unread: 0 }]);
      const r = await render(createElement(SafeAreaInsetsContext.Provider, { value: { top: 0, bottom: 34, left: 0, right: 0 } }, createElement(ChatTab)));
      expect(r.root.findAllByType(TitleBar).length).toBe(0);
      const page = r.root.findAll((n) => n.props['testID'] === 'page-scroll' && n.props['contentContainerStyle'] !== undefined)[0]!;
      expect(flat({ props: { style: page.props['contentContainerStyle'] } } as never)['paddingBottom']).toBe(bottomInset(34, { tabs: true, now: !idle }));
    });
  }

  // 039 (Feed lane): was "the title bar is at the top too"; the title row is the page's first child.
  it('Chat, signed out: the page has its title row and no title bar', async () => {
    mockListener = undefined;
    const r = await render(createElement(ChatTab));
    expect(r.root.findAllByType(TitleBar).length).toBe(0);
    expect(r.root.findAll((n) => n.props['testID'] === 'page-title-row').length).toBeGreaterThan(0);
  });

  it('the now bar adds only its own room to the foot: nowGap + now', () => {
    expect(barsReserve({ tabs: true, now: true }) - barsReserve({ tabs: true })).toBe(bars.nowGap + bars.now);
  });
});

// 037 (run 41789693433, r12-chat: "New chat" drawn over the battery icon): the tab page's SafeAreaView pads the status bar as PADDING, and an absolutely placed
// child measures `top` from the padding box's edge, so it ignores that padding. The tab title must add the inset itself.
describe('037 tab title below the status bar', () => {
  // 039 D4: was "Me and Chat: the title bar sits at 47 + 6". Me is a `Page` now: its content starts below the status bar (inset + spacing.section); Chat keeps its title bar.
  it('Me: with a 47 pt status bar the page content starts below it', async () => {
    const r = await render(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(MeScreen)));
    const page = r.root.findAll((n) => n.props['testID'] === 'page-scroll')[0]!;
    expect(flat({ props: { style: page.props['contentContainerStyle'] } } as never)['paddingTop']).toBe(47 + spacing.section);
  });

  // 039 (Feed lane): was "the title bar sits at 47 + 6, not 6"; the content starts below the status bar (inset + spacing.section), as Me's.
  it('Chat: with a 47 pt status bar the page content starts below it', async () => {
    const r = await render(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(ChatTab)));
    const page = r.root.findAll((n) => n.props['testID'] === 'page-scroll' && n.props['contentContainerStyle'] !== undefined)[0]!;
    expect(flat({ props: { style: page.props['contentContainerStyle'] } } as never)['paddingTop']).toBe(47 + spacing.section);
  });
});
