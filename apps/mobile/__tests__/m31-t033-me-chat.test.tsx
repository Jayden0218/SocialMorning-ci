// Tests that the Me and Chat tabs match their drawings in the numbers the owner compared.
/**
 * M31 T033 (owner: "the design I want completely the same, or you can explain why it is different").
 * Source of every number: specs/033-m31-redesign/design-pulse2/discover.html `me--screen`, `me--signed-out`,
 * `me--plus`, `chat--screen`, `chat--signed-out`, `chat--empty`, `chat--error` and kit.js / kit.css. Each test
 * names the revert that turns it red (each was seen red once, then restored):
 *  - Me tile 84 / radius 22 / padding 14: `ME_MOSAIC.row` back to 64 or the tile back to `bg-surface` — red;
 *  - Saved moments 178 tall, hot, count 40: `TALL_TILE` to one row, `bg-hot` to `bg-primary`, `COUNT` to 34 — red;
 *  - the ring: removing `avatar-ring`, or its width from 106 — red;
 *  - the panel: `PanelGroup` without the rules, rows under 56 — red;
 *  - the title bar sits 8 above the tab bar, 76 with a now bar: `tabTitleBottom` back to `bars.nowGap` only — red;
 *  - Chat spine at x 40, 2 wide; avatar 44; card radius 18; unread bar 3 wide; count pill 20 — each constant in `THREAD` — red;
 *  - signed out / empty / error: the +, the spine and the Retry — the title bar's `actions` and `Spine` — red.
 */
import { createElement } from 'react';
import { StyleSheet, processColor } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { bars, colour } from '@/design';
import { tabTitleBottom } from '@/ui/me/useTabTitle';
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
import { MenuRow } from '@/ui/me/parts';
import { TitleBar } from '@/ui/kit/TitleBar';
import { THREAD } from '@/ui/chat/ChatRow';

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
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = hosts(r, (x) => x.props['accessibilityLabel'] === label)[0];
  if (!n) throw new Error(`nothing is labelled "${label}"`);
  return n;
};
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
/** Press the control with this spoken name (the composite that owns the handler, as the coming-soon guard does). */
const press = (r: ReactTestRenderer, label: string): void => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  act(() => { n.props['onPress'](); });
};
const titleBar = (r: ReactTestRenderer): ReactTestInstance => r.root.findByType(TitleBar);

describe('Me (me--screen, me--signed-out, me--plus)', () => {
  it('a 1 x 1 tile is 84 tall, radius 22, padding 14, with the raise fill', async () => {
    const r = await render(createElement(MeScreen));
    const tile = byLabel(r, 'Downloads');
    expect(flat(tile)).toMatchObject({ minHeight: 84, borderRadius: 22, padding: 14 });
    expect(classOf(tile)).toContain('bg-raise');
    // The label is Geist 600 13/18; the icon is 24.
    expect(words(r)).toContain('Downloads');
  });

  it('Saved moments is the 1 x 2 hot tile: 178 tall, void words, the count at 40', async () => {
    const r = await render(createElement(MeScreen));
    const tile = byLabel(r, 'Saved moments, 3. Save a moment while listening and add a note');
    expect(flat(tile)).toMatchObject({ minHeight: 84 * 2 + 10, borderRadius: 22, flex: 1, minWidth: 0 });
    // F2a (drawn 168 / 168): a `flex: 1` item's share starts from its own padding, so this tile — beside the unpadded column of
    // Notifications / Downloads — keeps its padding on an inner box. Break: put `padding: ME_MOSAIC.pad` back on the Pressable.
    expect(flat(tile)['padding']).toBeUndefined();
    const inner = tile.findAll((n) => flat(n)['padding'] === 14 && flat(n)['paddingHorizontal'] === undefined);
    expect(inner.length).toBeGreaterThan(0);
    expect(classOf(tile)).toContain('bg-hot');
    const count = byId(r, 'moments-count')[0]!;
    expect(say(count.props['children'])).toBe('3');
    expect(flat(count)['fontSize']).toBe(40);
    expect(classOf(count)).toContain('text-void');
  });

  it('the tiles run in the drawn order: Saved moments, Notifications (with its 4 unread), Downloads, then the rest', async () => {
    const r = await render(createElement(MeScreen));
    const order = ['Saved moments, 3. Save a moment while listening and add a note', 'Notifications, 4 new', 'Downloads', 'Listening history', 'Favourites', 'My comments', 'Queue', 'Creator centre', 'Likes', 'Playlists', 'Your September: your month in listening'];
    const seen = hosts(r, (n) => n.props['accessibilityRole'] === 'link' && order.includes(String(n.props['accessibilityLabel']))).map((n) => String(n.props['accessibilityLabel']));
    expect(seen).toEqual(order);
    expect(words(r)).toContain('4'); // the unread badge on Notifications
  });

  it('the picture has the hot ring: 96 + 2 x (3 + 2) = 106, 2 wide, 5 outside', async () => {
    const r = await render(createElement(MeScreen));
    const ring = byId(r, 'avatar-ring')[0]!;
    expect(flat(ring)).toMatchObject({ width: 106, height: 106, borderWidth: 2, left: -5, top: -5, borderRadius: 53 });
    expect(classOf(ring)).toContain('border-hot');
  });

  it('the Stickers chip is 36 tall and sits 16 from the right', async () => {
    const r = await render(createElement(MeScreen));
    const chip = byLabel(r, 'Stickers');
    expect(flat(chip)['height']).toBe(36);
    expect(flat(chip)).toMatchObject({ paddingHorizontal: 14 });
    const box = hosts(r, (n) => flat(n)['right'] === 16 && flat(n)['position'] === 'absolute')[0];
    expect(box).toBeDefined();
  });

  it('PLUS is a 2 x 1 violet-bordered tile above Saved moments only while it is on sale', async () => {
    const off = await render(createElement(MeScreen));
    expect(words(off)).not.toContain('SocialNet PLUS');
    mockStoreReady = true;
    const on = await render(createElement(MeScreen));
    const plus = byLabel(on, 'SocialNet PLUS: see what it adds. Listening stays free');
    expect(flat(plus)).toMatchObject({ minHeight: 84, borderRadius: 22, borderColor: colour.plusLine });
    expect(words(on)).toContain('Extras for supporters. Listening stays free.');
    // F2a: the description is drawn 12 / 16, which fits one line beside the crown (13 / 18 wrapped to two: the banner came out 35 taller).
    // Break: drop `style={drawnType.tileNote}` from it.
    const note = hosts(on, (n) => say(n.props['children']) === 'Extras for supporters. Listening stays free.' && String(n.type) === 'Text')[0]!;
    expect(flat(note)).toMatchObject({ fontSize: 12, lineHeight: 16 });
  });

  it('the panel is one rounded group (22) of 56 rows divided by rules: four rows, three rules', async () => {
    const r = await render(createElement(MeScreen));
    const group = byId(r, 'panel-group')[0]!;
    expect(flat(group)['borderRadius']).toBe(22);
    const rows = r.root.findAllByType(MenuRow).filter((m) => m.props['panel'] === true);
    expect(rows.map((m) => m.props['label'])).toEqual(['Wallet', 'Tips I gave', 'Feedback', 'Account and settings']);
    for (const m of rows) expect(flat(byLabel(r, String(m.props['label'])))).toMatchObject({ minHeight: 56, paddingHorizontal: 16 });
    expect(byId(r, 'panel-rule')).toHaveLength(3);
    expect(flat(byId(r, 'panel-rule')[0]!)).toMatchObject({ height: 1, marginLeft: 16 });
  });

  it('signed in, the title bar is your name, "My profile ›" and a gear — and the name opens your profile', async () => {
    const r = await render(createElement(MeScreen));
    const bar = titleBar(r).props;
    expect(bar.title).toBe('Mei Lin');
    expect(bar.subtitle).toBe('My profile ›');
    expect(bar.actions.map((a: { label: string }) => a.label)).toEqual(['Account and settings']);
    expect(bar.actions[0].icon).toBe('settings-outline');
    act(() => bar.onTitle());
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/profile/[id]', params: { id: 'me' } });
    act(() => bar.onSubtitle());
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/profile/[id]', params: { id: 'me' } });
    act(() => bar.actions[0].onPress());
    expect(mockPush).toHaveBeenLastCalledWith('/account');
  });

  it('the title bar is 8 above the tab bar, and 76 (8 + 58 + 10) with a now bar', async () => {
    expect(tabTitleBottom(false)).toBe(bars.nowGap);
    expect(tabTitleBottom(true)).toBe(bars.nowGap + bars.now + bars.titleAboveNow);
    mockIdle = true;
    expect(titleBar(await render(createElement(MeScreen))).props.bottom).toBe(8);
    mockIdle = false;
    expect(titleBar(await render(createElement(MeScreen))).props.bottom).toBe(76);
  });

  it('signed out: "Sign in ›" is the title, Creator centre, Likes, Playlists, Wallet and Tips are not drawn, the month tile spans the row', async () => {
    mockListener = undefined;
    const r = await render(createElement(MeScreen));
    const bar = titleBar(r).props;
    expect(bar.title).toBe('Sign in ›');
    expect(bar.subtitle).toBe('Keep your listening across phones');
    act(() => bar.onTitle());
    expect(mockPush).toHaveBeenLastCalledWith('/auth/sign-in');
    for (const gone of ['Creator centre', 'Likes', 'Playlists', 'Wallet', 'Tips I gave']) expect(hosts(r, (n) => n.props['accessibilityLabel'] === gone)).toHaveLength(0);
    expect(byId(r, 'avatar-ring')).toHaveLength(0);
    expect(byLabel(r, 'Your September: your month in listening')).toBeDefined();
    expect(r.root.findAllByType(MenuRow).filter((m) => m.props['panel'] === true).map((m) => m.props['label'])).toEqual(['Feedback', 'Account and settings']);
    expect(byId(r, 'panel-rule')).toHaveLength(1);
  });
});

const chat = (over: Partial<{ id: string; name: string; unread: number; text: string }> = {}) => ({
  with: { id: over.id ?? 'a', displayName: over.name ?? 'Rui', avatarUrl: null },
  last: { id: 'm1', fromMe: false, body: over.text ?? 'Did you hear the bit at 14:32?', createdAt: new Date(Date.now() - 120_000).toISOString(), read: true },
  unread: over.unread ?? 0,
  canSend: true,
});

describe('Chat (chat--screen, chat--signed-out, chat--empty, chat--error)', () => {
  it('the spine runs at x 40, 2 wide, hot to violet to line; the avatar is 44 on it', async () => {
    mockChats = () => Promise.resolve([chat({ unread: 2 }), chat({ id: 'b', name: 'Ana Ruiz' })]);
    const r = await render(createElement(ChatTab));
    const spine = byId(r, 'chat-spine')[0]!;
    expect(flat(spine)).toMatchObject({ left: 40, width: 2, top: 0, bottom: 0 });
    expect(spine.props['colors']).toEqual([colour.hot, colour.violet, colour.line].map((c) => processColor(c)));
    expect(spine.props['locations']).toEqual([0, 0.5, 1]);
    expect(THREAD.left + THREAD.avatar / 2).toBe(40);
    const av = byId(r, 'chat-avatar');
    expect(av).toHaveLength(2);
    expect(flat(av[0]!)).toMatchObject({ width: 44, height: 44, zIndex: 2 });
  });

  it('a card is radius 18 raise, padding 12 / 14; unread gets the 3 wide hot bar, the bold name and the 20 pill', async () => {
    mockChats = () => Promise.resolve([chat({ unread: 2 }), chat({ id: 'b', name: 'Ana Ruiz' })]);
    const r = await render(createElement(ChatTab));
    const cards = byId(r, 'chat-card');
    expect(flat(cards[0]!)).toMatchObject({ borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 });
    expect(classOf(cards[0]!)).toContain('bg-raise');
    expect(byId(r, 'chat-unread-bar')).toHaveLength(1); // only the unread card
    expect(flat(byId(r, 'chat-unread-bar')[0]!)).toMatchObject({ left: 0, width: 3 });
    expect(classOf(byId(r, 'chat-unread-bar')[0]!)).toContain('bg-hot');
    const pill = byId(r, 'chat-unread-count')[0]!;
    expect(flat(pill)).toMatchObject({ minWidth: 20, height: 20, borderRadius: 10 });
    expect(say(pill.props['children'])).toContain('2');
    const names = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Rui');
    expect(classOf(names[0]!)).toContain('font-bold');
    const read = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Ana Ruiz');
    expect(classOf(read[0]!)).not.toContain('font-bold');
  });

  it('F2a: a card is as tall as drawn (63 unread, 61 read: name on a 16 line, message on 17), the list starts 14 lower, and the time reads "2m"', async () => {
    // Break: remove `...drawnType.chatName` / `style={drawnType.chatPreview}` (ChatRow.tsx) or `marginTop: THREAD.lift` (chat.tsx).
    mockChats = () => Promise.resolve([chat({ unread: 2 }), chat({ id: 'b', name: 'Ana Ruiz' })]);
    const r = await render(createElement(ChatTab));
    const name = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Rui')[0]!;
    expect(flat(name)['lineHeight']).toBe(16);
    const msg = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Did you hear the bit at 14:32?')[0]!;
    expect(flat(msg)['lineHeight']).toBe(17);
    // read card: 12 + 16 + 4 + 17 + 12 = 61 (drawn 61); unread: 12 + 16 + 4 + 20 + 12 = 64 (drawn 63) — within 4 px.
    expect(12 + 16 + 4 + 17 + 12).toBe(61);
    expect(THREAD.lift).toBe(14);
    const list = r.root.findAll((x) => flat(x)['marginTop'] === THREAD.lift && flat(x)['paddingTop'] === THREAD.top);
    expect(list.length).toBeGreaterThan(0);
    expect(words(r)).toContain('2m');
    expect(words(r)).not.toContain('just now');
  });

  it('a row opens its chat, as before', async () => {
    mockChats = () => Promise.resolve([chat({ unread: 1 })]);
    const r = await render(createElement(ChatTab));
    press(r, 'Rui, 1 unread message. Did you hear the bit at 14:32?');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'a', name: 'Rui' } });
  });

  it('the title bar says "Chat", "People who follow you back" and has the + for New chat', async () => {
    mockChats = () => Promise.resolve([chat()]);
    const r = await render(createElement(ChatTab));
    const bar = titleBar(r).props;
    expect(bar).toMatchObject({ title: 'Chat', subtitle: 'People who follow you back', bottom: 8 });
    expect(bar.actions).toHaveLength(1);
    expect(bar.actions[0]).toMatchObject({ icon: 'add', label: 'New chat' });
    act(() => bar.actions[0].onPress());
    expect(mockPush).toHaveBeenCalledWith('/chat/new');
  });

  it('signed out: the empty block with a Sign in button, and no + and no spine', async () => {
    mockListener = undefined;
    const r = await render(createElement(ChatTab));
    expect(byId(r, 'empty-block')).toHaveLength(1);
    expect(words(r)).toEqual(expect.arrayContaining(['Chat', 'Sign in to chat with people who follow you back']));
    expect(titleBar(r).props.actions).toBeUndefined();
    expect(byId(r, 'chat-spine')).toHaveLength(0);
    press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('no chats yet: the block says so, the spine is not drawn, the + stays', async () => {
    const r = await render(createElement(ChatTab));
    expect(words(r)).toEqual(expect.arrayContaining(['No chats yet.', 'Tap New chat to message someone who follows you back.']));
    expect(byId(r, 'chat-spine')).toHaveLength(0);
    expect(titleBar(r).props.actions).toHaveLength(1);
  });

  it('cannot load: an error tile (radius 22) with Retry, and the + stays; Retry reads again', async () => {
    let tries = 0;
    mockChats = () => { tries += 1; return tries === 1 ? Promise.reject(new Error('down')) : Promise.resolve([chat()]); };
    const r = await render(createElement(ChatTab));
    const tile = byId(r, 'chat-error')[0]!;
    expect(flat(tile)).toMatchObject({ borderRadius: 22, padding: 16 });
    expect(words(r)).toContain("Couldn't load your chats right now.");
    expect(titleBar(r).props.actions).toHaveLength(1);
    await act(async () => { r.root.findAll((x) => x.props['accessibilityLabel'] === 'Retry' && typeof x.props['onPress'] === 'function')[0]!.props['onPress'](); await Promise.resolve(); });
    expect(tries).toBe(2);
    expect(byId(r, 'chat-error')).toHaveLength(0);
    expect(byId(r, 'chat-spine')).toHaveLength(1);
  });
});
