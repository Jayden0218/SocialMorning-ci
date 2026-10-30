// Checks the admin's app settings and content pages on the phone: offline fallback, applying them, and text-only bodies.
/**
 * M25 lane AC (spec 026, A7 + A8).
 *
 * Guard G-AC1 (config fallback): the server down, a 500, or a broken answer never changes the phone
 * — it keeps its last copy, or the built-in defaults, which are today's eight Discover tiles and the
 * bundled categories. The break that turns it red: in `src/config/load.ts`, `refresh`'s `catch`
 * rethrows (`throw e`) instead of returning what the phone has.
 *
 * Guard G-AC2 (content sanitising, phone half): a `<script>` in a body is drawn as those characters
 * in a <Text>, and a non-https link is not a link. (Studio half: apps/studio/test/m25-content.test.tsx.)
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { CONFIG_DEFAULTS, parseMarkdown } from '@socialmorning/social-core';

jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/token', () => ({ secureToken: { get: async () => undefined } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));

import { ApiError } from '@/social/api';
import { createMemoryFeedCacheStore } from '@/storage/memory';
import { createConfigLoader, CONFIG_CACHE_KEY } from '@/config/load';
import { applyConfig, getAppConfig, sectionTitle, listSize } from '@/config/store';
import { tryWords, withHints } from '@/config/hints';
import { articleOf, BUNDLED_ARTICLES, BUNDLED_FAQ, createContentLoader, faqOf } from '@/config/content';
import { shortcutTiles } from '@/ui/discover/DiscoverShortcuts';
import { BUNDLED_GENRES, GENRES, genreById, genreOf } from '@/discover/genres';
import { MarkdownBlocks } from '@/ui/content/Markdown';
import { RATE_AT_KEY, RATE_KEY, shouldAskRating, storeUrlFor } from '@/ui/shell/RateSheet';
import type { Fetched } from '@/config/api';

const TODAY = ['Categories', 'Queue', 'Issues', 'Friends listening', 'Academy', 'Premium', 'Plaza', 'Talked about'];
const down = async (): Promise<never> => { throw new ApiError('network', "Couldn't reach the server.", 0); };
const answer = (body: unknown, etag = 'W/"1"') => async (): Promise<Fetched<unknown>> => ({ status: 200, etag, body });
const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); }, delete: (k: string) => { m.delete(k); } };
};

afterEach(() => applyConfig(CONFIG_DEFAULTS));

describe('G-AC1: the server down → the bundled defaults, the same tiles as today', () => {
  it('nothing cached and the server down: defaults, and the eight tiles of today', async () => {
    const loader = createConfigLoader({ api: { config: down }, cache: createMemoryFeedCacheStore(), now: () => 1 });
    expect(loader.fromCache()).toEqual(CONFIG_DEFAULTS);
    const got = await loader.refresh();
    expect(got).toEqual(CONFIG_DEFAULTS);
    applyConfig(got);
    expect(shortcutTiles(getAppConfig().shortcuts).map((t) => t.label)).toEqual(TODAY);
    expect(GENRES.map((g) => g.id)).toEqual(BUNDLED_GENRES.map((g) => g.id));
    expect(GENRES.map((g) => g.name)).toEqual(BUNDLED_GENRES.map((g) => g.name));
    expect(listSize('discoverCategories')).toBe(8);
    expect(listSize('searchCategories')).toBe(4);
  });

  it('a 500 or a broken answer: defaults too; never throws', async () => {
    const e500 = async (): Promise<never> => { throw new ApiError('internal', 'Server answered 500.', 500); };
    expect(await createConfigLoader({ api: { config: e500 }, cache: createMemoryFeedCacheStore(), now: () => 1 }).refresh()).toEqual(CONFIG_DEFAULTS);
    expect(await createConfigLoader({ api: { config: answer('not json at all') }, cache: createMemoryFeedCacheStore(), now: () => 1 }).refresh()).toEqual(CONFIG_DEFAULTS);
    expect(await createConfigLoader({ api: { config: answer({ config: { shortcuts: 'broken', searchHints: ['jazz'] } }) }, cache: createMemoryFeedCacheStore(), now: () => 1 }).refresh())
      .toEqual({ ...CONFIG_DEFAULTS, searchHints: ['jazz'] });
  });

  it('a saved copy is kept when the server is down later, and a 304 keeps it too', async () => {
    const cache = createMemoryFeedCacheStore();
    const changed = { config: { shortcuts: [{ id: 'plaza', label: 'Square' }, { id: 'queue', hidden: true }] } };
    const first = await createConfigLoader({ api: { config: answer(changed) }, cache, now: () => 5 }).refresh();
    expect(cache.get(CONFIG_CACHE_KEY)?.etag).toBe('W/"1"');
    const offline = createConfigLoader({ api: { config: down }, cache, now: () => 6 });
    expect(offline.fromCache()).toEqual(first);
    expect(await offline.refresh()).toEqual(first);
    let sent: string | undefined;
    const same = createConfigLoader({ api: { config: async (etag?: string) => { sent = etag; return { status: 304 as const }; } }, cache, now: () => 7 });
    expect(await same.refresh()).toEqual(first);
    expect(sent).toBe('W/"1"');
    applyConfig(first);
    expect(shortcutTiles(getAppConfig().shortcuts).map((t) => t.label)).toEqual(['Square', 'Categories', 'Issues', 'Friends listening', 'Academy', 'Premium', 'Plaza', 'Talked about'].filter((l) => l !== 'Plaza'));
  });

  it('a corrupt cached copy is read as the defaults', () => {
    const cache = createMemoryFeedCacheStore();
    cache.set({ key: CONFIG_CACHE_KEY, fetchedAt: 1, body: '{nope' });
    expect(createConfigLoader({ api: { config: down }, cache, now: () => 1 }).fromCache()).toEqual(CONFIG_DEFAULTS);
  });
});

describe('the admin\'s settings, applied', () => {
  it('categories: renamed, reordered and hidden; lookups still find a hidden one; never empty', () => {
    applyConfig({ ...CONFIG_DEFAULTS, genres: [{ id: 1303, name: 'Funny' }, { id: 1321, hidden: true }] });
    expect(GENRES[0]).toMatchObject({ id: 1303, name: 'Funny' });
    expect(GENRES.some((g) => g.id === 1321)).toBe(false);
    expect(GENRES).toHaveLength(BUNDLED_GENRES.length - 1);
    expect(genreById(1321)?.name).toBe('Business');
    expect(genreOf(['Comedy'])?.name).toBe('Funny');
    applyConfig({ ...CONFIG_DEFAULTS, genres: BUNDLED_GENRES.map((g) => ({ id: g.id, hidden: true })) });
    expect(GENRES).toHaveLength(BUNDLED_GENRES.length);
  });

  it('section titles, hints and "Try searching"', () => {
    expect(sectionTitle('For You')).toBe('For You');
    expect(withHints(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(tryWords(['x'])).toEqual(['x']);
    applyConfig({ ...CONFIG_DEFAULTS, sectionTitles: { 'For You': 'Made for you' }, searchHints: ['jazz', 'history'], listSizes: { ...CONFIG_DEFAULTS.listSizes, searchHints: 1 } });
    expect(sectionTitle('For You')).toBe('Made for you');
    expect(sectionTitle('Comments')).toBe('Comments');
    expect(withHints(['a'])).toEqual(['jazz']);
    expect(tryWords(['x'])).toEqual(['jazz', 'history']);
  });

  it('rate prompt: default asks once; off never asks; ask again after N days unless rated; admin store links', () => {
    const s = memory();
    expect(shouldAskRating(s as never)).toBe(true);
    s.set(RATE_KEY, 'closed');
    s.set(RATE_AT_KEY, '1000');
    expect(shouldAskRating(s as never)).toBe(false);
    const rule = { ...CONFIG_DEFAULTS.ratePrompt, reaskAfterDays: 2 };
    expect(shouldAskRating(s as never, rule, 1000 + 86_400_000)).toBe(false);
    expect(shouldAskRating(s as never, rule, 1000 + 2 * 86_400_000)).toBe(true);
    s.set(RATE_KEY, 'rate');
    expect(shouldAskRating(s as never, rule, 1000 + 9 * 86_400_000)).toBe(false);
    expect(shouldAskRating(memory() as never, { ...rule, enabled: false })).toBe(false);
    expect(storeUrlFor('ios')).toBeUndefined();
    expect(storeUrlFor('android', { ...rule, storeUrls: { android: 'https://play.google.com/store/apps/details?id=x' } })).toBe('https://play.google.com/store/apps/details?id=x');
  });
});

describe('content pages', () => {
  it('server pages become articles (## sections) and questions; the bundled copy is the fallback', async () => {
    const a = articleOf({ slug: 's', title: 'T', summary: null, tag: 'grow', body: '## One\n\n- a\n## Two\n\nb', position: 0, updatedAt: '' });
    expect(a).toMatchObject({ slug: 's', summary: '', tab: 'grow' });
    expect(a.sections.map((x) => x.heading)).toEqual(['One', 'Two']);
    expect(faqOf({ slug: 'q', title: 'Q?', summary: null, tag: null, body: 'A.', position: 0, updatedAt: '' })).toMatchObject({ q: 'Q?', tag: 'Other' });
    expect(BUNDLED_ARTICLES).toHaveLength(5);
    expect(BUNDLED_ARTICLES[0]!.tab).toBe('start');
    expect(BUNDLED_FAQ).toHaveLength(9);

    const cache = createMemoryFeedCacheStore();
    const page = { slug: 'x', title: 'X', summary: null, tag: null, body: 'b', position: 0, updatedAt: '' };
    const ok = createContentLoader({ api: { content: async () => ({ status: 200 as const, etag: 'e', body: { items: [page, null as never] } }) }, cache, now: () => 1 });
    expect(await ok.refresh('faq')).toEqual([page]);
    const off = createContentLoader({ api: { content: down }, cache, now: () => 1 });
    expect(off.cached('faq')).toEqual([page]);
    expect(await off.refresh('faq')).toEqual([page]);
    expect(await off.refresh('academy')).toBeUndefined();
  });
});

const texts = (root: ReactTestInstance): string[] => root.findAll(() => true).flatMap((n) => n.children.filter((c): c is string => typeof c === 'string'));

describe('G-AC2 (phone): a body is drawn as text, never as markup', () => {
  it('<script> and <img onerror> show as their characters; a javascript: link is not a link', () => {
    let r!: ReturnType<typeof create>;
    act(() => { r = create(createElement(MarkdownBlocks, { blocks: parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [good](https://example.com)') })); });
    const all = texts(r.root).join('|');
    expect(all).toContain('<script>alert(1)</script>');
    expect(all).toContain('<img src=x onerror=alert(1)>');
    const links = r.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function');
    expect([...new Set(links.map((n) => n.props.accessibilityLabel))]).toEqual(['good']);
  });
});
