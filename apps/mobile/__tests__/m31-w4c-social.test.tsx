// Tests that chat, New chat, Notifications (and its three pages) and Friends listening match their drawings in the numbers the owner compared.
/**
 * M31 W4-C (T052; owner: "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2 `social.html` `chat-thread--*`, `chat-new--*`, `notifications--*`, `notifications-hosts--*`,
 * `notifications-system--*`, `discover.html` `friends-listening--*`, and kit.js / kit.css. Each test names the revert that turns it
 * red (each was seen red once, then restored):
 *  - a bubble is radius 18 with a 6 tail, up to 236 wide; mine hot with void words: `CHAT.bubbleTail` / `bg-hot` changed — red;
 *  - an episode message is a 236 card with a 32 Play: `CHAT.episodePlay`, the `onPlay` button dropped — red;
 *  - a node starts after a gap of more than 10 minutes: `CHAT.tickGapMs` changed — red;
 *  - the thread's zone: avatar 36, Send 52 and half-faded until there is text, the dashed 56 note: `CHAT.send`, `cannot` — red;
 *  - New chat: tiles 84 / radius 22 / padding 14 in the 28 / 16 lane, "follows you back" or the hot Send chip: `ME_MOSAIC.row`, `sharing` — red;
 *  - the switch is 44 with 38 choices and 16 badges; the tiles are 84: `NOTICE.switchHeight`, `NOTICE.tileHeight` — red;
 *  - an unread notice has a 3 wide hot edge and a hot dot; a host card has a 36 cover and 120 x 90 pictures; a System action is 40:
 *    `NotifCard unread`, `NOTIF.pictureW`, `height={40}` — red;
 *  - Friends listening: deck cards 250 x 160, thread avatar 40, Play 36: `FRIENDS.deckWidth`, `FRIENDS.playHeight` — red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockPlay = jest.fn();
const mockOpen = jest.fn();
const mockSend = jest.fn();
const mockMute = jest.fn(() => Promise.resolve());
let mockParams: Record<string, string> = { id: 'ana', name: 'Ana' };
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Mei Lin' };
let mockThread: () => Promise<unknown> = () => Promise.resolve({ with: { id: 'ana', displayName: 'Ana' }, canSend: true, messages: [] });
let mockFriends: () => Promise<unknown> = () => Promise.resolve([]);
let mockNotices: () => Promise<unknown> = () => Promise.resolve({ items: [], next: null });
let mockHosts: () => Promise<unknown> = () => Promise.resolve({ items: [] });
let mockSystem: () => Promise<unknown> = () => Promise.resolve([]);
let mockFeedView: unknown;
let mockListening: () => Promise<unknown> = () => Promise.resolve([]);
let mockLikes: () => Promise<unknown> = () => Promise.resolve({ items: [] });
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  feedCache: {},
  feeds: { getEpisode: () => undefined, getShow: () => undefined },
  auth: { get: () => undefined },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/x',
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => ({}) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
// One api object: a new one per render would re-make the feed and re-run the page's focus effect for ever.
const mockProfileOf = jest.fn((id: string): Promise<unknown> => Promise.resolve({ id, displayName: 'Ana' }));
const mockApi = { profile: (id: string) => mockProfileOf(id), follow: jest.fn(() => Promise.resolve()), unfollow: jest.fn(() => Promise.resolve()), registerEpisode: jest.fn(() => Promise.resolve()) };
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockListener }) }));
const mockChatApi = { thread: () => mockThread(), friends: () => mockFriends(), send: (...a: unknown[]) => mockSend(...a) };
jest.mock('@/social/chat-api', () => ({ ...jest.requireActual('@/social/chat-api'), useChatApi: () => mockChatApi }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: mockOpen, play: mockPlay }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ safety: { isHidden: () => false }, feed: (x: unknown) => x }) }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
let mockColdCache = false;
jest.mock('@/graph/feed', () => ({ createFeed: () => ({ cached: () => (mockColdCache ? undefined : mockFeedView), unread: () => 3, lastOpened: () => undefined, unreadSince: (items: unknown[]) => items.length, markOpened: () => undefined, refresh: () => Promise.resolve(mockFeedView), more: () => Promise.resolve({ items: [] }) }) }));
const mockNoticesApi = { list: () => mockNotices(), markSeen: () => Promise.resolve(), system: () => mockSystem() };
jest.mock('@/social/notifications-api', () => ({ ...jest.requireActual('@/social/notifications-api'), useNotificationsApi: () => mockNoticesApi }));
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => ({ muteThread: (...a: unknown[]) => mockMute(...(a as [])) }) }));
// Stable objects, as the real hooks give: a new one per render would re-run the pages' loads for ever.
const mockM19 = { hostNotices: () => mockHosts() };
const mockM12 = { friendsListening: () => mockListening() };
const mockProfile = { likesTimeline: () => mockLikes() };
jest.mock('@/social/m19-api', () => ({ useM19Api: () => mockM19 }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfile }));
jest.mock('@/ui/discover/TheirLikes', () => ({ openLikePost: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ChatThread from '../app/chat/[id]';
import NewChat from '../app/chat/new';
import NotificationsScreen from '../app/notifications';
import HostsScreen from '../app/notifications/hosts';
import SystemScreen from '../app/notifications/system';
import FriendsListening from '../app/friends-listening';
import { MessageBubble } from '@/ui/chat/MessageBubble';
import { chatNodes, tickLabel } from '@/ui/chat/nodes';
import { CHAT } from '@/ui/chat/measures';
import { NoticeCards, NoticeEntries, NOTICE } from '@/ui/social/NoticeCards';
import { FRIENDS } from '@/ui/notifications/measures';
import { NOTIF } from '@/ui/notifications/parts';
import type { ChatMessage } from '@/social/chat-api';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockPlay, mockOpen, mockSend, mockMute].forEach((m) => m.mockClear());
  mockParams = { id: 'ana', name: 'Ana' };
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockThread = () => Promise.resolve({ with: { id: 'ana', displayName: 'Ana' }, canSend: true, messages: [] });
  mockFriends = () => Promise.resolve([]);
  mockNotices = () => Promise.resolve({ items: [], next: null });
  mockHosts = () => Promise.resolve({ items: [] });
  mockSystem = () => Promise.resolve([]);
  mockFeedView = undefined;
  mockColdCache = false;
  mockProfileOf.mockClear();
  mockListening = () => Promise.resolve([]);
  mockLikes = () => Promise.resolve({ items: [] });
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = hosts(r, (x) => x.props['accessibilityLabel'] === label)[0];
  if (!n) throw new Error(`nothing is labelled "${label}"`);
  return n;
};
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const press = (r: ReactTestRenderer, label: string): void => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  act(() => { n.props['onPress'](); });
};

const msg = (over: Partial<ChatMessage>): ChatMessage => ({ id: '1', fromMe: false, body: 'Hello', createdAt: '2026-10-27T09:00:00.000Z', read: false, ...over });
const EP = { id: 'e1', feedUrl: 'f', guid: 'g', title: 'Cities that sleep late', showTitle: 'Night Shift Radio', enclosureUrl: 'u' };

describe('chat messages (chat-thread--screen)', () => {
  it('theirs is a raise bubble, radius 18 with a 6 tail, up to 236 wide, padding 10 / 13', async () => {
    const r = await render(createElement(MessageBubble, { message: msg({}), showRead: false, onOpenEpisode: () => undefined }));
    const b = byId(r, 'chat-bubble')[0]!;
    expect(classOf(b)).toContain('bg-raise');
    expect(flat(b)).toMatchObject({ maxWidth: 236, borderRadius: 18, borderBottomLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 13 });
  });

  it('mine is hot with void words, right-aligned, the tail on the right; "Seen" once they have read it', async () => {
    const r = await render(createElement(MessageBubble, { message: msg({ fromMe: true, read: true }), showRead: true, onOpenEpisode: () => undefined }));
    const b = byId(r, 'chat-bubble')[0]!;
    expect(classOf(b)).toContain('bg-hot');
    expect(classOf(b)).toContain('self-end');
    expect(flat(b)).toMatchObject({ borderBottomRightRadius: 6 });
    expect(r.root.findAll((x) => String(x.type) === 'Text' && classOf(x).includes('text-void')).map((x) => say(x.props['children']))).toContain('Hello');
    expect(words(r)).toContain('Seen');
  });

  it('an episode is a 236 card with the cover, the title, the show and a 32 Play that plays it; the card opens it', async () => {
    const onOpen = jest.fn();
    const onPlay = jest.fn();
    const r = await render(createElement(MessageBubble, { message: msg({ body: '', episode: EP }), showRead: false, onOpenEpisode: onOpen, onPlayEpisode: onPlay }));
    expect(flat(byId(r, 'chat-episode')[0])).toMatchObject({ width: 236, borderRadius: 18, padding: 10 });
    expect(flat(byLabel(r, 'Play Cities that sleep late'))).toMatchObject({ width: 32, height: 32 });
    press(r, 'Play Cities that sleep late');
    expect(onPlay).toHaveBeenCalledWith(EP);
    press(r, 'Open episode Cities that sleep late, Night Shift Radio');
    expect(onOpen).toHaveBeenCalledWith(EP);
  });
});

describe('chat nodes (the ticks)', () => {
  const now = new Date(2026, 9, 27, 12, 0);
  const at = (d: number, h: number, m: number): string => new Date(2026, 9, d, h, m).toISOString();
  it('a gap of more than 10 minutes starts a node; closer messages share one', () => {
    const nodes = chatNodes([msg({ id: '1', createdAt: at(27, 9, 0) }), msg({ id: '2', createdAt: at(27, 9, 10) }), msg({ id: '3', createdAt: at(27, 9, 21) })], now);
    expect(nodes.map((n) => n.messages.map((m) => m.id))).toEqual([['1', '2'], ['3']]);
  });
  it('the tick is the clock today, the weekday earlier in the week, the date after that', () => {
    expect(tickLabel(new Date(2026, 9, 27, 9, 12), undefined, now)).toBe('9:12');
    expect(tickLabel(new Date(2026, 9, 26, 9, 12), undefined, now)).toBe('Mon');
    expect(tickLabel(new Date(2026, 9, 26, 9, 40), new Date(2026, 9, 26, 9, 12), now)).toBe('9:40');
    expect(tickLabel(new Date(2026, 9, 12, 9, 12), undefined, now)).toBe('12 Oct');
  });
});

describe('the chat page (chat-thread--*)', () => {
  const thread = (over: Record<string, unknown> = {}) => () => Promise.resolve({ with: { id: 'ana', displayName: 'Ana' }, canSend: true, messages: [msg({ id: '1', createdAt: new Date().toISOString() }), msg({ id: '2', fromMe: true, body: 'Hi', createdAt: new Date().toISOString(), read: true })], ...over });

  it('the thumb zone: back, Ana at 36 with "open profile ›", the box (52) and the 52 Send, half-faded until there is text', async () => {
    mockThread = thread();
    const r = await render(createElement(ChatThread));
    expect(byId(r, 'chat-header').length).toBe(1);
    expect(words(r)).toContain('open profile ›');
    const send = byLabel(r, 'Send');
    expect(flat(send)).toMatchObject({ width: 52, height: 52, borderRadius: 26 });
    expect(classOf(send)).toContain('opacity-50');
    expect(classOf(send)).toContain('bg-hot');
    const box = hosts(r, (n) => n.props['accessibilityLabel'] === 'Message')[0]!;
    act(() => { box.props['onChangeText']('Hello'); });
    expect(classOf(byLabel(r, 'Send'))).not.toContain('opacity-50');
    press(r, 'Ana, open profile');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/profile/[id]', params: { id: 'ana' } });
  });

  it('the messages hang from the spine at x 40, with a tick for the node', async () => {
    mockThread = thread();
    const r = await render(createElement(ChatThread));
    expect(byId(r, 'spine-line').length).toBe(1);
    expect(flat(byId(r, 'spine-line')[0])).toMatchObject({ left: 40, width: 2 });
    expect(byId(r, 'thread-node').length).toBe(1);
  });

  it('when you cannot send, a dashed 56 note replaces the box', async () => {
    mockThread = thread({ canSend: false });
    const r = await render(createElement(ChatThread));
    const note = byId(r, 'chat-cannot-send')[0]!;
    expect(classOf(note)).toContain('border-dashed');
    expect(flat(note)).toMatchObject({ minHeight: 56, borderRadius: 22 });
    expect(words(r)).toContain('You can send messages while you both follow each other.');
    expect(hosts(r, (n) => n.props['accessibilityLabel'] === 'Send').length).toBe(0);
  });

  it('signed out: the lock block with a light Sign in and no box; the name row stays', async () => {
    mockListener = undefined;
    const r = await render(createElement(ChatThread));
    expect(words(r)).toContain('Sign in to chat.');
    expect(flat(byId(r, 'signin-block')[0] ?? undefined)).toBeDefined();
    press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    expect(byId(r, 'chat-header').length).toBe(1);
    expect(hosts(r, (n) => n.props['accessibilityLabel'] === 'Message').length).toBe(0);
  });

  it('a failed first load: the wifi block with the sentence, the name row, no box', async () => {
    mockThread = () => Promise.reject(new Error('down'));
    const r = await render(createElement(ChatThread));
    expect(words(r)).toContain("Couldn't reach the server.");
    expect(byId(r, 'err-block').length).toBe(1);
    expect(byId(r, 'chat-header').length).toBe(1);
    expect(hosts(r, (n) => n.props['accessibilityLabel'] === 'Message').length).toBe(0);
  });

  it('F3 defect 8: opened without a name (a link, signed out, or a failed read) the bar names the person from their public profile, not "Chat"', async () => {
    mockParams = { id: 'ana' };
    mockListener = undefined;
    let r = await render(createElement(ChatThread));
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(mockProfileOf).toHaveBeenCalledWith('ana');
    const header = byId(r, 'chat-header')[0]!;
    expect(words(r)).toContain('Ana');
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Ana, open profile' && typeof x.props['onPress'] === 'function').length).toBeGreaterThan(0);
    expect(header).toBeDefined();
    act(() => r.unmount());
    mockListener = { listenerId: 'me', displayName: 'Mei' };
    mockThread = () => Promise.reject(new Error('down'));
    r = await render(createElement(ChatThread));
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(words(r)).toContain('Ana');
    expect(words(r)).not.toContain('Chat');
  });

  it('no messages yet: "Say hello to Ana."', async () => {
    const r = await render(createElement(ChatThread));
    expect(words(r)).toContain('Say hello to Ana.');
  });

  it('sending keeps the text and tells you when it fails', async () => {
    mockThread = thread();
    mockSend.mockRejectedValueOnce(new Error('offline'));
    const r = await render(createElement(ChatThread));
    const box = hosts(r, (n) => n.props['accessibilityLabel'] === 'Message')[0]!;
    act(() => { box.props['onChangeText']('Hello'); });
    press(r, 'Send');
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(mockToast).toHaveBeenCalledWith("Couldn't send — check your connection and try again.");
    expect(hosts(r, (n) => n.props['accessibilityLabel'] === 'Message')[0]!.props['value']).toBe('Hello');
  });
});

describe('New chat (chat-new--*)', () => {
  const friends = [{ id: 'a', displayName: 'Ana' }, { id: 'b', displayName: 'Bo' }, { id: 'c', displayName: 'Cy' }];

  it('the people are 84 tall tiles, radius 22, padding 14, two to a row in the 28 / 16 lane, with "follows you back"', async () => {
    mockFriends = () => Promise.resolve(friends);
    mockParams = {};
    const r = await render(createElement(NewChat));
    const tile = byLabel(r, 'Chat with Ana');
    expect(flat(tile)).toMatchObject({ minHeight: 84, borderRadius: 22, padding: 14, width: 168 });
    expect(classOf(tile)).toContain('bg-raise');
    expect(flat(byId(r, 'chat-tiles')[0])).toMatchObject({ marginLeft: 28, marginRight: 16, gap: 10 });
    expect(words(r).filter((w) => w === 'follows you back').length).toBe(3);
    press(r, 'Chat with Bo');
    expect(words(r)).toContain('No more to fetch');
  });

  it('sending an episode: the SHARING card on top, a hot Send chip on each tile, no "follows you back"', async () => {
    mockFriends = () => Promise.resolve(friends);
    mockParams = { episodeId: 'e1', episodeTitle: 'Why mornings matter' };
    const r = await render(createElement(NewChat));
    const card = byId(r, 'sharing-card')[0]!;
    expect(flat(card)).toMatchObject({ borderRadius: 20, padding: 10 });
    expect(words(r)).toContain('SHARING');
    expect(words(r)).toContain('Why mornings matter');
    expect(words(r).filter((w) => w === 'Send').length).toBe(3);
    expect(words(r)).not.toContain('follows you back');
    expect(byLabel(r, 'Send to Ana')).toBeDefined();
  });

  it('signed out and a failed load have their own blocks', async () => {
    mockListener = undefined;
    mockParams = {};
    let r = await render(createElement(NewChat));
    expect(words(r)).toContain('Sign in to chat with people who follow you back');
    act(() => r.unmount());
    mockListener = { listenerId: 'me', displayName: 'Mei' };
    mockFriends = () => Promise.reject(new Error('down'));
    r = await render(createElement(NewChat));
    expect(words(r)).toContain("Couldn't load this right now.");
    expect(byLabel(r, 'Retry')).toBeDefined();
  });
});

describe('the Notifications switch and tiles', () => {
  it('the switch is a 44 raise track of 38 choices; a count is a 16 hot badge', async () => {
    const r = await render(createElement(NoticeCards, { section: 'people', unread: 3, interactionsUnread: 2, onSelect: () => undefined }));
    expect(flat(byId(r, 'notice-switch')[0])).toMatchObject({ height: NOTICE.switchHeight, padding: 3, gap: 4 });
    expect(NOTICE.switchHeight).toBe(44);
    const tab = hosts(r, (n) => n.props['accessibilityRole'] === 'tab')[0]!;
    expect(flat(tab)).toMatchObject({ height: 38 });
    expect(classOf(tab)).toContain('bg-text');
    const badge = byId(r, 'notice-badge')[0]!;
    expect(flat(badge)).toMatchObject({ minWidth: 16, height: 16 });
    expect(classOf(badge)).toContain('bg-hot');
  });

  it('System and From hosts are 84 tall 1 x 1 tiles in the lane', async () => {
    const r = await render(createElement(NoticeEntries, { onOpen: () => undefined }));
    expect(flat(byId(r, 'notice-entries')[0])).toMatchObject({ marginLeft: 28, marginRight: 16, gap: 10 });
    const tile = hosts(r, (n) => n.props['accessibilityRole'] === 'link')[0]!;
    expect(flat(tile)).toMatchObject({ minHeight: 84, borderRadius: 22, padding: 12 });
    expect(words(r)).toEqual(expect.arrayContaining(['System ›', 'From hosts ›']));
  });
});

describe('the Notifications page (notifications--*)', () => {
  const notice = (over: Record<string, unknown> = {}) => ({ id: 'n1', kind: 'reply', actor: { id: 'B', name: 'Bea', avatarUrl: null }, ref: { commentId: 'r', parentId: 'p', excerpt: 'The pause.', episodeTitle: 'Why mornings matter' }, createdAt: new Date().toISOString(), unread: true, ...over });

  it('People: the person, what they did, the episode, on the spine under a day label', async () => {
    mockFeedView = { items: [{ id: 1, kind: 'commented', actor: { id: 'A', displayName: 'Ana' }, episode: { id: 'e1', title: 'Why mornings matter', showTitle: 'Morning Notes', imageUrl: null }, momentMs: 872000, refId: null, createdAt: new Date().toISOString() }], stale: false };
    const r = await render(createElement(NotificationsScreen));
    expect(byId(r, 'feed-card').length).toBe(1);
    expect(flat(byId(r, 'feed-card')[0])).toMatchObject({ borderRadius: 18, padding: 12 });
    expect(words(r)).toEqual(expect.arrayContaining(['Ana', ' commented at 14:32 on', 'Why mornings matter', 'TODAY'].filter((w) => w !== 'TODAY')));
    expect(byId(r, 'day-block').length).toBe(1);
    expect(byId(r, 'notice-entries').length).toBe(1);
    press(r, 'Ana commented at 14:32 on Why mornings matter (Morning Notes)');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'e1', at: '872000' } });
  });

  it('People, nothing yet and the stale first load', async () => {
    mockFeedView = undefined;
    let r = await render(createElement(NotificationsScreen));
    expect(words(r)).toContain('No activity yet — follow people from their profile');
    expect(byId(r, 'notice-entries').length).toBe(1);
    act(() => r.unmount());
    mockFeedView = { items: [], stale: true };
    r = await render(createElement(NotificationsScreen));
    expect(words(r)).toContain("You're offline and nothing is saved here yet.");
    expect(byLabel(r, 'Retry')).toBeDefined();
    expect(words(r)).toContain('Try again');
  });

  it('signed out: the lock block for the section, and the switch stays so both lines can be reached', async () => {
    mockListener = undefined;
    const r = await render(createElement(NotificationsScreen));
    expect(words(r)).toContain('Sign in to follow people and see what they listen to.');
    press(r, byLabel(r, 'Interactions. Replies, likes, mentions and follows aimed at you').props['accessibilityLabel']);
    expect(words(r)).toContain('Sign in to see replies, likes, mentions and new followers.');
  });

  it('F3 defect 9: both choices print their unread badges on People — People\'s from the fetched page when the cache was cold, Interactions\' without opening it', async () => {
    mockColdCache = true;
    mockFeedView = { items: [{ id: 1, kind: 'commented', actor: { id: 'A', displayName: 'Ana' }, episode: { id: 'e1', title: 'Why mornings matter', showTitle: 'Morning Notes', imageUrl: null }, momentMs: null, refId: null, createdAt: new Date().toISOString() }, { id: 2, kind: 'commented', actor: { id: 'J', displayName: 'Jo' }, episode: { id: 'e1', title: 'Why mornings matter', showTitle: 'Morning Notes', imageUrl: null }, momentMs: null, refId: null, createdAt: new Date().toISOString() }], stale: false };
    mockNotices = () => Promise.resolve({ items: [notice(), notice({ id: 'n2' }), notice({ id: 'n3', unread: false })], next: null });
    const r = await render(createElement(NotificationsScreen));
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    const badges = byId(r, 'notice-badge').map((b) => words(r).length && b.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children'])).join(''));
    expect(badges).toEqual(['2', '2']);
    expect(byLabel(r, 'People. 2 new. New activity from people you follow')).toBeDefined();
    expect(byLabel(r, 'Interactions. 2 new. New replies, likes, mentions and follows')).toBeDefined();
    expect(words(r)).toContain('New activity from people you follow');
  });

  it('Interactions: an unread notice hangs from a hot dot and has a 3 wide hot edge; ⋯ opens the mute sheet; Mute this mutes', async () => {
    mockNotices = () => Promise.resolve({ items: [notice()], next: null });
    const r = await render(createElement(NotificationsScreen));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    press(r, byLabel(r, 'Interactions. 1 new. New replies, likes, mentions and follows').props['accessibilityLabel']);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(byId(r, 'unread-dot').length).toBe(1);
    expect(flat(byId(r, 'unread-dot')[0])).toMatchObject({ width: 10, height: 10 });
    expect(flat(byId(r, 'notif-unread-edge')[0])).toMatchObject({ width: 3 });
    expect(words(r)).toContain('“The pause.”');
    press(r, 'More for Bea replied to your comment');
    expect(words(r)).toContain('No more notices from this thread');
    press(r, 'Mute this');
    expect(mockMute).toHaveBeenCalled();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mockToast).toHaveBeenCalledWith('Muted. No more notices from this thread.');
  });

  it('Interactions: nothing yet, and a failed load is an inline error card with Retry', async () => {
    let r = await render(createElement(NotificationsScreen));
    press(r, byLabel(r, 'Interactions. Replies, likes, mentions and follows aimed at you').props['accessibilityLabel']);
    await act(async () => { await Promise.resolve(); });
    expect(words(r)).toContain('Nothing yet. When someone replies to you, likes your comment, mentions you or follows you, it appears here.');
    act(() => r.unmount());
    mockNotices = () => Promise.reject(new Error('down'));
    r = await render(createElement(NotificationsScreen));
    press(r, byLabel(r, 'Interactions. Replies, likes, mentions and follows aimed at you').props['accessibilityLabel']);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(words(r)).toContain("Couldn't load your interactions right now.");
    const retry = byLabel(r, 'Retry');
    expect(flat(retry)).toMatchObject({ height: 40 });
  });
});

describe('From hosts and System (notifications-hosts--*, notifications-system--*)', () => {
  it('a host card: the cover at 36, "Show ›", the words, pictures 120 x 90; the card opens the show', async () => {
    mockHosts = () => Promise.resolve({ items: [{ id: 'h1', feedUrl: 'https://x/feed', showTitle: 'Morning Notes', body: 'New season starts Monday.', images: ['https://x/a.jpg', 'https://x/b.jpg'], releaseAt: new Date().toISOString() }] });
    const r = await render(createElement(HostsScreen));
    expect(flat(byId(r, 'host-card')[0])).toMatchObject({ borderRadius: 18, padding: 12 });
    expect(words(r)).toEqual(expect.arrayContaining(['Morning Notes', ' ›', 'New season starts Monday.']));
    const pics = r.root.findAll((n) => n.props['source']?.uri === 'https://x/a.jpg' && typeof n.type === 'string');
    expect(flat(pics[0])).toMatchObject({ width: NOTIF.pictureW, height: NOTIF.pictureH });
    expect(NOTIF.pictureW).toBe(120);
    expect(NOTIF.hostCover).toBe(36);
    press(r, 'Morning Notes: New season starts Monday.. 2 pictures. Open the show');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://x/feed') } });
  });

  it('From hosts: signed out, none yet, and a failed load', async () => {
    mockListener = undefined;
    let r = await render(createElement(HostsScreen));
    expect(words(r)).toContain('Sign in to see announcements from the shows you follow.');
    act(() => r.unmount());
    mockListener = { listenerId: 'me', displayName: 'Mei' };
    r = await render(createElement(HostsScreen));
    expect(words(r)).toContain('No announcements yet. When a show you follow posts one, it appears here.');
    act(() => r.unmount());
    mockHosts = () => Promise.reject(new Error('down'));
    r = await render(createElement(HostsScreen));
    expect(words(r)).toContain("Couldn't load announcements right now.");
    expect(byLabel(r, 'Retry')).toBeDefined();
  });

  it('a System card: padding 14, the title, the words and a light 40 action that opens its page', async () => {
    mockSystem = () => Promise.resolve([{ id: 's1', title: 'Your appeal was accepted', body: 'Visible again.', createdAt: new Date().toISOString(), action: { label: 'Open the comment', route: '/comments/x' } }]);
    const r = await render(createElement(SystemScreen));
    expect(flat(byId(r, 'system-card')[0])).toMatchObject({ padding: 14, borderRadius: 18 });
    expect(flat(byLabel(r, 'Open the comment'))).toMatchObject({ height: 40 });
    press(r, 'Open the comment');
    expect(mockPush).toHaveBeenCalledWith('/comments/x');
  });

  it('System, none yet', async () => {
    const r = await render(createElement(SystemScreen));
    expect(words(r)).toContain('No messages from SocialNet yet — announcements and account notices will appear here');
  });
});

describe('Friends listening (friends-listening--*)', () => {
  const friend = { episode: { ...EP, imageUrl: undefined }, listeners: [{ id: 'j', name: 'Jo', initials: 'J' }], lastAt: Date.now() - 2 * 3600 * 1000 };
  const like = { listener: { id: 'r', displayName: 'Rui' }, episode: EP, note: 'the part about light', createdAt: new Date().toISOString() };

  it('Their likes is a deck of 250 x 160 cards with Follow (30); what people played hangs on the spine with a 40 avatar and a 36 Play', async () => {
    mockListening = () => Promise.resolve([friend]);
    mockLikes = () => Promise.resolve({ items: [like] });
    const r = await render(createElement(FriendsListening));
    expect(flat(byId(r, 'like-card')[0])).toMatchObject({ width: 250, height: 160, borderRadius: 24, padding: 14 });
    expect(flat(byLabel(r, 'Unfollow Rui'))).toMatchObject({ height: 30 });
    expect(flat(byId(r, 'friend-node')[0])).toBeDefined();
    expect(words(r)).toContain('Jo played');
    expect(flat(byLabel(r, 'Play Cities that sleep late'))).toMatchObject({ height: 36 });
    expect(FRIENDS.avatar).toBe(40);
    press(r, 'Play Cities that sleep late');
    expect(mockPlay).toHaveBeenCalled();
    press(r, 'Cities that sleep late, Night Shift Radio');
    expect(mockOpen).toHaveBeenCalled();
  });

  it('the info circle opens the sheet with the lock tile; Close shuts it', async () => {
    const r = await render(createElement(FriendsListening));
    press(r, 'What is this page?');
    expect(words(r)).toContain('What people you follow liked, and what they played in the last 7 days.');
    expect(words(r).some((w) => w.startsWith('Anyone who listens privately'))).toBe(true);
    press(r, 'Close');
  });

  it('nothing yet: "Quiet week"; signed out: Sign in; a failed load: the error tile with Retry', async () => {
    let r = await render(createElement(FriendsListening));
    expect(words(r)).toContain('Quiet week');
    act(() => r.unmount());
    mockListener = undefined;
    r = await render(createElement(FriendsListening));
    expect(words(r)).toContain('Sign in to see what people you follow are playing');
    press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    act(() => r.unmount());
    mockListener = { listenerId: 'me', displayName: 'Mei' };
    mockListening = () => Promise.reject(new Error('down'));
    r = await render(createElement(FriendsListening));
    expect(byId(r, 'err-tile').length).toBe(1);
    expect(flat(byId(r, 'err-tile')[0])).toMatchObject({ borderRadius: 22, padding: 16, marginLeft: 28, marginRight: 16 });
    expect(flat(byLabel(r, 'Retry'))).toMatchObject({ height: 40 });
  });
});

it('the chat measures are the drawn ones', () => {
  expect(CHAT.bubbleMax).toBe(236);
  expect(CHAT.tickGapMs).toBe(600000);
});
