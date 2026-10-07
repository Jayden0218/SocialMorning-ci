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
 * then read); start library.tsx's `subscribed` at 0.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { refreshShow } from '@/feeds/fetch';
import { createMemoryFeedCache, createMemoryStores } from '@/storage/memory';
import { rateBlockedNow, rateMayAsk } from '@/ui/shell/RateSheet';
import { mayRun, OPEN_SETTLE_MS, panelStyle } from '@/ui/kit/SwipeRow';
import { updatesSnapshot } from '@/me/updates';
import { GenreTiles } from '@/ui/discover/RecFeedback';
import { GENRES } from '@/discover/genres';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => () => undefined }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => ({}) }));

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
  it('the root layout hands the sheet the page segment and the consent, and the sheet latches', () => {
    expect(read('app/_layout.tsx')).toMatch(/<RateSheet onTabs=\{onTabs\} segment=\{segment\} consent=\{/);
    expect(read('src/ui/shell/RateSheet.tsx')).toMatch(/blocked\.current = true/);
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

  it('still refused past 5 MB: by Content-Length first, else after the read', async () => {
    const cache = createMemoryFeedCache(hash);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: { get: (n: string) => (n.toLowerCase() === 'content-length' ? String(6 * 1024 * 1024) : null) },
      arrayBuffer: async () => { throw new Error('must not download'); }, text: async () => XML,
    } as unknown as Response);
    await expect(refreshShow('https://example.com/big.xml', cache, 1)).rejects.toThrow();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024), text: async () => XML,
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
  it('library.tsx seeds its first render from the snapshot, not from 0 and []', () => {
    const src = read('app/(tabs)/library.tsx');
    expect(src).toMatch(/useState\(\(\) => updatesSnapshot\(stores, hiddenFeeds\)\)/);
    expect(src).toMatch(/useState\(first\.subscribed\)/);
    expect(src).not.toMatch(/useState<UpdateRow\[\]>\(\[\]\)/);
  });
});
