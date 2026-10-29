// Tests that the Like page is the drawn Stage + Thread: the cover stage, the words on it, the strip, the chips, the comments, the foot.
/**
 * F3 defect 5 (design-pulse2 `listen.html` `like--screen`, `like--gone`; the wave-3 capture found the old layout: a back arrow,
 * "Aisha liked", old comment rows). What it proves in Jest (how it looks on a phone is NOT VERIFIED): the numbers off the render on the
 * drawn 390 x 844 phone (stage 330 under a 340 veil, the words 150 from the top, the avatar 36, the strip radius 16 with a 40 cover and
 * a 32 play, chips 34 tall, the composer 56 radius 22 with a 36 hot Send), the order of the parts, the comment cards, and every action
 * keeping its name and doing what it did: open the profile, Report, the reaction (and taking it back), Delete (yours / on your like),
 * Report a comment's author, write and Send, Retry. Reds (each tried once): `LIKE.stageHeight` changed; `LIKE.top` changed; the chip
 * height changed; `bare` removed from the PushedPage (the old title bar returns); the Send circle's `LIKE.send` changed.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockOpen = jest.fn();
const mockPlay = jest.fn();
const mockReact = jest.fn(() => Promise.resolve());
const mockClear = jest.fn(() => Promise.resolve());
const mockComment = jest.fn(() => Promise.resolve({}));
const mockDelete = jest.fn(() => Promise.resolve());
let mockListener: { listenerId: string } | undefined = { listenerId: 'me' };
let mockPost: () => Promise<unknown>;
const person = { id: 'u-aisha', displayName: 'Aisha' };
const post = (over: Record<string, unknown> = {}) => ({
  like: { listener: person, note: 'The rain at the end.', createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), episode: { id: 'e2', title: 'The long walk home', showTitle: 'Field Recordings', feedUrl: 'f', imageUrl: 'https://i/e.png' } },
  comments: [
    { id: 'c1', body: 'Adding this to my walk list.', createdAt: new Date(Date.now() - 3_600_000).toISOString(), author: { id: 'u-rui', displayName: 'Rui' }, mine: false },
    { id: 'c2', body: 'Same rain as last week?', createdAt: new Date(Date.now() - 1_200_000).toISOString(), author: { id: 'me', displayName: 'Me' }, mine: true },
  ],
  reactions: { counts: [{ emoji: '👍', n: 4 }, { emoji: '❤️', n: 2 }], mine: '👍' },
  ...over,
});
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/like/u-aisha/e2',
  useLocalSearchParams: () => ({ owner: 'u-aisha', episode: 'e2' }),
  Link: ({ children }: { children: unknown }) => children,
  useFocusEffect: () => undefined,
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => mockToast, useDownloads: () => ({}) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: mockListener }) }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: mockOpen, play: mockPlay }) }));
// One object for every render (the real hook memoises): a new one would re-run the page's load for ever.
const mockApi = { likePost: () => mockPost(), reactToLike: mockReact, clearLikeReaction: mockClear, commentOnLike: mockComment, deleteLikeComment: mockDelete };
jest.mock('@/discover/explore-api', () => ({ LIKE_COMMENT_MAX: 280, useExploreApi: () => mockApi }));
jest.mock('@/ui/comments/ReportSheet', () => {
  const { createElement: h } = jest.requireActual('react');
  return { ReportSheet: (p: { target?: { kind: string; id: string } }) => (p.target ? h('ReportOpen', { accessibilityLabel: `report-open:${p.target.id}` }) : null) };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import LikePostScreen from '../app/like/[owner]/[episode]';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockOpen, mockPlay, mockReact, mockClear, mockComment, mockDelete].forEach((m) => m.mockClear());
  mockListener = { listenerId: 'me' };
  mockPost = () => Promise.resolve(post());
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, createElement(LikePostScreen))); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const n = hosts(r, (x) => x.props['testID'] === id)[0];
  if (!n) throw new Error(`no testID "${id}"`);
  return n;
};
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const comp = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}" in: ${r.root.findAll((x) => typeof x.props['accessibilityLabel'] === 'string').map((x) => x.props['accessibilityLabel']).join(' | ')}`);
  return n;
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = comp(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
const styled = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const all = r.root.findAll((x) => x.props['accessibilityLabel'] === label && x.props['style'] !== undefined);
  return all[all.length - 1]!;
};

describe('the page on the drawn phone', () => {
  it('is the cover stage: 330 under a 340 veil, the words start 150 from the top (the old header and card are gone)', async () => {
    const r = await render();
    expect(flat(byId(r, 'like-cover'))['height']).toBe(330);
    expect(flat(byId(r, 'like-veil'))['height']).toBe(340);
    expect(flat(byId(r, 'like-stage'))['paddingTop']).toBe(150);
    expect(words(r)).toEqual(expect.arrayContaining(['Aisha', 'liked 2h ago', '“The rain at the end.”', 'The long walk home', 'Comments']));
    expect(words(r)).not.toContain('Aisha liked');
    // the old title bar (a header named "Aisha liked") is not drawn: the page's foot is the comments zone
    expect(hosts(r, (n) => n.props['accessibilityRole'] === 'header' && (n.props['accessibilityLabel'] === 'Aisha liked' || n.props['accessibilityLabel'] === 'Like'))).toHaveLength(0);
    expect(byId(r, 'comments-zone')).toBeTruthy();
  });

  it('a taller status bar moves the words down with it', async () => {
    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 59, bottom: 34, left: 0, right: 0 } }, createElement(LikePostScreen))); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    mounted.push(r);
    expect(flat(byId(r, 'like-stage'))['paddingTop']).toBe(159);
    expect(flat(byId(r, 'like-cover'))['height']).toBe(339);
  });

  it('the person: a 36 avatar and name that open the profile, a flag that reports them (not on your own like)', async () => {
    const r = await render();
    await press(r, 'Aisha, liked 2 h ago');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/profile/[id]', params: { id: 'u-aisha' } });
    const av = hosts(r, (n) => flat(n)['width'] === 36 && flat(n)['height'] === 36 && flat(n)['borderRadius'] !== undefined);
    expect(av.length).toBeGreaterThan(0);
    await press(r, 'Report Aisha');
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'report-open:u-aisha')).toHaveLength(1);
    mockListener = { listenerId: 'u-aisha' };
    const own = await render();
    expect(own.root.findAll((x) => x.props['accessibilityLabel'] === 'Report Aisha')).toHaveLength(0);
  });

  it('the strip: raise at 80 %, radius 16, padding 8, a 40 cover and a 32 play; the strip opens the episode, the dot plays it', async () => {
    const r = await render();
    const strip = flat(byId(r, 'like-strip'));
    expect(strip).toMatchObject({ borderRadius: 16, padding: 8 });
    expect(strip['backgroundColor']).toBe('rgba(17,17,22,0.80)');
    expect(hosts(r, (n) => flat(n)['width'] === 40 && flat(n)['height'] === 40 && flat(n)['borderRadius'] === 10).length).toBeGreaterThan(0);
    expect(hosts(r, (n) => n.props['testID'] === 'play-dot' && flat(n)['width'] === 32).length).toBe(1);
    await press(r, 'Open The long walk home');
    expect(mockOpen).toHaveBeenCalledTimes(1);
    await press(r, 'Play The long walk home');
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('the chips: five, 34 tall, yours is light with "Take back"; a tap reacts, a tap on yours takes it back', async () => {
    const r = await render();
    const mine = styled(r, 'Take back 👍, 4');
    expect(flat(mine)['height']).toBe(34);
    expect(String(mine.props['className'])).toContain('bg-text');
    expect(String(styled(r, 'React with ❤️, 2').props['className'])).toContain('bg-raise');
    for (const l of ['React with 😂', 'React with 🔥', 'React with 👏']) expect(comp(r, l)).toBeDefined();
    await press(r, 'React with 🔥');
    expect(mockReact).toHaveBeenCalledWith('u-aisha', 'e2', '🔥');
    await press(r, 'Take back 👍, 4');
    expect(mockClear).toHaveBeenCalledWith('u-aisha', 'e2');
  });

  it('the comments: raise cards on a spine, Report on another\'s, Delete on yours (and any on your own like)', async () => {
    const r = await render();
    expect(byId(r, 'spine-line')).toBeTruthy();
    const cards = hosts(r, (n) => n.props['testID'] === 'like-comment');
    expect(cards).toHaveLength(2);
    expect(flat(cards[0])).toMatchObject({ borderRadius: 18, padding: 12 });
    expect(words(r)).toEqual(expect.arrayContaining(['Adding this to my walk list.', 'Same rain as last week?', 'Rui', '1h']));
    expect(comp(r, 'Report Rui')).toBeDefined();
    await press(r, 'Delete the comment by Me');
    expect(mockDelete).toHaveBeenCalledWith('u-aisha', 'e2', 'c2');
    await press(r, 'Report Rui');
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'report-open:u-rui')).toHaveLength(1);
    mockListener = { listenerId: 'u-aisha' };
    const own = await render();
    expect(comp(own, 'Delete the comment by Rui')).toBeDefined();
  });

  it('no comments says so', async () => {
    mockPost = () => Promise.resolve(post({ comments: [] }));
    const r = await render();
    expect(words(r)).toContain('No comments yet. Say something kind.');
  });

  it('the foot: the count beside "Comments", a 56 composer (radius 22) with a 36 hot Send that is dim until words are typed', async () => {
    const r = await render();
    expect(words(r)).toEqual(expect.arrayContaining(['Comments', '2']));
    expect(flat(byId(r, 'like-composer'))).toMatchObject({ height: 56, borderRadius: 22 });
    const send = styled(r, 'Send');
    expect(flat(send)).toMatchObject({ width: 36, height: 36 });
    expect(String(send.props['className'])).toContain('bg-hot');
    expect(send.props['accessibilityState']).toMatchObject({ disabled: true });
    const field = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Write a comment on this like' && typeof x.props['onChangeText'] === 'function')[0]!;
    expect(field.props['maxLength']).toBe(280);
    await act(async () => { field.props['onChangeText']('Lovely'); await Promise.resolve(); });
    expect(styled(r, 'Send').props['accessibilityState']).toMatchObject({ disabled: false });
    await press(r, 'Send');
    expect(mockComment).toHaveBeenCalledWith('u-aisha', 'e2', 'Lovely');
  });

  it('signed out: the field reads "Sign in to comment" and Send / a reaction go to sign-in', async () => {
    mockListener = undefined;
    const r = await render();
    const field = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Write a comment on this like' && typeof x.props['onChangeText'] === 'function')[0]!;
    expect(field.props['placeholder']).toBe('Sign in to comment');
    await press(r, 'React with 🔥');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    expect(mockReact).not.toHaveBeenCalled();
  });
});

describe('the states', () => {
  it('not found: the grey page and today\'s words', async () => {
    mockPost = () => Promise.reject({ status: 404 });
    const r = await render();
    expect(words(r)).toEqual(expect.arrayContaining(['Not here', 'This like is not here any more, or is private']));
  });

  it('a failed read has Retry, which loads again', async () => {
    let n = 0;
    mockPost = () => (n++ === 0 ? Promise.reject({ status: 500 }) : Promise.resolve(post()));
    const r = await render();
    expect(words(r)).toEqual(expect.arrayContaining(["Couldn't load", "Couldn't load this right now."]));
    await press(r, 'Retry');
    expect(words(r)).toContain('Aisha');
  });
});
