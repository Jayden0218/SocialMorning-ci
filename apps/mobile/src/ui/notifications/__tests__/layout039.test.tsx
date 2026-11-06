// Spec 039 US1/US2 (T015): Notifications is a Page of one chip row and one card per item, with no rail and no vertical label.
/**
 * Written BEFORE the rebuild (red on the 038 tip: a spine column, an EdgeLabel per day, two tiles, a time chip beside a time in the sentence).
 * Asks: no `edge-measure` (EdgeLabel) and no `spine-line` / `spine-column`; one `feed-card` per item; the moment's time is printed once per
 * item; People, Interactions, System and Hosts are in ONE `notice-chips` row; a stale feed shows an InlineNotice whose Retry calls refresh;
 * the page is a `Page`. Break to watch red: put `<EdgeLabel>` or `<SpineColumn>` back in app/notifications.tsx, or drop `InlineNotice`.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockMore = jest.fn();
const mockList = jest.fn();
const mockPullScroll = jest.fn();
const mockPull = { type: 'View', props: {}, key: null, ref: null, $$typeof: Symbol.for('react.transitional.element'), _owner: null, _store: {} };
let mockView: unknown;
let mockHold: Promise<unknown> | undefined;
let mockListener: { listenerId: string } | undefined = { listenerId: 'me' };
const mockStores = { settings: { get: () => undefined, set: () => undefined }, feedCache: {}, auth: { get: () => undefined } };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/x',
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockApi = {};
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockListener }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ feed: (x: unknown) => x }) }));
jest.mock('@/graph/feed', () => ({
  createFeed: () => ({
    cached: () => mockView, lastOpened: () => undefined, unreadSince: (items: unknown[]) => items.length, markOpened: () => undefined,
    refresh: () => { mockRefresh(); return mockHold ?? Promise.resolve(mockView); }, more: (n: string) => { mockMore(n); return Promise.resolve({ items: [] }); },
  }),
}));
const mockNotif = { list: (c?: string) => { mockList(c); return Promise.resolve({ items: [{ id: 'n1', kind: 'reply', actor: { id: 'B', name: 'Bea', avatarUrl: null }, ref: { commentId: 'c', parentId: 'p', excerpt: 'Agree', episodeTitle: 'Seven' }, createdAt: new Date().toISOString(), unread: true }], next: c ? null : 'n2' }); }, markSeen: () => Promise.resolve() };
jest.mock('@/social/notifications-api', () => ({ ...jest.requireActual('@/social/notifications-api'), useNotificationsApi: () => mockNotif }));
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => ({ muteThread: () => Promise.resolve() }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
const mockPullCalls: { refreshing: boolean; onRefresh: () => void }[] = [];
jest.mock('@/ui/kit/PullRefresh', () => ({ usePullRefresh: (refreshing: boolean, onRefresh: () => void) => { mockPullCalls.push({ refreshing, onRefresh }); return { backdrop: null, inline: null, refreshControl: mockPull, onScroll: mockPullScroll, scrollEventThrottle: 16 }; } }));

import NotificationsScreen from '../../../../app/notifications';

const NOW = new Date().toISOString();
const feedItem = (id: number, kind: string, name: string, title: string, momentMs: number | null) => ({
  id, kind, actor: { id: `u${id}`, displayName: name }, episode: { id: `e${id}`, title, showTitle: 'Night Shift', imageUrl: null }, momentMs, refId: kind === 'clipped' ? 'c9' : null, createdAt: NOW,
});
const ITEMS = [feedItem(1, 'commented', 'Bea', 'The salt episode', 50_000), feedItem(2, 'listened', 'Cal', 'Rain sounds', null), feedItem(3, 'clipped', 'Fay', 'A clipped one', 43_000)];

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
beforeEach(() => { mockMore.mockClear(); mockList.mockClear(); mockPullScroll.mockClear(); mockPush.mockClear(); mockRefresh.mockClear(); mockListener = { listenerId: 'me' }; mockView = { items: ITEMS, stale: false }; });
async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(NotificationsScreen))); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;

describe('Notifications on Page (spec 039 B-Notifications)', () => {
  it('the refresh that opening the page starts does not open the pull gap; only a pull does (run 42195300126: the title sat 120 pt low and a tap on Back missed)', async () => {
    mockPullCalls.length = 0;
    const r = await render();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockPullCalls.every((c) => c.refreshing === false)).toBe(true);
    const last = mockPullCalls[mockPullCalls.length - 1]!;
    let release!: () => void;
    mockHold = new Promise((res) => { release = () => res(mockView); });
    await act(async () => { last.onRefresh(); await Promise.resolve(); });
    expect(mockPullCalls[mockPullCalls.length - 1]!.refreshing).toBe(true);
    mockHold = undefined;
    release();
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(mockPullCalls[mockPullCalls.length - 1]!.refreshing).toBe(false);
    expect(r).toBeDefined();
  });

  it('is a Page with the title and a Back', async () => {
    const r = await render();
    expect(byId(r, 'page-scroll').length).toBe(1);
    expect(words(r)).toContain('Notifications');
    expect(r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Back').length).toBeGreaterThan(0);
  });

  it('has no vertical day label, no rail and no tiles', async () => {
    const r = await render();
    expect(byId(r, 'edge-measure').length).toBe(0);
    expect(byId(r, 'spine-line').length).toBe(0);
    expect(byId(r, 'spine-column').length).toBe(0);
    expect(byId(r, 'notice-entries').length).toBe(0);
    expect(words(r)).toContain('Today');
  });

  it('is one card per item, and the moment time is printed once', async () => {
    const r = await render();
    expect(byId(r, 'feed-card').length).toBe(3);
    expect(words(r).filter((w) => w.includes('0:50')).length).toBe(1);
    expect(words(r).filter((w) => w.includes('0:43')).length).toBe(1);
    expect(byId(r, 'feed-episode').length).toBe(3);
  });

  it('People, Interactions, System and Hosts are chips in one row', async () => {
    const r = await render();
    const row = byId(r, 'notice-chips')[0]!;
    expect(row).toBeDefined();
    const inRow = (pred: (n: ReactTestInstance) => boolean) => row.findAll((n) => typeof n.type === 'string' && pred(n)).length > 0;
    expect(inRow((n) => String(n.props['accessibilityLabel']).startsWith('People.'))).toBe(true);
    expect(inRow((n) => String(n.props['accessibilityLabel']).startsWith('Interactions.'))).toBe(true);
    expect(inRow((n) => /^System\b/.test(String(n.props['accessibilityLabel'])))).toBe(true);
    expect(inRow((n) => /^From hosts\b/.test(String(n.props['accessibilityLabel'])))).toBe(true);
    expect(byId(r, 'notice-badge').length).toBeGreaterThan(0);
  });

  it('System › and Hosts › open their pages', async () => {
    const r = await render();
    const open = (label: RegExp) => act(() => { r.root.findAll((n) => typeof n.props['onPress'] === 'function' && label.test(String(n.props['accessibilityLabel'])))[0]!.props['onPress'](); });
    open(/^System\b/); expect(mockPush).toHaveBeenLastCalledWith('/notifications/system');
    open(/^From hosts\b/); expect(mockPush).toHaveBeenLastCalledWith('/notifications/hosts');
  });

  it('a failed refresh is an InlineNotice with a Retry that refreshes, not a large pink line', async () => {
    mockView = { items: ITEMS, stale: true, fetchedAt: Date.now() };
    const r = await render();
    expect(byId(r, 'inline-notice').length).toBe(1);
    expect(byId(r, 'stale-line').length).toBe(0);
    mockRefresh.mockClear();
    await act(async () => { r.root.findAll((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function')[0]!.props['onPress'](); await Promise.resolve(); });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('a fresh feed shows no notice', async () => {
    const r = await render();
    expect(byId(r, 'inline-notice').length).toBe(0);
  });

  it('Interactions: one card per notice with the time of day once, and no rail', async () => {
    const r = await render();
    await act(async () => { r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Interactions.'))[0]!.props['onPress'](); for (let i = 0; i < 4; i++) await Promise.resolve(); });
    expect(byId(r, 'notice-card').length).toBe(1);
    expect(byId(r, 'spine-line').length).toBe(0);
    expect(byId(r, 'edge-measure').length).toBe(0);
    expect(byId(r, 'notice-time').length).toBe(1);
    expect(flat(byId(r, 'notice-card')[0])).toMatchObject({ padding: 16 });
  });

  it('an Interactions card is at least 44 tall to touch (a follow row was 318 x 40, run 42031752701)', async () => {
    const r = await render();
    await act(async () => { r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Interactions.'))[0]!.props['onPress'](); for (let i = 0; i < 4; i++) await Promise.resolve(); });
    const card = byId(r, 'notice-card')[0]!;
    const press = card.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'link' && /Bea/.test(String(n.props['accessibilityLabel'])))[0]!;
    expect(Number(flat(press)['minHeight'])).toBeGreaterThanOrEqual(44);
  });

  it('Back: its 44 frame is pulled left so the glyph box starts ON the 20 gutter (not before it), and it is the documented -bleed element for the edges check', async () => {
    const r = await render();
    const back = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Back')[0]!;
    const s = flat(back);
    expect(20 + Number(s['marginLeft']) + (Number(s['width']) - 22) / 2).toBeGreaterThanOrEqual(20);
    expect(String(back.props['testID'])).toMatch(/-bleed$/);
  });

  const NEAR = { nativeEvent: { contentOffset: { y: 900 }, layoutMeasurement: { height: 800 }, contentSize: { height: 1500 } } };
  const FAR = { nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 800 }, contentSize: { height: 3000 } } };

  it('People: pull to refresh calls refresh, and scrolling near the end loads the next page', async () => {
    mockView = { items: ITEMS, stale: false, next: 'p2' };
    const r = await render();
    const scroll = byId(r, 'page-scroll')[0]!;
    expect(scroll.props['refreshControl']).toBe(mockPull);
    await act(async () => { scroll.props['onScroll'](FAR); await Promise.resolve(); });
    expect(mockMore).not.toHaveBeenCalled();
    await act(async () => { scroll.props['onScroll'](NEAR); await Promise.resolve(); });
    expect(mockPullScroll).toHaveBeenCalled();
    expect(mockMore).toHaveBeenCalledWith('p2');
    expect(byId(r, 'show-more').length).toBe(0);
  });

  it('Interactions: scrolling near the end asks for the next page', async () => {
    const r = await render();
    await act(async () => { r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Interactions.'))[0]!.props['onPress'](); for (let i = 0; i < 4; i++) await Promise.resolve(); });
    mockList.mockClear();
    const scroll = byId(r, 'page-scroll')[0]!;
    await act(async () => { scroll.props['onScroll'](FAR); await Promise.resolve(); });
    expect(mockList).not.toHaveBeenCalled();
    await act(async () => { scroll.props['onScroll'](NEAR); await Promise.resolve(); });
    expect(mockList).toHaveBeenCalledWith('n2');
  });
});
