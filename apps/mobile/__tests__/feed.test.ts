/** T021: the feed cache — stale offline, 304 keeps the copy, the unread count clears on open. */
import { createFeed, FEED_LAST_OPENED_KEY } from '../src/graph/feed';
import { ApiError, type ApiClient, type FeedItem } from '../src/social/api';
import { createMemoryFeedCacheStore, createMemorySettingsStore } from '../src/storage/memory';

const item = (id: number, createdAt: string): FeedItem => ({ id, kind: 'clipped', actor: { id: 'b', displayName: 'Bea' }, episode: { id: 'e', title: 'Ep', showTitle: null, imageUrl: null }, momentMs: 1, refId: null, createdAt });

function build() {
  let online = true;
  let payload: { items: FeedItem[]; next?: string } = { items: [item(1, '2026-09-21T10:00:00Z'), item(2, '2026-09-21T11:00:00Z')] };
  let etag = 'W/"a"';
  const calls: (string | undefined)[] = [];
  const api = {
    feed: async (before?: string, ifNoneMatch?: string) => {
      calls.push(ifNoneMatch);
      if (!online) throw new ApiError('network', 'no', 0);
      if (before) return { status: 200 as const, body: { items: [item(0, '2026-09-21T09:00:00Z')], serverTime: 'x' } };
      if (ifNoneMatch === etag) return { status: 304 as const };
      return { status: 200 as const, etag, body: { ...payload, serverTime: 'x' } };
    },
  } as unknown as ApiClient;
  const settings = createMemorySettingsStore();
  let clock = 1_000;
  const feed = createFeed({ api, cache: createMemoryFeedCacheStore(), settings, now: () => clock });
  return { feed, settings, calls, setOnline: (v: boolean) => { online = v; }, setPayload: (p: typeof payload, e: string) => { payload = p; etag = e; }, tick: (ms: number) => { clock += ms; } };
}

it('refresh caches with the ETag; a 304 keeps the copy; offline shows it stale; a fresh install offline is empty and stale', async () => {
  const t = build();
  expect(t.feed.cached()).toBeUndefined();
  const first = await t.feed.refresh();
  expect(first.items.map((i) => i.id)).toEqual([2, 1]); // newest first even if the server sent them the other way
  expect(first.stale).toBe(false);
  const second = await t.feed.refresh();
  expect(t.calls[1]).toBe('W/"a"');
  expect(second).toMatchObject({ stale: false, fetchedAt: 1_000 });
  expect(second.items).toHaveLength(2);
  t.setOnline(false);
  const off = await t.feed.refresh();
  expect(off.stale).toBe(true);
  expect(off.items).toHaveLength(2);
  expect(t.feed.cached()?.stale).toBe(true);
  const fresh = build(); fresh.setOnline(false);
  expect(await fresh.feed.refresh()).toEqual({ items: [], stale: true });
});

it('unread counts items newer than the last open; markOpened clears it; a signed-out fetch is empty, not stale', async () => {
  const t = build();
  const v = await t.feed.refresh();
  expect(t.feed.unread(v.items)).toBe(2);
  t.tick(1);
  t.settings.set(FEED_LAST_OPENED_KEY, String(Date.parse('2026-09-21T10:30:00Z')));
  expect(t.feed.unread(v.items)).toBe(1);
  t.feed.markOpened();
  expect(t.settings.get(FEED_LAST_OPENED_KEY)).toBe('1001');
  expect(await t.feed.more('cursor')).toEqual({ items: [item(0, '2026-09-21T09:00:00Z')] });
  const out = build();
  (out as unknown as { feed: { refresh: () => Promise<unknown> } });
  const api = { feed: async () => { throw new ApiError('unauthenticated', 'no', 401); } } as unknown as ApiClient;
  const f = createFeed({ api, cache: createMemoryFeedCacheStore(), settings: createMemorySettingsStore(), now: () => 1 });
  expect(await f.refresh()).toEqual({ items: [], stale: false });
});
