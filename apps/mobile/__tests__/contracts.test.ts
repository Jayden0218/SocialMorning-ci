// M25 G8: the phone's own clients and parsers read every contract example (the server half is apps/api/test/contracts.test.ts).
/**
 * packages/contracts holds a JSON Schema and an example for each answer the phone reads; the API
 * test proves the real server's answers match the schemas. Here each example goes through the
 * phone's real client (a fake `fetch` returns it) and parser, and the result must carry the
 * example's values — so a field the phone reads cannot be renamed in the contract without this
 * failing. Hand-written JSON in tests (api-client.test.ts) now comes from the same examples.
 */
// content.ts also holds the screen hook, which reaches the app's providers (and so expo-audio):
// the same stand-ins as m25-config.test.tsx. Only the loader and parser are under test here.
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/token', () => ({ secureToken: { get: async () => undefined } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));

import { CONTRACTS, validate } from '../../../packages/contracts/src/index';
import { createApi } from '@/social/api';
import { createNotificationsApi } from '@/social/notifications-api';
import { createM12Api } from '@/social/m12-api';
import { createConfigApi } from '@/config/api';
import { createConfigLoader } from '@/config/load';
import { articleOf, createContentLoader } from '@/config/content';
import { CONFIG_DEFAULTS } from '@socialmorning/social-core';
import type { FeedCacheRow, FeedCacheStore } from '@/storage/types';

/** A fetch that answers every path from the contract examples it is given. */
function serve(routes: Record<string, unknown>) {
  const seen: string[] = [];
  const f = (async (url: string) => {
    const path = new URL(url).pathname;
    seen.push(path);
    const body = routes[path];
    if (body === undefined) return new Response(JSON.stringify({ error: 'not_found', message: path }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', etag: '"v1"' } });
  }) as unknown as typeof fetch;
  return { deps: { baseUrl: 'https://api.test', fetch: f, getToken: async () => 'tok' }, seen };
}
const memCache = (): FeedCacheStore => {
  const m = new Map<string, FeedCacheRow>();
  return { get: (k) => m.get(k), set: (r) => { m.set(r.key, r); } };
};
const ex = CONTRACTS;

it('every example still matches its schema (the API test checks the server against the same schemas)', () => {
  for (const [name, c] of Object.entries(CONTRACTS)) expect([name, validate(c.schema, c.example)]).toEqual([name, []]);
});

it('signIn and me: the listener the phone keeps', async () => {
  const { deps } = serve({ '/v1/auth/sign-in': ex.signIn.example, '/v1/me': ex.me.example });
  const api = createApi(deps);
  const s = await api.signIn('a@example.com', 'pw');
  expect([s.token, s.listener.id, s.listener.displayName]).toEqual(['tok-1', 'L1', 'Alex']);
  const me = await api.me();
  expect([me.id, me.email, me.displayName, me.privateListening, me.plus]).toEqual(['L1', 'a@example.com', 'Alex', false, false]);
});

it('social: comments with their replies, the heat curve and my reactions', async () => {
  const { deps } = serve({ '/v1/episodes/E1/social': ex.social.example });
  const r = await createApi(deps).social('E1');
  if (r.status !== 200) throw new Error('expected 200');
  expect(r.etag).toBe('"v1"');
  const [c] = r.body.comments;
  expect([c!.id, c!.offsetMs, c!.displayName, c!.likeCount, c!.replies?.[0]?.parentId]).toEqual(['c1', 20_000, 'Alex', 1, 'c1']);
  expect(r.body.heat).toEqual({ available: true, buckets: [0, 0.5, 1] });
  expect(r.body.myReactionBuckets).toEqual([3]);
});

it('feed: what people I follow did', async () => {
  const { deps } = serve({ '/v1/me/feed': ex.feed.example });
  const r = await createApi(deps).feed();
  if (r.status !== 200) throw new Error('expected 200');
  const [i] = r.body.items;
  expect([i!.kind, i!.actor.displayName, i!.episode.title, i!.momentMs, i!.refId]).toEqual(['commented', 'Bea', 'Ep 1', 20_000, 'c2']);
});

it('discover: the sections and the owner\'s layout', async () => {
  const { deps } = serve({ '/v1/discover': ex.discover.example });
  const r = await createApi(deps).discover();
  if (r.status !== 200) throw new Error('expected 200');
  expect(r.body.picks[0]!.episode.enclosureUrl).toBe('https://cdn.example.com/1.mp3');
  expect(r.body.shows?.[0]?.title).toBe('Show');
  expect(r.body.layout).toEqual({ order: ['picks', 'shows'], hidden: [] });
  expect(r.body.stale).toBe(false);
});

it('config: the loader takes the server\'s settings (not the bundled defaults) and keeps them', async () => {
  const { deps } = serve({ '/v1/config': ex.config.example });
  const cache = memCache();
  const loader = createConfigLoader({ api: createConfigApi(deps), cache, now: () => 0 });
  const got = await loader.refresh();
  expect(got).not.toEqual(CONFIG_DEFAULTS);
  expect(got.searchHints).toEqual(['history', 'science']);
  expect(got.listSizes.discoverCategories).toBe(6);
  expect(got.ratePrompt.enabled).toBe(false);
  expect(got.sectionTitles['For You']).toBe('Just for you');
  expect(loader.fromCache()).toEqual(got);
});

it('content: Academy pages are read and drawn from their Markdown', async () => {
  const { deps } = serve({ '/v1/content/academy': ex.content.example });
  const loader = createContentLoader({ api: createConfigApi(deps), cache: memCache(), now: () => 0 });
  const items = await loader.refresh('academy');
  expect(items?.map((p) => p.slug)).toEqual(['start']);
  const view = articleOf(items![0]!);
  expect([view.title, view.summary]).toEqual(['Getting started', 'Your first show']);
  expect(view.sections.length).toBeGreaterThan(0);
});

it('notifications and system notices: rows and their one in-app button', async () => {
  const { deps } = serve({ '/v1/me/notifications': ex.notifications.example, '/v1/me/notifications/system': ex.systemNotices.example });
  const api = createNotificationsApi(deps);
  const page = await api.list();
  expect(page.next).toBeNull();
  expect(page.items.map((n) => [n.kind, n.actor.name, n.ref.excerpt, n.ref.episodeTitle, n.unread])).toEqual([['reply', 'Bea', 'Same', 'Ep 1', true]]);
  expect(await api.system()).toEqual([{ id: 's1', title: 'Welcome', body: 'Hello from SocialNet.', createdAt: '2026-10-08T00:00:00.000Z', action: { label: 'Open Discover', route: '/discover' } }]);
});

it('wallet: purchases and tips', async () => {
  const { deps } = serve({ '/v1/me/purchases': ex.purchases.example, '/v1/me/tips': ex.tips.example });
  const api = createM12Api(deps);
  const p = await api.purchases();
  expect([p.storeReady, p.items[0]!.productId, p.items[0]!.amountMicros, p.items[0]!.currency]).toEqual([true, 'plus_month', 9_900_000, 'MYR']);
  const t = await api.tips();
  expect([t.storeReady, t.items[0]!.feedUrl, t.items[0]!.showTitle]).toEqual([true, 'https://feeds.example.com/a.xml', 'Show']);
});
