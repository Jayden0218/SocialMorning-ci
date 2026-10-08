// Checks the five defects from the owner's iPhone on 2026-10-07 stay fixed.
/**
 * Release build from ios run 37618700477, iPhone 16 Pro Max:
 *  1. the rate sheet slid up over the first-open interests page;
 *  2. interest tiles and History select rows were missing from the accessibility tree
 *     ("checkbox" has no iOS trait);
 *  3. swipe panels showed behind the rows at rest, and a two-action side ran an action;
 *  4. every phone feed refresh failed (RN's fetch has no streaming `response.body`);
 *  5. Updates started at "My subscriptions · 0" though the phone had the shows.
 *
 * The breaks that turn it red: drop `a.interestsDue ||` from `rateBlockedNow`; put
 * accessibilityRole="checkbox" back on GenreTiles; make `panelStyle` return opacity 1 at 0;
 * make `mayRun` return true; remove `PHONE_READ` from fetch.ts (the throwing `body` getter is
 * then read); start library.tsx's `subscribed` at 0; drop the `blocked.current = true` latch
 * from RateSheet (the rendered sheet then slides up after an onboarding page); make TopBar's
 * `solid` paint nothing; put `flexGrow` back on a grid tile; let a name in CommentRow / FeedItem wrap.
 *
 * M25 lane GB: the checks that read component source are now RENDER tests (the rate sheet's
 * latch, TopBar, the shortcut and category grids, the comment and feed rows); the root layout's
 * hand-off to the sheet is rendered in __tests__/root-layout.test.tsx. What still reads source is
 * marked KEPT: facts that live only inside expo-router pages (history, library, episode, show,
 * profile, Discover, Me, player — 23 to 55 imports each).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { refreshShow } from '@/feeds/fetch';
import { createMemoryFeedCache, createMemoryStores } from '@/storage/memory';
import { RateSheet, rateBlockedNow, rateMayAsk } from '@/ui/shell/RateSheet';
import { mayRun, OPEN_SETTLE_MS, panelStyle } from '@/ui/kit/SwipeRow';
import { updatesSnapshot } from '@/me/updates';
import { GenreTiles } from '@/ui/discover/RecFeedback';
import { GENRES } from '@/discover/genres';
import { CategoryStrip, gridRows, Shortcuts } from '@/ui/discover/sections';
import { shortcutTiles } from '@/ui/discover/DiscoverShortcuts';
import { KEY_PICKED } from '@/discover/interests';
import { getAppConfig } from '@/config/store';
import { colour } from '@/design';
import { TopBar } from '@/ui/kit/TopBar';
import { CommentRow } from '@/ui/comments/CommentRow';
import { FeedItem } from '@/ui/social/FeedItem';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import type { Comment, FeedItem as FeedRow } from '@/social/api';

// jest.mock factories are hoisted, so anything they touch must be named `mock*`.
const mockMap = new Map<string, string>();
const mockSettings = { get: (k: string) => mockMap.get(k), set: (k: string, v: string) => { mockMap.set(k, v); }, delete: (k: string) => { mockMap.delete(k); } };
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Link: (p: { children?: unknown }) => p.children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: mockSettings, feedCache: {} }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => ({}) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {} }) }));

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); }, delete: (k: string) => { m.delete(k); } } as never;
};

describe('1. the rate sheet never shows over onboarding, nor in the same launch', () => {
  it('blocked by the terms, the interests page being due, or an onboarding/auth page open', () => {
    expect(rateBlockedNow({ segment: '(tabs)', consent: true, interestsDue: false })).toBe(false);
    expect(rateBlockedNow({ segment: '(tabs)', consent: true, interestsDue: true })).toBe(true);
    expect(rateBlockedNow({ segment: '(tabs)', consent: false, interestsDue: false })).toBe(true);
    expect(rateBlockedNow({ segment: 'onboarding', consent: true, interestsDue: false })).toBe(true);
    expect(rateBlockedNow({ segment: 'auth', consent: true, interestsDue: false })).toBe(true);
  });
  it('once blocked in a launch, back on the tabs it still does not ask', () => {
    const s = memory();
    expect(rateMayAsk(s, { onTabs: true, blockedThisLaunch: false })).toBe(true);
    expect(rateMayAsk(s, { onTabs: true, blockedThisLaunch: true })).toBe(false);
    expect(rateMayAsk(s, { onTabs: false, blockedThisLaunch: false })).toBe(false);
  });
  // The root layout handing the sheet `segment` and `consent` is rendered in root-layout.test.tsx.
  describe('rendered: the sheet latches for the rest of the launch', () => {
    beforeAll(() => { jest.useFakeTimers(); });
    afterAll(() => { jest.clearAllTimers(); jest.useRealTimers(); });
    beforeEach(() => { mockMap.clear(); mockMap.set(KEY_PICKED, '[1,2]'); });
    const sheet = (segment: string) => createElement(GluestackUIProvider, null, createElement(RateSheet, { onTabs: segment === '(tabs)', segment, consent: true }));
    const wait = () => act(() => { jest.advanceTimersByTime(getAppConfig().ratePrompt.delayMs + 50); });
    const shown = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['accessibilityLabel'] === 'Rate us' && typeof n.props['onPress'] === 'function').length > 0;

    it('straight onto the tabs: it slides up', () => {
      let r!: ReactTestRenderer;
      act(() => { r = create(sheet('(tabs)')); });
      wait();
      expect(shown(r)).toBe(true);
      act(() => r.unmount());
    });
    it('an onboarding page first, then the tabs: it stays down', () => {
      let r!: ReactTestRenderer;
      act(() => { r = create(sheet('onboarding')); });
      wait();
      expect(shown(r)).toBe(false);
      act(() => { r.update(sheet('(tabs)')); });
      wait();
      expect(shown(r)).toBe(false);
      act(() => r.unmount());
    });
  });
});

describe('2. tiles and History select rows are accessible buttons with a selected state', () => {
  it('each interest tile: role button, its name, selected follows the pick', () => {
    let r!: ReactTestRenderer;
    const first = GENRES[0]!;
    act(() => { r = create(createElement(GenreTiles, { picked: [first.id], onToggle: () => undefined })); });
    const tiles = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button' && GENRES.some((g) => g.name === n.props['accessibilityLabel']));
    expect(tiles).toHaveLength(GENRES.length);
    expect(tiles.find((t) => t.props['accessibilityLabel'] === first.name)!.props['accessibilityState']).toEqual({ selected: true });
    expect(tiles.find((t) => t.props['accessibilityLabel'] === GENRES[1]!.name)!.props['accessibilityState']).toEqual({ selected: false });
    act(() => r.unmount());
  });
  // KEPT as a source check: the select row is drawn inline in app/history.tsx (27 imports: ListDetail,
  // the player, FilterBar, confirm, the library API…); there is no row component to render alone.
  it('History select rows: role button + selected, and the circle cannot take the touch', () => {
    const src = read('app/history.tsx');
    expect(src).not.toMatch(/accessibilityRole="checkbox"/);
    expect(src).toMatch(/accessibilityRole="button" accessibilityState=\{\{ selected: chosen\.has/);
    expect(src).toMatch(/<Box pointerEvents="none"[^>]*>\s*<Icon name=\{chosen\.has/);
  });
});

describe('3. swipe actions: hidden at rest, never run by the release', () => {
  it('a panel is see-through at progress 0 and whole once the row moves', () => {
    expect(panelStyle(0)).toEqual({ opacity: 0 });
    expect(panelStyle(0.01)).toEqual({ opacity: 1 });
  });
  it('a button runs only on a row that finished opening, and not in the same moment', () => {
    expect(mayRun(undefined, 10_000)).toBe(false);
    expect(mayRun(10_000, 10_000)).toBe(false);
    expect(mayRun(10_000, 10_000 + OPEN_SETTLE_MS)).toBe(true);
  });
});

describe('4. a phone feed refresh never needs a streaming body', () => {
  const XML = '<?xml version="1.0"?><rss version="2.0"><channel><title>RN Show</title><item><title>a</title><guid>a</guid><enclosure url="https://cdn/a.mp3" type="audio/mpeg"/></item></channel></rss>';
  afterEach(() => jest.restoreAllMocks());

  it('a response with no `body` and only arrayBuffer parses', async () => {
    const bytes = new TextEncoder().encode(XML);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'text/xml' : null) },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => { throw new Error('text() after arrayBuffer'); },
    } as unknown as Response);
    const r = await refreshShow('https://example.com/rn.xml', createMemoryFeedCache(hash), 1);
    expect(r.stale).toBe(false);
    expect(r.show.title).toBe('RN Show');
  });

  it('a `body` that throws when touched is never read; text() is enough', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      get body(): never { throw new Error('no ReadableStream on React Native'); },
      text: async () => XML,
    } as unknown as Response);
    const r = await refreshShow('https://example.com/rn2.xml', createMemoryFeedCache(hash), 1);
    expect(r.episodes.map((e) => e.guid)).toEqual(['a']);
  });

  it('still refused past the cap (20 MB): by Content-Length first, else after the read', async () => {
    const cache = createMemoryFeedCache(hash);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? String(21 * 1024 * 1024) : null) },
      arrayBuffer: async () => { throw new Error('must not download'); }, text: async () => XML,
    } as unknown as Response);
    await expect(refreshShow('https://example.com/big.xml', cache, 1)).rejects.toThrow();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(21 * 1024 * 1024), text: async () => XML,
    } as unknown as Response);
    await expect(refreshShow('https://example.com/big2.xml', cache, 1)).rejects.toThrow();
  });
});

describe('5. Updates starts from the local database', () => {
  it('the snapshot counts the saved shows and lists their episodes before any sync', () => {
    const stores = createMemoryStores(hash);
    const F = 'https://feeds.example.com/local.xml';
    const show: Show = { feedUrl: F, title: 'Local', explicit: false, categories: [], contentHash: 'h' };
    const ep: Episode = { guid: 'g1', guidSource: 'guid', title: 'g1', enclosureUrl: 'https://cdn/g1.mp3', publishedAt: 5, explicit: false, transcripts: [], soundbites: [], contentHash: 'h-g1' };
    stores.feeds.put(F, { show, episodes: [ep], warnings: [] } as ParsedFeed, {}, 1);
    stores.subscriptions.add(F, 0);
    const snap = updatesSnapshot(stores, new Set());
    expect(snap.subscribed).toBe(1);
    expect(snap.rows.map((r) => r.episode.guid)).toEqual(['g1']);
  });
  // KEPT as a source check: the seeding is the useState initialiser of app/(tabs)/library.tsx
  // (35 imports); the snapshot it seeds from is rendered-free and tested above.
  it('library.tsx seeds its first render from the snapshot, not from 0 and []', () => {
    const src = read('app/(tabs)/library.tsx');
    expect(src).toMatch(/useState\(\(\) => updatesSnapshot\(stores, hiddenFeeds\)\)/);
    expect(src).toMatch(/useState\(first\.subscribed\)/);
    expect(src).not.toMatch(/useState<UpdateRow\[\]>\(\[\]\)/);
  });
});

/** `#rrggbb` → its three channels, so a check holds whether UniWind emits hex or rgb(). */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channels = (value: unknown) => {
  const v = String(value);
  return v.startsWith('#') ? rgb(v) : (v.match(/\d+/g) ?? []).slice(0, 3).map(Number);
};
const styleOf = (n: ReactTestInstance) => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string');

describe('6–13. the layout pass ("I see it overlap, the elements run away the layout")', () => {
  it('6. a collapsed bar is solid (rendered TopBar): paper colour, a hairline, above the page', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(TopBar, { onBack: () => undefined, solid: true })); });
    const bar = styleOf(hosts(r)[0]!);
    expect(channels(bar['backgroundColor'])).toEqual(rgb(colour.background));
    expect(Number(bar['borderBottomWidth'])).toBeGreaterThan(0);
    expect(bar['zIndex']).toBe(2);
    // Not collapsed: see-through, no line (the hero shows under it).
    act(() => { r.update(createElement(TopBar, { onBack: () => undefined, solid: false })); });
    const open = styleOf(hosts(r)[0]!);
    expect(open['backgroundColor']).toBeUndefined();
    expect(open['borderBottomWidth'] ?? 0).toBe(0);
    act(() => r.unmount());
  });
  // KEPT as source checks: each page passes `solid={collapsed}` from its own scroll state —
  // app/episode/[id].tsx (52 imports), app/show/[feedUrl].tsx (47), app/profile/[id].tsx and
  // Discover app/(tabs)/index.tsx (42); none can be rendered without stubbing most of the page.
  it('6. the episode, show and profile pages hand the bar `solid`; Discover\'s bar never fades', () => {
    expect(read('app/episode/[id].tsx')).toMatch(/solid=\{collapsed\}/);
    expect(read('app/show/[feedUrl].tsx')).toMatch(/solid=\{collapsed\}/);
    expect(read('app/profile/[id].tsx')).toMatch(/solid=\{collapsed\}/);
    // Discover's bar is either absent or fully opaque — never a see-through fade.
    const discover = read('app/(tabs)/index.tsx');
    expect(discover).not.toMatch(/\[COLLAPSE_FROM, COLLAPSE_TO\], \[0, 1\]/);
    expect(discover).toMatch(/withTiming\(scrollY\.value > COLLAPSE_TO - 8 \? 1 : 0/);
  });
  // KEPT as a source check: the slim bar's show link is built inline in app/episode/[id].tsx (52 imports).
  it('7. the episode page slim bar: the show name opens the show', () => {
    expect(read('app/episode/[id].tsx')).toMatch(/solid=\{collapsed\}[\s\S]*?accessibilityRole="link"\s+accessibilityLabel=\{`Show: \$\{show\?\.title/);
  });
  it('8–9. grids: even rows, no stretched last tile, one fixed tile height', () => {
    expect(gridRows([1, 2, 3, 4, 5, 6, 7], 4)).toEqual([[1, 2, 3, 4], [5, 6, 7, null]]);
    expect(gridRows(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c', null]]);
    expect(gridRows([], 4)).toEqual([]);
    // Discover's shortcuts: eight tiles, two rows of four. M25 A7: they live in their own component
    // (the admin may change them); with nothing saved they are the same eight.
    expect(shortcutTiles([]).map((t) => t.label)).toEqual(['Categories', 'Queue', 'Issues', 'Friends listening', 'Academy', 'Premium', 'Plaza', 'Talked about']);
  });
  it('8. rendered shortcuts, 7 tiles: two rows of four cells, every tile the same fixed size, the gap kept by an empty cell', () => {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(Shortcuts, { items: labels.map((label) => ({ label, icon: shortcutTiles([])[0]!.icon, onPress: () => undefined })) })); });
    const tiles = hosts(r).filter((n) => labels.includes(n.props['accessibilityLabel'] as string));
    expect(tiles).toHaveLength(7);
    const sizes = tiles.map((t) => { const s = styleOf(t); return [s['flex'], s['height'], s['width']]; });
    // No grow on a tile: a stretched tile is what ran away on the iPhone.
    for (const t of tiles) expect(styleOf(t)['flexGrow']).toBeUndefined();
    for (const s of sizes) expect(s).toEqual(sizes[0]);
    expect(styleOf(tiles[0]!)['height']).toBe(56);
    // The last tile's row has 4 cells: G and the empty ones sharing the width.
    const row = tiles[6]!.parent!;
    let rowHost: ReactTestInstance | null = row;
    while (rowHost !== null && !(typeof rowHost.type === 'string' && rowHost.children.length > 1)) rowHost = rowHost.parent;
    expect(rowHost!.children).toHaveLength(4);
    for (const cell of rowHost!.children as ReactTestInstance[]) {
      const host = typeof cell.type === 'string' ? cell : cell.findAll((n) => typeof n.type === 'string')[0]!;
      expect(styleOf(host)['flex']).toBe(1);
      expect(styleOf(host)['flexGrow']).toBeUndefined();
    }
  });
  it('9. rendered categories: one fixed tile height, a name on one line that shrinks to fit', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(CategoryStrip, { onGenre: () => undefined, onAll: () => undefined })); });
    const shown = GENRES.filter((g) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === g.name).length > 0);
    expect(shown.length).toBeGreaterThan(1);
    const heights = new Set<unknown>();
    for (const g of shown) {
      const name = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === g.name)[0]!;
      expect([g.name, name.props['numberOfLines'], name.props['adjustsFontSizeToFit'], name.props['minimumFontScale']]).toEqual([g.name, 1, true, 0.75]);
      // The tile: the nearest host above the button with a fixed height.
      let tile: ReactTestInstance | null = name.parent;
      while (tile !== null && !(typeof tile.type === 'string' && styleOf(tile)['height'] !== undefined)) tile = tile.parent;
      heights.add(styleOf(tile!)['height']);
    }
    expect(heights.size).toBe(1);
    act(() => r.unmount());
  });
  // KEPT as a source check: where Discover mounts the shortcuts is app/(tabs)/index.tsx (42 imports).
  it('8. Discover draws the shortcuts component', () => {
    expect(read('app/(tabs)/index.tsx')).toMatch(/<DiscoverShortcuts onCategories=\{allCategories\} onPremium=\{toPremium\} \/>/);
  });
  // KEPT as source checks: 10–12 are layouts inside app/(tabs)/me.tsx (23 imports), app/episode/[id].tsx
  // (52) and app/player.tsx (55), with no smaller component that carries them.
  it('10. Me: the ninth tile spans its row (no empty half beside Playlists)', () => {
    expect(read('app/(tabs)/me.tsx')).not.toMatch(/label="Playlists" \/><\/Link>\s*<Box className="flex-1" \/>/);
  });
  it('11. the episode page comments cell names itself', () => {
    expect(read('app/episode/[id].tsx')).toMatch(/commentCount > 0 \? plural\(commentCount, 'comment'\) : 'Comments'/);
  });
  it('12. player: the space is shared when there is no line, and the bottom bar items are one kind', () => {
    const p = read('app/player.tsx');
    // M24 US19 (iPhone, 04-player.png): sharing it ABOVE the hero left a ~140 pt band under the top
    // bar. The hero now stays under the bar; on a bare page the card + controls centre in the rest.
    expect(p).toMatch(/groupClass: 'my-auto'/);
    expect(p).toMatch(/accessibilityLabel="About this episode" className=\{BAR_ITEM\}/);
    expect(p).not.toMatch(/<BarButton label="About this episode"/);
  });

  /** The name's Text and the link around it: one line, and the link may shrink below its content. */
  const nameFits = (r: ReactTestRenderer, name: string) => {
    const text = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === name)[0]!;
    expect(text.props['numberOfLines']).toBe(1);
    let link: ReactTestInstance | null = text.parent;
    while (link !== null && !(typeof link.type === 'string' && link.props['accessibilityRole'] === 'link')) link = link.parent;
    expect(link).not.toBeNull();
    expect(styleOf(link!)['flexShrink']).toBe(1);
    expect(styleOf(link!)['minWidth']).toBe(0);
  };
  const LONG = 'A listener with a very long display name that would run off the row';

  it('13. long names in rows shrink to one line (rendered CommentRow)', () => {
    const c: Comment = { id: 'c1', authorId: 'a1', displayName: LONG, body: 'hello', offsetMs: null, parentId: null, createdAt: '2026-10-07T00:00:00Z', deleted: false };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(createElement(CommentRow, {
        c, serverTime: '2026-10-07T00:05:00Z', likeOf: () => ({ count: 0, liked: false }), iconColour: { muted: colour.muted, accent: colour.accent },
        onSeek: () => undefined, onLike: () => undefined, onMenu: () => undefined,
      }));
    });
    nameFits(r, LONG);
    act(() => r.unmount());
  });
  it('13. long names in rows shrink to one line (rendered FeedItem)', () => {
    const item: FeedRow = { id: 1, kind: 'listened', actor: { id: 'a1', displayName: LONG }, episode: { id: 'e1', title: 'Ep', showTitle: 'Show', imageUrl: null }, momentMs: null, refId: null, createdAt: '2026-10-07T00:00:00Z' };
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(FeedItem, { item, onOpen: () => undefined })); });
    nameFits(r, LONG);
    act(() => r.unmount());
  });
});
