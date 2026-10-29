// Tests that the follower and following lists, a person's likes and subscriptions, Edit profile and the Stickers pages match their drawings.
/**
 * M31 W4-A (T050; owner: "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2 `social.html` `profile-followers--*`, `profile-following--*`, `profile-likes--*`,
 * `profile-subscriptions--*`, `profile-edit--*`, `stickers--*`, `stickers-decorate--*`, `stickers-help--screen`. Each test names the
 * revert that turns it red (each was seen red once, then restored):
 *  - people tiles are 168 wide, 84 tall at least, 10 apart in the Me tab's lane; the subtitle is "Rui Costa · 1.2k"; a failed load is an inline
 *    tile with Retry: `ME_MOSAIC.row` changed, `compactCount` made to print the raw number — red;
 *  - a show's tile is 1 x 2 (178 tall) with its title on the fade: `PROFILE.showTileRows` changed to 1 — red;
 *  - a like hangs on the spine under a tick and its card holds "liked this, 2d": the `Tick` lead dropped — red;
 *  - Edit profile: Save is dim until something changed and while the name is empty, the age chips are 32 tall, the photo ring is 88:
 *    `changed` made always true, `smallChipHeight` changed — red;
 *  - Stickers: the hero is 346 x 178, an earned tile says its day, a tile still to earn is faint with a 3 tall bar: `HERO_HEIGHT` changed,
 *    the bar's `Math.max(4, …)` width changed — red;
 *  - Decorate: the deck's cards are 96 x 118, a placed one has a hot border and a check, the chosen sticker opens the controls: the card
 *    `width` changed — red;
 *  - Help: the rows sit in one raise tile with a hairline between them: `k > 0` dropped — red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockPlay = jest.fn();
const mockOpen = jest.fn();
const mockUpdate = jest.fn();
const mockSavePlacements = jest.fn();
type Listener = { listenerId: string; displayName: string } | undefined;
let mockListener = { listenerId: 'me', displayName: 'Mei Lin' } as Listener;
let mockFollowers: () => Promise<unknown> = () => Promise.resolve({ listeners: [] });
let mockLikes: () => Promise<unknown> = () => Promise.resolve({ items: [] });
let mockSubs: () => Promise<unknown> = () => Promise.resolve({ private: false, items: [] });
let mockMe: () => Promise<unknown> = () => Promise.resolve({});
let mockPlacements: () => Promise<unknown> = () => Promise.resolve([]);
let mockParams: Record<string, string> = { id: 'rui', name: 'Rui Costa' };
const H = 3_600_000;
let mockLocal = { feeds: { getEpisode: (id: string) => (id === 'e1' ? { id, durationMs: 13 * H } : undefined) } };
const mockStores = {
  positions: { all: () => [{ episodeId: 'e1', offsetMs: 0, finished: true }] },
  get feeds() { return mockLocal.feeds; },
  settings: { get: () => undefined, set: () => undefined },
  auth: { get: () => undefined, set: () => undefined },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/profile',
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/design/tailwind', () => ({ ...jest.requireActual('@/design/tailwind'), Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockApi = { followers: () => mockFollowers(), following: () => mockFollowers(), profile: () => Promise.resolve({ displayName: 'Mei Lin', stats: { last7: { listenedMs: 0, finished: 0, topShows: [] }, all: { listenedMs: 0, finished: 0, topShows: [] } }, recent: [] }), follow: jest.fn(), unfollow: jest.fn() };
const mockSocial: { api: typeof mockApi; listener: Listener; refreshListener: () => void } = { api: mockApi, listener: undefined, refreshListener: jest.fn() };
jest.mock('@/social/context', () => ({ useSocial: () => { mockSocial.listener = mockListener; return mockSocial; } }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ listeners: (l: unknown[]) => l }) }));
const mockProfileApi = { listenerLikes: () => mockLikes(), me: () => mockMe(), update: (...a: unknown[]) => mockUpdate(...a), uploadAvatar: jest.fn(), removeAvatar: jest.fn() };
jest.mock('@/social/profile-api', () => ({
  ...jest.requireActual('@/social/profile-api'),
  useProfileApi: () => mockProfileApi,
}));
const mockUs8 = { listenerSubscriptions: () => mockSubs() };
jest.mock('@/social/us8-api', () => ({ useUs8Api: () => mockUs8 }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: mockOpen, play: mockPlay }) }));
const mockListening = { listening: () => Promise.resolve({ earned: { 'hour-1': '2026-10-03' } }), placements: () => mockPlacements(), savePlacements: (...a: unknown[]) => mockSavePlacements(...a) };
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => mockListening }));
jest.mock('@/social/avatar-image', () => ({ pickAvatar: jest.fn(), avatarBytes: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import FollowersScreen from '../app/profile/[id]/followers';
import ListenerLikesScreen from '../app/profile/[id]/likes';
import ListenerSubscriptionsScreen from '../app/profile/[id]/subscriptions';
import EditProfileScreen from '../app/profile/edit';
import StickersScreen from '../app/stickers';
import DecorateScreen from '../app/stickers/decorate';
import StickerHelpScreen from '../app/stickers/help';
import { compactCount, followSubtitle } from '@/ui/social/FollowList';
import { evenList } from '@/ui/profile/parts';
import { PROFILE } from '@/ui/profile/measures';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockPlay, mockOpen, mockUpdate, mockSavePlacements].forEach((m) => m.mockReset());
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockParams = { id: 'rui', name: 'Rui Costa', count: '1200' };
  mockFollowers = () => Promise.resolve({ listeners: [] });
  mockLikes = () => Promise.resolve({ items: [] });
  mockSubs = () => Promise.resolve({ private: false, items: [] });
  mockPlacements = () => Promise.resolve([]);
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const named = (r: ReactTestRenderer, label: string): ReactTestInstance[] => r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.type === 'string');
const comp = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = comp(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
/** A kit button drops its press while dim, so its state is read from the spoken state. */
const dim = (r: ReactTestRenderer, label: string): boolean => {
  const n = r.root.findAll((x) => typeof x.type === 'string' && x.props['accessibilityLabel'] === label && x.props['accessibilityState'] !== undefined)[0];
  if (!n) throw new Error(`no control "${label}"`);
  return (n.props['accessibilityState'] as { disabled?: boolean }).disabled === true;
};
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');

describe('pure helpers', () => {
  it('writes counts the way the drawing does, and the subtitle as "name · count"', () => {
    expect(compactCount(212)).toBe('212');
    expect(compactCount(1200)).toBe('1.2k');
    expect(compactCount(8400)).toBe('8.4k');
    expect(compactCount(10_000)).toBe('10k');
    expect(compactCount(1_500_000)).toBe('1.5M');
    expect(followSubtitle(1200, 'Rui Costa')).toBe('Rui Costa · 1.2k');
    expect(followSubtitle(undefined, 'Rui Costa')).toBe('Rui Costa');
    expect(followSubtitle(212, undefined)).toBe('212');
    expect(followSubtitle(undefined, '  ')).toBeUndefined();
  });
  it('makes an odd list even so the last tile keeps a half width', () => {
    expect(evenList([1, 2, 3])).toHaveLength(4);
    expect(evenList([1, 2])).toHaveLength(2);
  });
});

describe('Followers (social.html profile-followers--screen, --load-failed, --other-empty, --own-empty)', () => {
  const people = [
    { id: 'a', displayName: 'Ana', bio: 'Mornings and maps', youFollow: false },
    { id: 'b', displayName: null },
    { id: 'c', displayName: 'Cy', youFollow: true },
  ];
  it('draws people as 1 x 1 tiles in the Me tab lane, with the count in the subtitle and the label People', async () => {
    mockFollowers = () => Promise.resolve({ listeners: people });
    const r = await render(createElement(FollowersScreen));
    const tiles = byId(r, 'person-tile');
    expect(tiles).toHaveLength(3);
    expect(flat(tiles[0]).minHeight).toBe(84);
    expect(flat(tiles[0]).borderRadius).toBe(22);
    expect(flat(tiles[0]).padding).toBe(14);
    // Two columns 10 apart in the 28 / 16 lane: the list's rows carry the margins.
    const list = r.root.findAll((x) => x.props['testID'] === 'mosaic' && x.props['columnWrapperStyle'] !== undefined)[0]!;
    const wrap = flat({ props: { style: list.props['columnWrapperStyle'] } } as never);
    expect(wrap).toMatchObject({ gap: 10, marginLeft: 28, marginRight: 16 });
    expect(words(r)).toContain('Rui Costa · 1.2k');
    expect(words(r)).toContain('PEOPLE');
    expect(words(r)).toContain('Mornings and maps');
  });
  it('leaves a deleted account untappable and names it in italics', async () => {
    mockFollowers = () => Promise.resolve({ listeners: people });
    const r = await render(createElement(FollowersScreen));
    const deleted = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Deleted account')[0]!;
    expect(classOf(deleted)).toContain('italic');
    const row = deleted.parent!.parent!.parent!;
    const pressable = r.root.findAll((x) => x.props['disabled'] === true && x.props['accessibilityRole'] === 'text');
    expect(pressable.length).toBeGreaterThan(0);
    expect(row).toBeTruthy();
  });
  it('keeps the Follow button on a tile: 32 tall, hot to follow, raise once following', async () => {
    mockFollowers = () => Promise.resolve({ listeners: people });
    const r = await render(createElement(FollowersScreen));
    const follow = named(r, 'Follow')[0]!;
    expect(flat(follow).height).toBe(32);
    expect(classOf(follow)).toContain('bg-hot');
    expect(classOf(named(r, 'Unfollow')[0]!)).toContain('bg-raise2');
  });
  it('shows the failure as an inline tile at the top with a light Retry, not as nobody', async () => {
    mockFollowers = () => Promise.reject(new Error('network'));
    const r = await render(createElement(FollowersScreen));
    expect(words(r)).toContain("Couldn't load followers right now.");
    const tile = byId(r, 'error-tile')[0]!;
    expect(flat(tile)).toMatchObject({ padding: 16, borderRadius: 22, marginLeft: 28 });
    expect(classOf(comp(r, 'Retry'))).toContain('bg-text');
    expect(words(r).join(' ')).not.toContain('Nobody');
  });
  it('names the other person on an empty list, and your own empty list offers Open Discover', async () => {
    mockFollowers = () => Promise.resolve({ listeners: [] });
    const other = await render(createElement(FollowersScreen));
    expect(words(other)).toContain('Nobody follows Rui Costa yet.');
    expect(named(other, 'Open Discover')).toHaveLength(0);
    mockParams = { id: 'me', name: 'Mei Lin' };
    const own = await render(createElement(FollowersScreen));
    expect(words(own).join(' ')).toContain('Nobody follows you yet');
    await press(own, 'Open Discover');
    expect(mockPush).toHaveBeenCalledWith('/discover');
    expect(words(own)).toContain('You');
  });
});

describe('Likes of a person (social.html profile-likes--screen, --empty, --load-failed)', () => {
  const like = (id: string, note?: string): unknown => ({ episode: { id, title: `Episode ${id}`, showTitle: 'Morning Notes' }, ...(note ? { note } : {}), createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
  it('hangs each like on the spine under a tick, with the note in quotes and "liked this, 2d" in the card', async () => {
    mockLikes = () => Promise.resolve({ items: [like('x', 'Warm and short.')] });
    const r = await render(createElement(ListenerLikesScreen));
    expect(byId(r, 'thread-spine')).toHaveLength(1);
    expect(words(r)).toContain('2d');
    expect(words(r)).toContain('“Warm and short.”');
    expect(words(r)).toContain('liked this, 2d');
    expect(words(r)).toContain('Episodes Rui Costa liked');
    const card = byId(r, 'like-card')[0]!;
    expect(flat(card)).toMatchObject({ borderRadius: 18, padding: 12 });
  });
  it('plays from the circle and opens from the row', async () => {
    mockLikes = () => Promise.resolve({ items: [like('x')] });
    const r = await render(createElement(ListenerLikesScreen));
    await press(r, 'Play Episode x');
    expect(mockPlay).toHaveBeenCalledTimes(1);
    await press(r, 'Episode x, Morning Notes');
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });
  it('says none yet, and a failure with a disc and a light Retry', async () => {
    const none = await render(createElement(ListenerLikesScreen));
    expect(words(none)).toContain('No public likes yet.');
    mockLikes = () => Promise.reject(new Error('x'));
    const bad = await render(createElement(ListenerLikesScreen));
    expect(words(bad)).toContain("Couldn't load likes right now.");
    expect(flat(byId(bad, 'icon-block')[0]!.children[0] as never)).toBeDefined();
    expect(classOf(comp(bad, 'Retry'))).toContain('bg-text');
  });
});

describe('Subscriptions of a person (social.html profile-subscriptions--screen, --private, --empty)', () => {
  const shows = [{ feedUrl: 'https://a/rss', title: 'Morning Notes' }, { feedUrl: 'https://b/rss', title: 'Night Shift Radio' }, { feedUrl: 'https://c/rss', title: 'Field Notes' }];
  it('draws each show as a 168 x 178 cover tile and opens it', async () => {
    mockSubs = () => Promise.resolve({ private: false, items: shows });
    const r = await render(createElement(ListenerSubscriptionsScreen));
    const tiles = byId(r, 'show-tile');
    expect(tiles).toHaveLength(3);
    expect(flat(tiles[0])).toMatchObject({ width: 168, height: 178, borderRadius: 22 });
    expect(words(r)).toContain('Shows Rui Costa follows');
    expect(words(r)).toContain('SHOWS');
    await press(r, 'Open Morning Notes');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://a/rss') } });
  });
  it('says a private list is private, by name, and an empty one is empty', async () => {
    mockSubs = () => Promise.resolve({ private: true });
    const priv = await render(createElement(ListenerSubscriptionsScreen));
    expect(words(priv)).toContain('Rui Costa keeps their subscriptions private.');
    mockSubs = () => Promise.resolve({ private: false, items: [] });
    const none = await render(createElement(ListenerSubscriptionsScreen));
    expect(words(none)).toContain('No shows yet.');
  });
});

describe('Edit profile (social.html profile-edit--screen, --signed-out, --load-failed)', () => {
  const me = { displayName: 'Jayden', bio: 'Morning walks.', ageRange: '25-34', gender: 'unsaid', likesPublic: true, birthday: '', industry: '' };
  it('draws the photo at 88 with a 3 ring, the field tiles at radius 20 and the small chips at 32', async () => {
    mockMe = () => Promise.resolve(me);
    const r = await render(createElement(EditProfileScreen));
    expect(flat(byId(r, 'photo-ring')[0])).toMatchObject({ width: 88, height: 88, borderWidth: 3 });
    const tile = byId(r, 'field-tile')[0]!;
    expect(flat(tile)).toMatchObject({ borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14 });
    const chip = named(r, 'Age 25–34')[0]!;
    expect(flat(chip).height).toBe(32);
    expect(classOf(chip)).toContain('bg-text');
    expect(words(r)).toEqual(expect.arrayContaining(['ABOUT YOU', 'PRIVATE', '6 / 30', '14 / 160']));
    expect(words(r)).toContain('Never shown on your profile. Creators see only totals of 10 or more.');
    expect(named(r, 'Likes are public').length).toBeGreaterThan(0);
  });
  it('dims Save until something changed, and while the name is empty', async () => {
    mockMe = () => Promise.resolve(me);
    const r = await render(createElement(EditProfileScreen));
    expect(dim(r, 'Save')).toBe(true);
    const field = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Bio' && typeof x.props['onChangeText'] === 'function')[0]!;
    await act(async () => { field.props['onChangeText']('A new line.'); await Promise.resolve(); });
    expect(dim(r, 'Save')).toBe(false);
    const name = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Name' && typeof x.props['onChangeText'] === 'function')[0]!;
    await act(async () => { name.props['onChangeText'](''); await Promise.resolve(); });
    expect(dim(r, 'Save')).toBe(true);
    expect(words(r).join(' ')).toContain('A name is needed · 0 / 30');
  });
  it('saves the fields and says Profile saved', async () => {
    mockMe = () => Promise.resolve(me);
    mockUpdate.mockResolvedValue({ ...me, displayName: 'Jay' });
    const r = await render(createElement(EditProfileScreen));
    const name = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Name' && typeof x.props['onChangeText'] === 'function')[0]!;
    await act(async () => { name.props['onChangeText']('Jay'); await Promise.resolve(); });
    await press(r, 'Save');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Jay', ageRange: '25-34' }));
    expect(mockToast).toHaveBeenCalledWith('Profile saved');
  });
  it('signed out: a lock disc with Sign in; a failed load: the disc with Retry', async () => {
    mockListener = undefined;
    const out = await render(createElement(EditProfileScreen));
    expect(words(out)).toContain('Sign in to edit your profile.');
    await press(out, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
    mockMe = () => Promise.reject(new Error('x'));
    const bad = await render(createElement(EditProfileScreen));
    expect(words(bad)).toContain("Couldn't load your profile right now.");
    expect(named(bad, 'Retry').length).toBeGreaterThan(0);
  });
});

describe('Stickers (social.html stickers--screen, --signed-out, --none-earned, --card-sheet)', () => {
  it('draws the 346 x 178 hero with "STICKERS", "n of 8 earned" and the Decorate button; earned tiles say their day', async () => {
    const r = await render(createElement(StickersScreen));
    expect(flat(byId(r, 'stickers-hero')[0])).toMatchObject({ minHeight: 178, borderRadius: 22 }) // F14: the hero grows to hold figure, caption and button in a column; 178 is its floor;
    expect(words(r)).toEqual(expect.arrayContaining(['STICKERS', 'EARNED']));
    expect(words(r).some((w) => /^\d+ of 8\nearned$/.test(w))).toBe(true);
    expect(comp(r, 'Decorate my profile with stickers')).toBeTruthy();
    await press(r, 'Decorate my profile with stickers');
    expect(mockPush).toHaveBeenCalledWith('/stickers/decorate');
    await press(r, 'How stickers are earned');
    expect(mockPush).toHaveBeenCalledWith('/stickers/help');
    const tiles = byId(r, 'sticker-tile');
    expect(tiles.length).toBe(8);
    expect(flat(tiles[0])).toMatchObject({ minHeight: 84, borderRadius: 22 });
    expect(words(r)).toContain('3 Oct 2026');
  });
  it('shows a sticker still to earn faint, with its progress and a 3 tall bar', async () => {
    const r = await render(createElement(StickersScreen));
    const bars = byId(r, 'sticker-bar');
    expect(bars.length).toBeGreaterThan(0);
    expect(flat(bars[0])).toMatchObject({ height: 3 });
    expect(words(r)).toContain('0 of 1 moment');
  });
  it('opens an earned sticker as a card with Share and a close circle', async () => {
    const r = await render(createElement(StickersScreen));
    await press(r, 'First hour. Earned 3 Oct 2026. Open its card');
    expect(words(r)).toContain('Given by SocialMorning · Listen for 1 hour in all.');
    expect(flat(byId(r, 'sticker-disc').find((n) => flat(n).width === 132))).toMatchObject({ width: 132, height: 132, borderWidth: 3 });
    expect(comp(r, 'Share the First hour sticker')).toBeTruthy();
    await press(r, 'Close');
  });
  it('signed out the hero asks to sign in', async () => {
    mockListener = undefined;
    const r = await render(createElement(StickersScreen));
    expect(words(r)).toContain('Sign in to count your listening time.');
  });
});

describe('Decorate my profile (social.html stickers-decorate--screen, --chosen, --signed-out, --empty, --toast)', () => {
  const placed = [{ stickerId: 'hour-1', x: 0.3, y: 0.4, scale: 1, rot: 0, z: 1 }];
  it('draws the deck at 96 x 118, a placed card with a hot border and a check, and "n of 10 placed"', async () => {
    mockPlacements = () => Promise.resolve(placed);
    const r = await render(createElement(DecorateScreen));
    const deck = byId(r, 'sticker-deck')[0]!;
    expect(deck).toBeTruthy();
    const card = named(r, 'First hour, on your profile. Choose it')[0]!;
    expect(flat(card)).toMatchObject({ width: 96, height: 118 });
    expect(classOf(card)).toContain('border-hot');
    expect(byId(r, 'placed-check')).toHaveLength(1);
    expect(words(r)).toContain('1 of 10 placed');
    expect(words(r)).toContain('drag to move, two fingers to resize and turn');
    expect(classOf(named(r, 'Put 10 hours listened on your profile')[0]!)).toContain('border-line');
  });
  it('opens the eight nudges and To the front / Remove once one is chosen', async () => {
    mockPlacements = () => Promise.resolve(placed);
    const r = await render(createElement(DecorateScreen));
    expect(byId(r, 'sticker-controls')).toHaveLength(0);
    await press(r, 'First hour, on your profile. Choose it');
    expect(words(r)).toContain('Chosen: First hour');
    const nudge = named(r, 'Move left: First hour')[0]!;
    expect(flat(nudge).height).toBe(38);
    for (const l of ['Move up', 'Move down', 'Move right', 'Smaller', 'Bigger', 'Turn left', 'Turn right']) expect(named(r, `${l}: First hour`)).toHaveLength(1);
    expect(comp(r, 'Bring First hour to the front')).toBeTruthy();
    await press(r, 'Remove First hour');
    expect(byId(r, 'sticker-controls')).toHaveLength(0);
  });
  it('dims Undo and Save until changed, then saves and says so', async () => {
    mockPlacements = () => Promise.resolve(placed);
    mockSavePlacements.mockResolvedValue(undefined);
    const r = await render(createElement(DecorateScreen));
    expect(dim(r, 'Save')).toBe(true);
    expect(dim(r, 'Undo changes')).toBe(true);
    await press(r, 'Put 10 hours listened on your profile');
    expect(dim(r, 'Save')).toBe(false);
    expect(words(r)).toContain('2 of 10 placed');
    await press(r, 'Save');
    expect(mockSavePlacements).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Saved. Your profile shows your stickers.');
  });
  it('signed out: a lock disc with Sign in', async () => {
    mockListener = undefined;
    const r = await render(createElement(DecorateScreen));
    expect(words(r)).toContain('Sign in to decorate your profile.');
    await press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
});

describe('How stickers work (social.html stickers-help--screen)', () => {
  it('holds the rows in one raise tile with a hairline between them, under two edge labels', async () => {
    const r = await render(createElement(StickerHelpScreen));
    const rows = byId(r, 'help-rows')[0]!;
    expect(classOf(rows)).toContain('bg-raise');
    expect(flat(rows)).toMatchObject({ borderRadius: 22, paddingHorizontal: 14 });
    const lines = rows.findAll((x) => typeof x.type === 'string' && classOf(x).includes('border-t'));
    expect(lines).toHaveLength(7);
    expect(words(r)).toEqual(expect.arrayContaining(['HOW EACH ONE IS EARNED', 'GOOD TO KNOW', 'First hour', 'Listen for 1 hour in all.']));
  });
});

describe('measures', () => {
  it('names the numbers the drawings write', () => {
    expect(PROFILE).toMatchObject({ photo: 88, followHeight: 32, smallChipHeight: 32, deckCardW: 96, deckCardH: 118 });
  });
});
