// Tests that the status pages (the Stage, the text status, the composer's items) match their drawings in the numbers the owner compared.
/**
 * M31 W4-B (T051; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/social.html `statusBase`, `textBase`, `itemsRow`, `addEpSheet`, `signIn` and the `status-*` entries. Each test names the
 * revert that turns it red (each was seen red once, then restored):
 *  - segments 4 under the status bar, 3 tall, 4 apart; the played ones light, the later ones `barIdle`: `STAGE.seg*` — red;
 *  - the head row: avatar 36, name, "18 h left", the hot "Suggested" tag 24 tall, More in a glass circle: `STAGE.head*` / `tag*` — red;
 *  - a voice status is a 56 light circle beside a 56 tall wave, the clock and "voice status", its words: the voice branch — red;
 *  - six reaction chips 36 tall, yours light; the bar 6 over the foot: Close then the 52 reply box (radius 22) with a mic, a hot Send once there is text: `StatusReplies` — red;
 *  - the owner sees replies (hold to delete) and no reply box: `s.mine` — red;
 *  - signed out and gone: a lock, the sentence and a light Sign in (opens sign-in): `SignInBlock` — red;
 *  - the text status: a 230 card (radius 26) with the words in Unbounded 24 and the count; Post hot, dimmed until there are words: `TEXT_PAGE` — red;
 *  - the items row: two chips with a glyph and "0 / 10 · Up to 10 items"; an added item is a raise row with Remove; "Add an episode" is a deck of 150 cards: `ITEMS` — red;
 *  - the toasts sit 104 (viewer) and 124 (text status) up on a 34 pt strip: `toastOverStatus` — red.
 * NOT VERIFIED: playback, the keyboard lift, the swipe, anything on a phone.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { colour, toastBottom } from '@/design';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockPostText = jest.fn(() => Promise.resolve());
let mockListener: unknown = { id: 'me' };
let mockStatuses: unknown[] = [];
let mockReplies: unknown[] = [];
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 's1' }),
  usePathname: () => '/status/s1',
}));
const mockVoice = { recorder: { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }, state: { durationMillis: 0 } };
jest.mock('@/playback/expo-audio-adapter', () => ({
  askMicrophone: () => Promise.resolve(true),
  playVoice: () => ({ stop: jest.fn() }),
  useVoiceRecorder: () => mockVoice,
  voiceSessionOn: () => Promise.resolve(),
  voiceSessionOff: () => Promise.resolve(),
}));
const mockStores = { settings: { get: () => undefined }, queue: { list: () => [] }, feeds: { getEpisode: () => undefined, getShow: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockPlayer = { pause: jest.fn(), load: jest.fn() };
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayer: () => mockPlayer }));
// Stable objects: the real hooks are memoised, and a fresh one each render would re-run their effects for ever.
const mockApi = { registerEpisode: () => Promise.resolve(), search: () => Promise.resolve({ episodes: [] }) };
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: mockListener, api: mockApi }) }));
const mockM22 = {
  statuses: () => Promise.resolve(mockStatuses),
  status: () => Promise.reject(new Error('gone')),
  replies: () => Promise.resolve(mockReplies),
  react: () => Promise.resolve(),
  unreact: () => Promise.resolve(),
  stopSuggesting: () => Promise.resolve(),
  postTextStatus: () => Promise.resolve(),
};
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => mockM22 }));
jest.mock('@/social/us8-api', () => ({ ...jest.requireActual('@/social/us8-api'), useUs8Api: () => ({ postTextStatus: (...a: unknown[]) => (mockPostText as (...x: unknown[]) => Promise<void>)(...a) }) }));
const mockSafety = { safety: { isHidden: () => false } };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('@/social/comment-image', () => ({ pickCommentImage: () => Promise.resolve({ kind: 'cancelled' }) }));
jest.mock('@/me/history', () => ({ listeningHistory: () => [] }));
jest.mock('@/telemetry/reportError', () => ({ reportAndDrop: () => () => undefined }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import StatusScreen from '../app/status/[id]';
import TextStatusScreen from '../app/status/text';
import { StatusComposerItems, type ComposerItem } from '@/ui/social/StatusComposerItems';
import { STAGE, TEXT_PAGE, ITEMS, SIGN_IN, playedShare, waveFor } from '@/ui/status/measures';
import { barLift } from '@/ui/status/useKeyboardHeight';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockBack, mockPush, mockToast, mockPostText]) f.mockClear();
  mockListener = { id: 'me' };
  mockStatuses = [];
  mockReplies = [];
});
const INSETS = { top: 50, bottom: 34, left: 0, right: 0 };
const mount = async (el: React.ReactElement): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, el)); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const host = (r: ReactTestRenderer, testID: string) => r.root.findAll((n) => n.props['testID'] === testID && typeof n.type === 'string');
/** A pressable is several wrappers deep, each passing the same props down: count it once (the outermost). */
const once = (all: ReactTestInstance[]) => all.filter((n) => !all.includes(n.parent as ReactTestInstance));
const byLabel = (r: ReactTestRenderer, label: string) => once(r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function'));
const mic = (r: ReactTestRenderer) => once(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Hold to record a voice reply' && typeof n.props['onPressIn'] === 'function'));
const hostAbove = (n: ReactTestInstance): ReactTestInstance => { let p = n.parent; while (p && typeof p.type !== 'string') p = p.parent; return p!; };
const press = async (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };
const hostOf = (n: ReactTestInstance) => n.findAll((x) => typeof x.type === 'string')[0]!;
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const classes = (n: ReactTestInstance) => [n, ...n.findAll((x) => typeof x.props['className'] === 'string')].map((x) => String(x.props['className'] ?? '')).join(' ');

const voice = (o: Record<string, unknown> = {}) => ({
  id: 's1', mine: false, author: { id: 'u2', name: 'Ana', initials: 'A' }, durationMs: 41_000, url: 'https://x/a.m4a', text: 'Three episodes in', createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 18 * 3_600_000 - 1000).toISOString(),
  items: [{ kind: 'episode', episodeId: 'e1', title: 'Why mornings matter', showTitle: 'Morning Notes', enclosureUrl: 'https://x/e.mp3' }, { kind: 'photo', url: 'https://x/p.jpg' }],
  reactions: [{ kind: 1, count: 12 }, { kind: 6, count: 8 }], myReaction: 1, suggested: true, ...o,
});

describe('the Stage (status--screen)', () => {
  it('segments 4 under the status bar, 3 tall, 4 apart: the earlier ones light, the later ones barIdle, the current one filling', async () => {
    mockStatuses = [voice({ id: 'a' }), voice({ id: 's1' }), voice({ id: 'c' })];
    const r = await mount(createElement(StatusScreen));
    const segs = host(r, 'status-segment');
    expect(segs).toHaveLength(3);
    expect(flat(segs[0]!)['height']).toBe(3);
    expect(flat(segs[0]!)['backgroundColor']).toBe(colour.text);
    expect(flat(segs[2]!)['backgroundColor']).toBe(colour.barIdle);
    expect(host(r, 'status-segment-fill')).toHaveLength(1);
    const row = hostAbove(segs[0]!);
    expect(flat(row)['top']).toBe(INSETS.top + STAGE.segTop);
    expect(flat(row)['gap']).toBe(4);
    expect(flat(row)['left']).toBe(14);
  });
  it('the head row: "Ana", "18 h left", the hot Suggested tag (24 tall), More in a glass circle', async () => {
    mockStatuses = [voice()];
    const r = await mount(createElement(StatusScreen));
    const t = texts(r);
    expect(t).toContain('Ana');
    expect(t).toContain('18 h left');
    const tag = host(r, 'status-suggested')[0]!;
    expect(flat(tag)['height']).toBe(24);
    expect(classes(tag)).toContain('bg-hotSoft');
    expect(classes(byLabel(r, "More for Ana's status")[0]!)).toContain('bg-glass');
  });
  it('a voice status: a 56 light circle, the wave, the clock "0:00 / 0:41", "voice status", its words and an episode card with a 40 Play', async () => {
    mockStatuses = [voice()];
    const r = await mount(createElement(StatusScreen));
    const play = byLabel(r, 'Stop')[0] ?? byLabel(r, 'Play again')[0]!;
    const circle = play.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 56)[0]!;
    expect(flat(circle)['height']).toBe(56);
    expect(classes(circle)).toContain('bg-text');
    expect(r.root.findAll((n) => n.props['testID'] === 'curve-bar' && typeof n.type === 'string')).toHaveLength(46);
    const t = texts(r);
    for (const s of ['0:00 / 0:41', 'voice status', '“Three episodes in”', 'Why mornings matter', 'Morning Notes']) expect(t).toContain(s);
    const card = host(r, 'status-episode-card')[0]!;
    expect(flat(card)['borderRadius']).toBe(18);
    expect(flat(byLabel(r, 'Play Why mornings matter')[0]!)['width']).toBe(40);
  });
  it('Previous and Next are the left and right thirds; Next past the last status closes', async () => {
    mockStatuses = [voice({ id: 's1' })];
    const r = await mount(createElement(StatusScreen));
    await press(r, 'Next status');
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockBack.mockClear();
    await press(r, 'Previous status');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('the foot: six reaction chips 36 tall (yours light, with counts), the private-replies line, the bar 6 up with Close and a 52 reply box', async () => {
    mockStatuses = [voice()];
    const r = await mount(createElement(StatusScreen));
    const chips = once(r.root.findAll((n) => n.props['accessibilityRole'] === 'radio' && typeof n.props['onPress'] === 'function'));
    expect(chips).toHaveLength(6);
    expect(flat(hostOf(chips[0]!))['height']).toBe(36);
    expect(classes(chips[0]!)).toContain('bg-text');
    expect(classes(chips[1]!)).toContain('bg-glass');
    expect(texts(r)).toContain('12');
    expect(texts(r)).toContain('Replies are private: only the poster sees them.');
    const bar = host(r, 'status-bar')[0]!;
    expect(flat(bar)['bottom']).toBe(6);
    expect(flat(bar)['left']).toBe(12);
    const box = host(r, 'status-reply-box')[0]!;
    expect(flat(box)['height']).toBe(52);
    expect(flat(box)['borderRadius']).toBe(22);
    expect(byLabel(r, 'Close')).toHaveLength(1);
    expect(flat(byLabel(r, 'Close')[0]!)['width']).toBe(44);
    expect(mic(r)).toHaveLength(1);
    expect(flat(mic(r)[0]!)['width']).toBe(44);
    expect(flat(host(r, 'status-foot')[0]!)['bottom']).toBe(6 + 76);
  });
  it('typing turns the box border hot and swaps the mic for a hot Send (40 tall)', async () => {
    mockStatuses = [voice()];
    const r = await mount(createElement(StatusScreen));
    const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Reply to this status' && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { field.props['onFocus'](); field.props['onChangeText']('Nice one'); });
    const box = host(r, 'status-reply-box')[0]!;
    expect(String(box.props['className'])).toContain('border-hot');
    const send = byLabel(r, 'Send reply')[0]!;
    expect(classes(send)).toContain('bg-hot');
    expect(flat(send)['height']).toBe(40);
    expect(mic(r)).toHaveLength(0);
    expect(texts(r)).toContain('8 / 140');
  });
  it('your own status: no reply box and no More; the replies list "hold to delete" (status--screen, mine)', async () => {
    mockStatuses = [voice({ mine: true, suggested: false })];
    mockReplies = [{ id: 'r1', mine: false, author: { id: 'u3', name: 'Bea', initials: 'B' }, body: 'Same here, on the train.', createdAt: '' }];
    const r = await mount(createElement(StatusScreen));
    expect(host(r, 'status-reply-box')).toHaveLength(0);
    expect(byLabel(r, "More for You's status")).toHaveLength(0);
    expect(texts(r)).toContain('Same here, on the train.');
    expect(texts(r)).toContain('hold to delete');
    expect(byLabel(r, 'Close')).toHaveLength(1);
  });
  it('a text status is its words alone at the same size', async () => {
    mockStatuses = [voice({ body: 'Listening to something good', url: undefined, text: undefined, items: [] })];
    const r = await mount(createElement(StatusScreen));
    expect(texts(r)).toContain('Listening to something good');
    expect(texts(r)).not.toContain('voice status');
    expect(host(r, 'status-segment-fill')).toHaveLength(1);
  });
});

describe('signed out and gone (status--signed-out, status--gone)', () => {
  it('signed out: a 64 lock circle, "Sign in to see statuses.", a light Sign in that opens sign-in; × Close in the bottom zone', async () => {
    mockListener = undefined;
    const r = await mount(createElement(StatusScreen));
    expect(texts(r)).toContain('Sign in to see statuses.');
    const block = host(r, 'status-sign-in')[0]!;
    const circle = block.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 64)[0]!;
    expect(flat(circle)['height']).toBe(SIGN_IN.circle);
    const signIn = byLabel(r, 'Sign in')[0]!;
    expect(classes(signIn)).toContain('bg-text');
    await act(async () => { signIn.props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    await press(r, 'Close');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('gone: the empty block with the 24-hour sentence', async () => {
    mockStatuses = [];
    const r = await mount(createElement(StatusScreen));
    expect(texts(r)).toContain('This status is gone. Statuses are deleted 24 hours after they are posted.');
    expect(host(r, 'page-empty')).toHaveLength(1);
  });
});

describe('the text status page (status-text--screen)', () => {
  it('a 230 card (radius 26) with the placeholder and "0 / 140"; Post (hot) is dimmed while empty; the title bar says its line', async () => {
    const r = await mount(createElement(TextStatusScreen));
    const card = host(r, 'status-text-card')[0]!;
    expect(flat(card)['minHeight']).toBe(230);
    expect(flat(card)['borderRadius']).toBe(26);
    expect(flat(card)['padding']).toBe(18);
    const t = texts(r);
    for (const s of ['0 / 140', 'Text status', 'Your followers see it on Updates for 24 hours.', 'What are you listening to?']) expect(t).toContain(s);
    const post = byLabel(r, 'Post')[0];
    expect(post).toBeUndefined(); // dimmed: no press handler while empty
    expect(classes(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Post')[0]!)).toContain('bg-hot');
  });
  it('typing 27 characters shows "27 / 140"; Post posts and the toast says it is gone after 24 hours', async () => {
    const r = await mount(createElement(TextStatusScreen));
    const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Text status' && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { field.props['onChangeText']('Listening to something good'); });
    expect(texts(r)).toContain('27 / 140');
    await press(r, 'Post');
    expect(mockPostText).toHaveBeenCalledWith('Listening to something good');
    expect(mockToast).toHaveBeenCalledWith('Posted. It is gone after 24 hours.');
    expect(mockBack).toHaveBeenCalled();
  });
  it('past 140 the count turns hot and Post stays dimmed', async () => {
    const r = await mount(createElement(TextStatusScreen));
    const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Text status' && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { field.props['onChangeText']('x'.repeat(145)); });
    expect(texts(r)).toContain('5 over · 145 / 140');
    expect(byLabel(r, 'Post')).toHaveLength(0);
  });
  it('signed out: the lock, "Sign in to post a status." and a light Sign in; no card', async () => {
    mockListener = undefined;
    const r = await mount(createElement(TextStatusScreen));
    expect(texts(r)).toContain('Sign in to post a status.');
    expect(host(r, 'status-text-card')).toHaveLength(0);
    expect(byLabel(r, 'Sign in')).toHaveLength(1);
  });
});

describe('the composer items (itemsRow, addEpSheet)', () => {
  const episode = (n: number): ComposerItem => ({ kind: 'episode', card: { id: `e${n}`, feedUrl: 'f', guid: `g${n}`, title: `Why mornings matter ${n}`, showTitle: 'Morning Notes', enclosureUrl: 'u' } });
  it('two chips, "0 / 10 · Up to 10 items"; an added episode is a raise row (cover 48, title, show, Remove)', async () => {
    let items: ComposerItem[] = [];
    const r = await mount(createElement(StatusComposerItems, { items, onChange: (n: ComposerItem[]) => { items = n; }, colours: { accent: '', muted: '', text: '' } }));
    expect(byLabel(r, 'Add episode')).toHaveLength(1);
    expect(byLabel(r, 'Add photo')).toHaveLength(1);
    expect(texts(r)).toContain('0 / 10 · Up to 10 items');
    const r2 = await mount(createElement(StatusComposerItems, { items: [episode(1)], onChange: () => undefined, colours: { accent: '', muted: '', text: '' } }));
    const row = host(r2, 'status-item-row')[0]!;
    expect(flat(row)['borderRadius']).toBe(18);
    expect(flat(row)['padding']).toBe(10);
    expect(texts(r2)).toContain('1 / 10 · Up to 10 items');
    expect(texts(r2)).toContain('Morning Notes');
    expect(byLabel(r2, 'Remove Why mornings matter 1')).toHaveLength(1);
  });
  it('at 10 items the chips say "Up to 10 items." (toast) and the count turns hot', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => episode(i));
    const r = await mount(createElement(StatusComposerItems, { items: ten, onChange: () => undefined, colours: { accent: '', muted: '', text: '' } }));
    await press(r, 'Add episode');
    expect(mockToast).toHaveBeenCalledWith('Up to 10 items.');
    expect(texts(r)).toContain('10 / 10 · Up to 10 items');
  });
  it('"Add an episode" is a sheet with the search field and the label; nothing yet says so; Cancel closes it', async () => {
    const r = await mount(createElement(StatusComposerItems, { items: [], onChange: () => undefined, colours: { accent: '', muted: '', text: '' } }));
    await press(r, 'Add episode');
    const t = texts(r);
    for (const s of ['Add an episode', 'Your queue and recent listening', 'Nothing in your queue or history yet — search above.']) expect(t).toContain(s);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Search episodes' && typeof n.props['onChangeText'] === 'function').length).toBeGreaterThan(0);
    expect(ITEMS.card).toMatchObject({ width: 150, cover: 130 });
  });
});

describe('the pure parts', () => {
  it('the wave is the same for the same status and different for another; 0–1 each', () => {
    expect(waveFor('a')).toEqual(waveFor('a'));
    expect(waveFor('a')).not.toEqual(waveFor('b'));
    expect(Math.max(...waveFor('a'))).toBeLessThanOrEqual(1);
    expect(Math.min(...waveFor('a'))).toBeGreaterThan(0);
    expect(waveFor('a')).toHaveLength(100);
  });
  it('the played share is elapsed over length, held to 0–1', () => {
    expect(playedShare(16_000, 41_000)).toBeCloseTo(0.39, 2);
    expect(playedShare(99_000, 41_000)).toBe(1);
    expect(playedShare(5, 0)).toBe(0);
  });
  it('the bar sits 6 over the foot, or 8 over the keyboard less the strip', () => {
    expect(barLift(0, 34, STAGE.barBottom, STAGE.keyboardGap)).toBe(6);
    expect(barLift(262, 34, STAGE.barBottom, STAGE.keyboardGap)).toBe(236);
    // The drawing: the keyboard is 262 tall and the bar rides at 270 from the screen's foot (236 + the 34 strip).
    expect(barLift(262, 34, 6, 8) + 34).toBe(270);
  });
  it('the toasts: the viewer 104, the text status 124 on a 34 pt strip (the drawings)', () => {
    expect(toastBottom(34, { composer: 'status' })).toBe(34 + 70);
    expect(toastBottom(34, { composer: 'voice' })).toBe(124);
    expect(TEXT_PAGE.cardMin).toBe(230);
  });
});
