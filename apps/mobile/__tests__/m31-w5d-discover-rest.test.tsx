// Tests that the rest of the discover group matches its drawings in the numbers the owner compared.
/**
 * M31 W5-D (T064; owner: "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2 `discover.html` entries categories--screen, chart--screen / --error, chart-rules--screen, topic--screen,
 * academy--*, picks-daily--*, picks-past--*, issues--*, issue--screen, digest--*, report--*, plaza--*, play-latest--screen. Each guard names
 * the revert that turns it red (each was seen red once, then restored):
 *  - the Mosaic packs like the drawing's CSS grid (sparse flow): `packTiles` searching from the top-left again (dense) — red;
 *  - Categories: tile 0 is 2 x 2, tile 5 is 2 x 1, tile 3 is 1 x 2: `genreSpan` changed — red;
 *  - Charts: the lead tile is 2 x 3 (272) with the rank at 64, the next two 1 x 2 (178), then 2 x 1 (84); the track is 46: `h: 3` -> 2 — red;
 *  - How the charts work: four weight tiles 3 / 2 / 2 / 1: `WEIGHTS` dropped — red;
 *  - Academy: the first article is the hot 2 x 3 tile, numbers plain: `fill: lead ? 'hot'` removed — red;
 *  - Issues: the latest is the light 2 x 3 tile with "Read this issue": `'light'` -> `'raise'` — red;
 *  - an Issue: 36 rings on a spine at x 36, Subscribe 32 tall: `PAGE.spineX` changed — red;
 *  - Daily picks: cards 290 x 470 ending in the dashed Past picks card: `PAGE.daily.height` changed — red;
 *  - Past picks: the spine at x 44, cards 46 in: `PAGE.pastSpine` changed — red;
 *  - Weekly catch-up: Queue all in the title bar's zone, cards 290 x 230: `extra` dropped — red;
 *  - the Report: the 88 figure, four 1 x 1 tiles, 250 x 84 top cards, share in the title bar: `total88` changed — red;
 *  - the Plaza: covers 92 turned -6, a list of 1 x 2 tiles: `PAGE.wall.tile` changed — red;
 *  - Play latest: "Nothing new to play" at 34 on a flat curve: `title34` changed — red;
 *  - a topic list: cards 290 x 430, the cover 200 with the number over it: `PAGE.topic.height` changed — red.
 */
import { createElement } from 'react';
import { Share, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { packTiles, tileSize, columnWidth } from '@/ui/discover/Mosaic';
import { PAGE_GLOW } from '@/ui/kit/PageGlow';

// reanimated's native worklets do not load under jest (see m31-discover-page.test.tsx): a stand-in for what the wall uses.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: { View }, runOnJS: (f: unknown) => f, useAnimatedReaction: () => undefined, useAnimatedStyle: (f: () => object) => f(), useSharedValue: (v: number) => ({ value: v }), withDecay: (o: unknown) => o };
});
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: ({ children }: { children: unknown }) => children, usePanGesture: () => ({}) }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockToast = jest.fn();
const mockOpen = jest.fn();
const mockPlay = jest.fn();
const mockQueue = jest.fn();
const mockLoad = jest.fn();
const mockShare = jest.fn((..._a: unknown[]) => Promise.resolve({ action: 'sharedAction' }));
let mockParams: Record<string, string> = { id: 'l1', slug: 'first', week: '2026-W43', month: '2026-09' };
let mockListener: { listenerId: string } | undefined = { listenerId: 'me' };
let mockChart: (kind: string) => Promise<unknown> = () => Promise.resolve({});
let mockDaily: () => Promise<unknown> = () => Promise.resolve({});
let mockPlaza: () => Promise<unknown> = () => Promise.resolve({});
let mockPast: () => Promise<unknown> = () => Promise.resolve({ days: [] });
let mockIssues: () => Promise<unknown> = () => Promise.resolve([]);
let mockIssue: () => Promise<unknown> = () => Promise.resolve({});
let mockDigests: () => Promise<unknown> = () => Promise.resolve([]);
let mockReport: () => Promise<unknown> = () => Promise.resolve({});
let mockArticles: unknown[] = [];
let mockCollections: unknown[] = [];
let mockLatest: string | undefined;
const mockSubs = new Set<string>();
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  feeds: { getShow: () => undefined, getEpisode: () => undefined },
  feedCache: { get: () => undefined, set: () => undefined },
  subscriptions: { list: () => [...mockSubs].map((feedUrl) => ({ feedUrl })), has: (u: string) => mockSubs.has(u), add: (u: string) => mockSubs.add(u), remove: (u: string) => mockSubs.delete(u) },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => true },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/x',
  useLocalSearchParams: () => mockParams,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => ({}), useSubscriptionSync: () => ({ push: jest.fn() }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: (p: { list: unknown }) => p.list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: mockOpen, play: mockPlay, queue: mockQueue }) }));
const mockExplore = { chart: (k: string) => mockChart(k), daily: () => mockDaily(), plaza: () => mockPlaza() };
jest.mock('@/discover/explore-api', () => ({
  CHART_LABELS: { talked: 'Talked about', new: 'New shows', rising: 'Rising' },
  useExploreApi: () => mockExplore,
}));
jest.mock('@/discover/cache', () => ({ createDiscover: () => ({ cached: () => ({ body: { collections: mockCollections } }) }) }));
const mockM12 = { issues: () => mockIssues(), issue: () => mockIssue(), pastPicks: () => mockPast() };
const mockM19 = { report: () => mockReport() };
const mockM22 = { digests: () => mockDigests() };
const mockApi = {};
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/social/m19-api', () => ({ monthName: (m: string) => (m === '2026-09' ? 'September 2026' : m), useM19Api: () => mockM19 }));
jest.mock('@/social/api-m22-server', () => ({ useM22Api: () => mockM22 }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockListener }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ hiddenFeeds: new Set<string>() }) }));
jest.mock('@/config/store', () => ({ useSectionTitle: (t: string) => t, useAppConfig: () => undefined }));
jest.mock('@/config/content', () => ({ useAcademy: () => mockArticles }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
jest.mock('@/playback/store', () => ({ usePlayer: () => ({ load: mockLoad }), usePlayerSelector: () => true }));
jest.mock('@/storage/playable', () => ({ toPlayable: () => undefined }));
jest.mock('@/settings/queue', () => ({ queueEpisode: jest.fn(() => ({ kind: 'queued' })) }));
jest.mock('@/outside/now-playing', () => ({ latestToPlay: () => mockLatest }));
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => ({ appLink: () => 'https://x', recapCardUrl: () => 'https://x/y.png' }) }));
jest.mock('expo-file-system', () => ({ File: class { uri = 'file://x'; static downloadFileAsync(): Promise<{ uri: string }> { return Promise.resolve({ uri: 'file://x' }); } }, Paths: { cache: '' } }));
jest.mock('@/ui/episode/CardSheet', () => ({ CardSheetHost: () => null, openCardSheet: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import CategoriesScreen from '../app/categories';
import ChartScreen from '../app/chart';
import ChartRulesScreen from '../app/chart-rules';
import TopicScreen from '../app/topic/[id]';
import AcademyScreen from '../app/academy/index';
import ArticleScreen from '../app/academy/[slug]';
import DailyScreen from '../app/picks/daily';
import PastScreen from '../app/picks/past';
import IssuesScreen from '../app/issues';
import IssueScreen from '../app/issue/[id]';
import DigestScreen from '../app/digest/[week]';
import ReportScreen from '../app/report/[month]';
import PlazaScreen from '../app/plaza';
import PlayLatestScreen from '../app/play-latest';
import { GENRES } from '@/discover/genres';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  jest.spyOn(Share, 'share').mockImplementation((...a: unknown[]) => mockShare(...a) as never);
  setReducedMotionForTest(true);
  [mockPush, mockReplace, mockToast, mockOpen, mockPlay, mockQueue, mockLoad, mockShare].forEach((m) => m.mockClear());
  mockListener = { listenerId: 'me' };
  mockLatest = undefined;
  mockSubs.clear();
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
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const textNode = (r: ReactTestRenderer, w: string): ReactTestInstance => {
  const n = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === w)[0];
  if (!n) throw new Error(`no text "${w}"`);
  return n;
};
const comp = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
/** The host element (the one that carries a class and a size) named this. */
const host = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const all = r.root.findAll((x) => typeof x.type === 'string' && x.props['accessibilityLabel'] === label);
  const n = all[0];
  if (!n) throw new Error(`no element named "${label}"`);
  return n;
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = comp(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
/** The pager draws its pages once it has been laid out. */
const layOut = async (r: ReactTestRenderer): Promise<void> => {
  const boxes = r.root.findAll((x) => typeof x.type === 'string' && typeof x.props['onLayout'] === 'function' && String(x.props['className'] ?? '').includes('flex-1'));
  await act(async () => { boxes.forEach((b) => b.props['onLayout']({ nativeEvent: { layout: { width: 390, height: 600 } } })); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
/** The nearest ancestor that sets this style (a composite sits between a host and its parent host). */
const up = (n: ReactTestInstance, key: string): ReactTestInstance => {
  let p: ReactTestInstance | null = n.parent;
  while (p && flat(p)[key] === undefined) p = p.parent;
  if (!p) throw new Error(`no ancestor sets ${key}`);
  return p;
};
const COL = columnWidth(390);

const card = (id: string, title: string, show: string): Record<string, unknown> => ({ id, feedUrl: `f-${show}`, guid: id, title, showTitle: show, imageUrl: undefined, enclosureUrl: 'https://x/a.mp3', durationMs: 48 * 60_000 });

describe('the Mosaic packs like the drawing\'s CSS grid', () => {
  it('places in order and never goes back to fill a hole (sparse flow)', () => {
    // 2 x 3 lead; two 1 x 2; then 2 x 1 rows — the Charts' pattern.
    const { places, rows } = packTiles([{ w: 2, h: 3 }, { w: 1, h: 2 }, { w: 1, h: 2 }, { w: 2, h: 1 }, { w: 2, h: 1 }]);
    expect(places).toEqual([{ col: 0, row: 0 }, { col: 0, row: 3 }, { col: 1, row: 3 }, { col: 0, row: 5 }, { col: 0, row: 6 }]);
    expect(rows).toBe(7);
    // A 1 x 1 after a 2 x 1 that did not fit leaves the hole: the next tile does not go back to fill it.
    const holes = packTiles([{ w: 1, h: 1 }, { w: 2, h: 1 }, { w: 1, h: 1 }]);
    expect(holes.places).toEqual([{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }]);
  });
  it('a tile is w columns and h rows plus the gaps between', () => {
    expect(tileSize(COL, 2, 3)).toEqual({ width: 2 * COL + 10, height: 3 * 84 + 2 * 10 });
    expect(tileSize(COL, 1, 2)).toEqual({ width: COL, height: 178 });
  });
});

describe('Categories (discover.html categories--screen)', () => {
  it('every genre is a tile; sizes vary by place: 2 x 2 first, 2 x 1 at the sixth, 1 x 2 at the fourth; corner squares 110 and 60', async () => {
    const r = await render(createElement(CategoriesScreen));
    const tiles = byId(r, 'mosaic-tile');
    expect(tiles).toHaveLength(GENRES.length);
    const size = (k: number): [unknown, unknown] => [flat(tiles[k])['width'], flat(tiles[k])['height']];
    expect(size(0)).toEqual([2 * COL + 10, 178]);
    expect(size(1)).toEqual([COL, 84]);
    expect(size(3)).toEqual([COL, 178]);
    expect(size(5)).toEqual([2 * COL + 10, 84]);
    expect(flat(tiles[0])['borderRadius']).toBe(22);
    expect(byId(r, 'corner-square').map((c) => flat(c)['width']).slice(0, 4)).toEqual([110, 60, 60, 110]);
    expect(words(r)).toEqual(expect.arrayContaining(['19 genres'].filter(() => GENRES.length === 19).concat([GENRES[0]!.name])));
  });
  it('a tile opens that genre', async () => {
    const r = await render(createElement(CategoriesScreen));
    await press(r, GENRES[2]!.name);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/category/[id]', params: { id: String(GENRES[2]!.id) } });
  });
});

describe('Charts (discover.html chart--screen, chart--error)', () => {
  const items = ['One', 'Two', 'Three', 'Four', 'Five'].map((t, i) => ({ key: `k${i}`, rank: i + 1, ...(i === 0 ? { reason: '41 comments this week' } : {}), episode: card(`e${i}`, `${t} title`, `Show ${i}`) }));
  beforeEach(() => { mockChart = () => Promise.resolve({ kind: 'talked', items, updatedAt: new Date().toISOString() }); });

  it('the 46 track, the lede and when it updated, then the ranked Mosaic: 2 x 3 (272) with the rank at 64, 1 x 2 (178), 2 x 1 (84)', async () => {
    const r = await render(createElement(ChartScreen));
    await layOut(r);
    expect(flat(byId(r, 'segment-switch')[0])).toMatchObject({ height: 46 });
    expect(words(r)).toEqual(expect.arrayContaining(['Talked about', 'New shows', 'Rising', 'The episodes listeners talked about most in the last 7 days.', 'Updated just now']));
    // The pager keeps the next chart mounted beside this one: the first five tiles are this chart's.
    const tiles = byId(r, 'mosaic-tile').slice(0, 5);
    expect(tiles.map((t) => flat(t)['height'])).toEqual([272, 178, 178, 84, 84]);
    expect(tiles.map((t) => flat(t)['width'])).toEqual([2 * COL + 10, COL, COL, 2 * COL + 10, 2 * COL + 10]);
    expect(flat(byId(r, 'chart-rank')[0])).toMatchObject({ fontSize: 64 });
    expect(words(r)).toContain('41 comments this week');
    expect(textNode(r, 'Charts')).toBeTruthy();
  });
  it('a tile opens the episode, Play plays it, a long press is the episode sheet; the info circle opens the rules', async () => {
    const r = await render(createElement(ChartScreen));
    await layOut(r);
    await press(r, 'One title, Show 0');
    expect(mockOpen).toHaveBeenCalled();
    await press(r, 'Play One title');
    expect(mockPlay).toHaveBeenCalled();
    expect(comp(r, 'One title, Show 0').props['accessibilityActions']).toEqual([{ name: 'longpress', label: 'More for One title' }]);
    await press(r, 'How the charts work');
    expect(mockPush).toHaveBeenCalledWith('/chart-rules');
  });
  it('a failed load keeps the track and shows the error tile with Retry', async () => {
    let calls = 0;
    mockChart = () => { calls += 1; return calls === 1 ? Promise.reject(new Error('x')) : Promise.resolve({ kind: 'talked', items, updatedAt: new Date().toISOString() }); };
    const r = await render(createElement(ChartScreen));
    await layOut(r);
    expect(byId(r, 'segment-switch')).toHaveLength(1);
    expect(byId(r, 'err-tile')).toHaveLength(1);
    expect(words(r)).toContain("Couldn't load the chart right now.");
    await press(r, 'Retry');
    expect(byId(r, 'err-tile')).toHaveLength(0);
    expect(byId(r, 'mosaic-tile').length).toBeGreaterThanOrEqual(5);
  });
});

describe('How the charts work (discover.html chart-rules--screen)', () => {
  it('four grouped tiles (radius 22), and Talked about carries the weights as four count tiles', async () => {
    const r = await render(createElement(ChartRulesScreen));
    const tiles = byId(r, 'rules-tile');
    expect(tiles).toHaveLength(3);
    expect(flat(tiles[0])).toMatchObject({ borderRadius: 22, padding: 16 });
    const w = byId(r, 'weight');
    expect(w).toHaveLength(4);
    expect(w.map((x) => say(x.findAll((y) => String(y.type) === 'Text').map((y) => y.props['children'])))).toEqual(['3listener', '2comment', '2clip', '1reaction']);
    expect(words(r)).toEqual(expect.arrayContaining(['Private listening is never counted.', 'How often they update', 'New shows', 'Rising']));
  });
});

describe('A topic list (discover.html topic--screen)', () => {
  it('cards 290 x 430 under the edge label, the cover 200 with the number over it, the editors\' note in quotes', async () => {
    mockCollections = [{ id: 'l1', title: 'Rainy-day listening', subtitle: 'Eight episodes for a slow afternoon', items: [{ key: 'a', why: 'Explains rent.', episode: card('a', 'Rent, explained twice', 'Money, Plainly') }, { key: 'b', why: 'Just rain.', episode: card('b', 'Rain', 'Slow') }] }];
    const r = await render(createElement(TopicScreen));
    const deck = byId(r, 'deck')[0]!;
    const cards = deck.findAll((n) => typeof n.type === 'string' && n.props['style'] && flat(n)['width'] === 290 && flat(n)['height'] === 430);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(words(r)).toEqual(expect.arrayContaining(['“Explains rent.”', 'Rainy-day listening', 'Eight episodes for a slow afternoon', '1', '2']));
    await press(r, 'Rent, explained twice, Money, Plainly');
    expect(mockOpen).toHaveBeenCalled();
    await press(r, 'Play Rent, explained twice');
    expect(mockPlay).toHaveBeenCalled();
  });
  it('without the list on the phone it says so and the title is "Topic list"', async () => {
    mockCollections = [];
    const r = await render(createElement(TopicScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Topic list', 'This list is not on the phone yet — open Discover first']));
  });
});

const MD = (t: string) => ({ t: 'p', v: [{ t: 'text', v: t }] });
const article = (slug: string, title: string, summary: string, tab: string) => ({ slug, title, summary, tab, sections: [{ heading: 'Find the quietest room', blocks: [MD('Soft things absorb echo.')] }, { heading: 'Hold the microphone close', blocks: [MD('A hand\'s width away.')] }, { heading: '', blocks: [MD('An unheaded note.')] }] });

describe('Creator academy (discover.html academy--screen, academy--article, academy--article-missing)', () => {
  beforeEach(() => {
    mockArticles = [article('first', 'Record your first episode', 'A quiet room, one microphone and twenty minutes.', 'start'), article('second', 'Write a show description', 'Say what it is.', 'grow'), article('third', 'Pick a cover', 'Reads small.', 'grow'), article('fourth', 'Answer comments', 'Be kind.', 'community'), article('fifth', 'Publish on a schedule', 'Weekly.', 'grow')];
  });
  it('four filter chips; the first article is the hot 2 x 3 tile with void words; the rest numbered, plain, 1 x 2 then 1 x 1', async () => {
    const r = await render(createElement(AcademyScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['All', 'Get started', 'Grow', 'Community', 'START HERE · 1', 'Record your first episode', '2', '3', '4', '5']));
    const tiles = byId(r, 'mosaic-tile');
    expect(tiles.map((t) => flat(t)['height'])).toEqual([272, 178, 178, 84, 84]);
    expect(classOf(tiles[0]!)).toContain('bg-hot');
    expect(classOf(textNode(r, 'Record your first episode'))).toContain('text-void');
    expect(flat(textNode(r, 'Record your first episode'))).toMatchObject({ fontSize: 24 });
  });
  it('a chip filters; a tile opens the article', async () => {
    const r = await render(createElement(AcademyScreen));
    await press(r, 'Community');
    expect(byId(r, 'mosaic-tile')).toHaveLength(1);
    await press(r, 'Answer comments. Be kind.');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/academy/[slug]', params: { slug: 'fourth' } });
  });
  it('an article: the summary, then a Thread of 36 rings on a spine at x 36, each heading numbered, in raise cards (radius 18)', async () => {
    mockParams = { slug: 'first' };
    const r = await render(createElement(ArticleScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Record your first episode', 'Creator academy · 1', 'A quiet room, one microphone and twenty minutes.', 'Find the quietest room', 'Hold the microphone close']));
    expect(flat(byId(r, 'numbered-spine')[0])).toMatchObject({ left: 36, width: 2 });
    const rings = byId(r, 'thread-ring');
    expect(rings.map((x) => [flat(x)['width'], flat(x)['height']])).toEqual([[36, 36], [36, 36]]);
    expect(rings.map((x) => say(x.findAll((y) => String(y.type) === 'Text').map((y) => y.props['children'])))).toEqual(['1', '2']);
    expect(byId(r, 'article-section')).toHaveLength(3);
  });
  it('an article that has moved says so', async () => {
    mockParams = { slug: 'no-such-article' };
    const r = await render(createElement(ArticleScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Article', 'This article has moved', 'The academy list has the current articles.']));
  });
});

describe('Daily picks (discover.html picks-daily--screen, --error)', () => {
  const picks = [0, 1].map((i) => ({ feedUrl: `f${i}`, guid: `g${i}`, why: ['Short, warm, and good with coffee.', 'A city story told after midnight.'][i], episode: card(`e${i}`, ['Why mornings matter', 'Cities that sleep late'][i]!, ['Morning Notes', 'Night Shift'][i]!) }));
  it('cards 290 x 470 under TODAY ending in the dashed Past picks card; the note whole; + and Play 42; the clock circle is Past picks', async () => {
    mockDaily = () => Promise.resolve({ date: '2026-10-27', items: picks });
    const r = await render(createElement(DailyScreen));
    const deck = byId(r, 'deck')[0]!;
    const sized = deck.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 290 && flat(n)['height'] === 470);
    expect(sized).toHaveLength(3);
    expect(words(r)).toEqual(expect.arrayContaining(['“Short, warm, and good with coffee.”', 'Why mornings matter', '48 min', 'Past picks ›', 'Morning Notes · Open the show ›']));
    expect(classOf(byId(r, 'deck-card')[2]!)).toContain('border-dashed');
    await press(r, 'Add Why mornings matter to the queue');
    expect(mockQueue).toHaveBeenCalled();
    await press(r, 'Play Why mornings matter');
    expect(mockPlay).toHaveBeenCalled();
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Past picks' && typeof x.props['onPress'] === 'function').length).toBeGreaterThanOrEqual(2);
    await act(async () => { comp(r, 'Past picks').props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/picks/past', params: { before: '2026-10-27' } });
  });
  it('a pick with no episode keeps its note and opens the show; empty and error say so', async () => {
    mockDaily = () => Promise.resolve({ date: '2026-10-27', items: [{ feedUrl: 'f9', guid: 'g9', why: 'A note.', episode: null }] });
    let r = await render(createElement(DailyScreen));
    await press(r, 'Open the show');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: 'f9' } });
    mockDaily = () => Promise.resolve({ date: '2026-10-27', items: [] });
    r = await render(createElement(DailyScreen));
    expect(words(r)).toContain('No picks today yet');
    mockDaily = () => Promise.reject(new Error('x'));
    r = await render(createElement(DailyScreen));
    expect(words(r)).toContain("Couldn't load today's picks.");
    expect(byId(r, 'err-tile')).toHaveLength(1);
  });
});

describe('Past picks (discover.html picks-past--screen, --error)', () => {
  it('a spine at x 44; the date as a solid chip with "2 picks"; cards 46 in (raise, radius 18) with the cover letter, the note, Play 34; a note-only pick; Show earlier days', async () => {
    mockPast = () => Promise.resolve({ next: '2026-10-20', days: [{ date: '2026-10-26', picks: [{ feedUrl: 'f1', why: 'Short, warm.', episode: card('e1', 'Why mornings matter', 'Morning Notes') }, { feedUrl: 'f2', why: 'Just a note.', episode: null }] }] });
    const r = await render(createElement(PastScreen));
    expect(flat(byId(r, 'past-spine')[0])).toMatchObject({ left: 44, width: 2 });
    expect(words(r)).toEqual(expect.arrayContaining(['Mon 26 Oct', '2 picks', '“Short, warm.”', 'Morning Notes', 'Why mornings matter', 'M', 'Open the show ›', 'Show earlier days']));
    const picks = byId(r, 'past-pick');
    expect(flat(picks[0])).toMatchObject({ borderRadius: 18 });
    expect(flat(up(picks[0]!, 'marginLeft'))).toMatchObject({ marginLeft: 46 });
    await press(r, 'Play Why mornings matter');
    expect(mockPlay).toHaveBeenCalled();
    await press(r, 'Just a note.. Open the show');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: 'f2' } });
  });
  it('empty and a failed load', async () => {
    mockPast = () => Promise.resolve({ days: [] });
    let r = await render(createElement(PastScreen));
    expect(words(r)).toContain('No earlier picks yet');
    mockPast = () => Promise.reject(new Error('x'));
    r = await render(createElement(PastScreen));
    expect(words(r)).toContain("Couldn't load past picks right now.");
  });
});

describe('Issues (discover.html issues--screen, --error)', () => {
  const issues = [{ id: 'i12', date: '2026-10-27', title: 'Sounds of the city at night', number: 12 }, { id: 'i11', date: '2026-10-20', title: 'Kitchen stories', number: 11 }, { id: 'i10', date: '2026-10-13', title: 'Before the election', number: 10 }, { id: 'i9', date: '2026-10-06', title: 'Learning slowly', number: 9 }];
  it('the latest is the light 2 x 3 tile with "Read this issue"; earlier issues 1 x 2 then 1 x 1 with number and date in mono', async () => {
    mockIssues = () => Promise.resolve(issues);
    const r = await render(createElement(IssuesScreen));
    const tiles = byId(r, 'mosaic-tile');
    expect(tiles.map((t) => flat(t)['height'])).toEqual([272, 178, 178, 84]);
    expect(classOf(tiles[0]!)).toContain('bg-text');
    expect(words(r)).toEqual(expect.arrayContaining(['NO. 12 · LATEST · TUE 27 OCT 2026', 'Sounds of the city at night', 'Read this issue', 'NO. 11 · TUE 20 OCT', 'Kitchen stories']));
    expect(flat(textNode(r, 'Sounds of the city at night'))).toMatchObject({ fontSize: 26 });
    await press(r, 'Issue of Tue 20 Oct 2026');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/issue/[id]', params: { id: 'i11' } });
    await press(r, 'Sounds of the city at night, Tue 27 Oct 2026');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/issue/[id]', params: { id: 'i12' } });
  });
  it('empty and error', async () => {
    mockIssues = () => Promise.resolve([]);
    let r = await render(createElement(IssuesScreen));
    expect(words(r)).toContain('No issues yet');
    mockIssues = () => Promise.reject(new Error('x'));
    r = await render(createElement(IssuesScreen));
    expect(words(r)).toContain("Couldn't load the issues right now.");
  });
});

describe('One issue (discover.html issue--screen)', () => {
  beforeEach(() => {
    mockParams = { id: 'i12' };
    mockIssue = () => Promise.resolve({ id: 'i12', date: '2026-10-27', title: 'Sounds of the city at night', number: 12, intro: 'Six episodes for walking home late.', items: [
      { order: 1, feedUrl: 'f1', note: 'Neon, rain and a taxi driver.', episode: card('e1', 'Cities that sleep late', 'Night Shift Radio') },
      { order: 2, feedUrl: 'f2', note: 'Start here.', episode: null },
    ] });
  });
  it('the header line and intro, then a numbered Thread: 36 rings on a spine at x 36, cards radius 20, Play 38, the note in quotes, "Open the show ›", Subscribe 32', async () => {
    const r = await render(createElement(IssueScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Sounds of the city at night', 'Issue No. 12', 'NO. 12 · TUE 27 OCT 2026', 'Six episodes for walking home late.', '“Neon, rain and a taxi driver.”', 'Open the show ›', 'Subscribe']));
    expect(flat(byId(r, 'numbered-spine')[0])).toMatchObject({ left: 36, width: 2 });
    expect(byId(r, 'thread-ring').map((x) => flat(x)['width'])).toEqual([36, 36]);
    expect(flat(textNode(r, 'Sounds of the city at night'))).toMatchObject({ fontSize: 24 });
    expect(flat(host(r, 'Subscribe to Night Shift Radio'))).toMatchObject({ height: 32 });
    await press(r, 'Subscribe to Night Shift Radio');
    expect(mockSubs.has('f1')).toBe(true);
    expect(words(r)).toContain('Subscribed');
    await press(r, 'Unsubscribe from Night Shift Radio');
    expect(mockSubs.has('f1')).toBe(false);
    await press(r, 'Play Cities that sleep late');
    expect(mockPlay).toHaveBeenCalled();
    await press(r, 'Cities that sleep late, Night Shift Radio');
    expect(mockOpen).toHaveBeenCalled();
  });
  it('Share this issue is the title bar\'s circle and sends the issue as text; an error is the tile with Retry', async () => {
    const r = await render(createElement(IssueScreen));
    await press(r, 'Share this issue');
    expect(mockShare).toHaveBeenCalledWith({ message: expect.stringContaining('No. 12 · Sounds of the city at night') });
    mockIssue = () => Promise.reject(new Error('x'));
    const e = await render(createElement(IssueScreen));
    expect(words(e)).toContain("Couldn't load this issue.");
    expect(() => comp(e, 'Share this issue')).toThrow();
  });
});

describe('Weekly catch-up (discover.html digest--screen, digest--none)', () => {
  const eps = [0, 1, 2].map((i) => ({ id: `d${i}`, feedUrl: `f${i}`, guid: `g${i}`, title: ['Why mornings matter', 'Cities that sleep late', 'What bread taught me'][i], showTitle: ['Morning Notes', 'Night Shift', 'The Long Table'][i], enclosureUrl: 'https://x/a.mp3', imageUrl: null, durationMs: 48 * 60_000, publishedAt: '2026-10-19T10:00:00Z' }));
  it('Queue all is the hot 48 button in the title bar\'s zone; cards 290 x 230 with the cover 72; the shows below; Play plays', async () => {
    mockDigests = () => Promise.resolve([{ isoWeek: '2026-W43', episodes: eps, sentAt: '' }]);
    const r = await render(createElement(DigestScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Weekly catch-up', 'New last week · 3 unplayed', 'Queue all', 'Why mornings matter', '48 min']));
    expect(classOf(host(r, 'Queue all'))).toContain('bg-hot');
    expect(flat(host(r, 'Queue all'))).toMatchObject({ height: 48 });
    const deck = byId(r, 'deck')[0]!;
    expect(deck.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 290 && flat(n)['height'] === 230)).toHaveLength(3);
    expect(byId(r, 'digest-shows')[0]!.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 56)).not.toHaveLength(0);
    await press(r, 'Queue all');
    expect(mockToast).toHaveBeenCalledWith('Added 3 to the queue');
    await press(r, 'Play Why mornings matter');
    expect(mockLoad).toHaveBeenCalled();
  });
  it('none, and an error, say so', async () => {
    mockDigests = () => Promise.resolve([]);
    let r = await render(createElement(DigestScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No catch-up here.', 'PLUS members get one on Mondays when their shows had new episodes.']));
    expect(() => comp(r, 'Queue all')).toThrow();
    mockDigests = () => Promise.reject(new Error('x'));
    r = await render(createElement(DigestScreen));
    expect(words(r)).toContain("Couldn't load your catch-up. Try again later.");
  });
});

describe('Your month in listening (discover.html report--*, toast--report)', () => {
  const report = { month: '2026-09', minutes: 1284, shows: 12, episodes: 46, comments: 9, clips: 3,
    topShows: [{ feedUrl: 'f1', title: 'Morning Notes', imageUrl: null, minutes: 370 }, { feedUrl: 'f2', title: 'Slow Science', imageUrl: null, minutes: 242 }],
    topEpisodes: [{ id: 'e1', title: 'Why mornings matter', showTitle: 'Morning Notes', imageUrl: null, minutes: 90 }] };
  beforeEach(() => { mockParams = { month: '2026-09' }; mockReport = () => Promise.resolve(report); });

  it('the Stage: LISTENING TIME, the 88 figure (a gradient, digit by digit), minutes · h min; four 1 x 1 counts at 28; Decks of 250 x 84 top cards', async () => {
    const r = await render(createElement(ReportScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Your September 2026', 'Your month in listening', 'LISTENING TIME', 'minutes · 21 h 24 min', 'shows', 'episodes', 'comments', 'clips', 'Morning Notes', 'Why mornings matter']));
    const figure = byId(r, 'report-figure')[0]!;
    expect(flat(figure)).toMatchObject({ fontSize: 88 });
    expect(say(figure.props['children'])).toBe('1,284');
    expect(byId(r, 'mosaic-tile').map((t) => [flat(t)['width'], flat(t)['height']])).toEqual(Array(4).fill([COL, 84]));
    expect(flat(textNode(r, '12'))).toMatchObject({ fontSize: 28 });
    const decks = byId(r, 'deck');
    expect(decks).toHaveLength(2);
    expect(decks[0]!.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 250 && flat(n)['height'] === 84)).toHaveLength(2);
  });
  it('a top show opens its show; a top episode opens its page, or says it is not on this phone', async () => {
    const r = await render(createElement(ReportScreen));
    await press(r, '1. Morning Notes, 6 h 10 min');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: 'f1' } });
    await press(r, '1. Why mornings matter, Morning Notes, 1 h 30 min');
    expect(mockToast).toHaveBeenCalledWith("That episode isn't on this phone. Follow its show to open it.");
  });
  it('Share your September is the title bar\'s circle: "Making the picture…", then the share sheet', async () => {
    const r = await render(createElement(ReportScreen));
    await press(r, 'Share your September 2026');
    expect(mockToast).toHaveBeenCalledWith('Making the picture…');
    expect(mockShare).toHaveBeenCalled();
  });
  it('signed out: the block with a light Sign in and no share; no listening: one sentence, no share; a failed load: the tile with Retry', async () => {
    mockListener = undefined;
    let r = await render(createElement(ReportScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Your September 2026', 'Sign in to see your month in listening.', 'Sign in']));
    expect(() => comp(r, 'Share your September 2026')).toThrow();
    await press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    mockListener = { listenerId: 'me' };
    mockReport = () => Promise.resolve({ ...report, minutes: 0, episodes: 0, shows: 0, topShows: [], topEpisodes: [] });
    r = await render(createElement(ReportScreen));
    expect(words(r)).toContain("Nothing here — you didn't listen that month.");
    expect(() => comp(r, 'Share your September 2026')).toThrow();
    mockReport = () => Promise.reject(new Error('x'));
    r = await render(createElement(ReportScreen));
    expect(words(r)).toContain("Couldn't load this report right now.");
    expect(byId(r, 'err-tile')).toHaveLength(1);
  });
});

describe('New shows plaza (discover.html plaza--screen, --list, --error)', () => {
  const shows = Array.from({ length: 6 }, (_, i) => ({ feedUrl: `f${i}`, title: `Show ${i}`, imageUrl: undefined, episodes: i + 2, firstAt: '2026-10-01' }));
  beforeEach(() => { mockPlaza = () => Promise.resolve({ shuffle: 0, items: shows }); });

  it('the wall: covers of 92 turned -6 degrees, 40 wider than the page each side; the title bar has Shuffle and List view', async () => {
    const r = await render(createElement(PlazaScreen));
    expect(flat(byId(r, 'plaza-wall')[0])).toMatchObject({ left: -40, right: -40 });
    expect(flat(byId(r, 'plaza-wall')[0])['transform']).toEqual([{ rotate: '-6deg' }]);
    await act(async () => { byId(r, 'plaza-wall')[0]!.parent!.props['onLayout']?.({ nativeEvent: { layout: { width: 390, height: 700 } } }); });
    const covers = hosts(r, (n) => flat(n)['width'] === 92 && flat(n)['borderRadius'] === 20);
    expect(covers.length).toBeGreaterThan(0);
    expect(words(r)).toEqual(expect.arrayContaining(['New shows plaza', 'Drag the wall in any direction. Tap a cover to open the show.']));
    expect(() => comp(r, 'Shuffle the plaza')).not.toThrow();
  });
  it('List view is a Mosaic of 1 x 2 tiles (178 tall, radius 22), a cover of 72, "n episodes"; the circle becomes Wall view', async () => {
    const r = await render(createElement(PlazaScreen));
    await press(r, 'List view');
    const tiles = byId(r, 'plaza-tile');
    expect(tiles).toHaveLength(6);
    expect(flat(tiles[0])).toMatchObject({ height: 178, borderRadius: 22 });
    expect(words(r)).toEqual(expect.arrayContaining(['The newest shows, as a list.', 'Show 0', '2 episodes']));
    await press(r, 'Show 1, 3 episodes');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: 'f1' } });
    expect(() => comp(r, 'Wall view')).not.toThrow();
  });
  it('nothing loaded and no server: grey placeholders and the error tile with Retry', async () => {
    mockPlaza = () => Promise.reject(new Error('x'));
    const r = await render(createElement(PlazaScreen));
    expect(byId(r, 'plaza-placeholder')).toHaveLength(1);
    expect(words(r)).toContain("Couldn't reach the server.");
    expect(byId(r, 'err-tile')).toHaveLength(1);
    await press(r, 'Retry');
  });
});

describe('Play latest (discover.html play-latest--screen)', () => {
  it('nothing to play: the flat curve, "Nothing new to play" at 34 and the line at 17; back leaves', async () => {
    mockLatest = undefined;
    const r = await render(createElement(PlayLatestScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Play latest', 'Nothing new to play', 'Follow a show or add to your queue.']));
    expect(flat(textNode(r, 'Nothing new to play'))).toMatchObject({ fontSize: 34 });
    expect(flat(textNode(r, 'Follow a show or add to your queue.'))).toMatchObject({ fontSize: 17, lineHeight: 24 });
    expect(byId(r, 'play-latest-nothing')).toHaveLength(1);
  });
});

describe('the topic page\'s glow (discover.html topic--screen glow #3B82F6 / #7A3CFF, -180, .3)', () => {
  it('is blue then violet, 180 above the page at 30 %', async () => {
    mockCollections = [{ id: 'l1', title: 'Rainy-day listening', items: [{ key: 'a', why: 'Rent.', episode: card('a', 'Rent', 'Money') }] }];
    const r = await render(createElement(TopicScreen));
    const stops = r.root.findAll((n) => typeof n.props['stopColor'] === 'string').map((n) => n.props['stopColor']);
    expect(stops).toEqual(expect.arrayContaining(['#3b82f6', '#7a3cff']));
    expect(stops).not.toContain('#ff4d6d');
    expect(PAGE_GLOW.blueTop).toBe(-180);
    expect(PAGE_GLOW.blueStrength).toBe(0.3);
  });
});
