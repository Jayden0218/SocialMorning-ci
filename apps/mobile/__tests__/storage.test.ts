/**
 * The storage rules the requirements name, pinned against `memory.ts`.
 *
 * These run in Node with no device. They say nothing about SQLite — the
 * expo-sqlite implementation is NOT VERIFIED until it runs on a phone — but
 * they do pin the behaviour both implementations owe the layers above.
 */
import {
  createMemoryFeedCache,
  createMemoryPositionStore,
  createMemorySessionStore,
  createMemoryStores,
  createMemorySubscriptionStore,
} from '../src/storage/memory';
import { episodeId } from '../src/storage/schema';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const testHash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(2);
};

const FEED = 'https://example.com/show/feed.xml';

const show = (): Show => ({
  feedUrl: FEED,
  title: 'A Show',
  explicit: false,
  categories: [],
  contentHash: 'showhash',
});

const episode = (guid: string, publishedAt?: number): Episode => ({
  guid,
  guidSource: 'guid',
  title: guid,
  enclosureUrl: `https://cdn.example.com/${guid}.mp3`,
  ...(publishedAt !== undefined && { publishedAt }),
  explicit: false,
  transcripts: [],
  soundbites: [],
  contentHash: `hash-${guid}`,
});

const parsed = (episodes: Episode[]): ParsedFeed => ({
  show: show(),
  episodes,
  warnings: [],
});

describe('PositionStore', () => {
  // (a) The ordering key M3's sync merge will need. Wall-clock time is not
  // enough: two saves inside one millisecond must still be orderable, which
  // is why this is a counter and not a timestamp.
  it('increments progressSeq strictly on every save', () => {
    const positions = createMemoryPositionStore();
    const first = positions.save({ episodeId: 'e1', offsetMs: 1_000, finished: false }, 1_000);
    const second = positions.save({ episodeId: 'e1', offsetMs: 6_000, finished: false }, 1_000);
    const third = positions.save({ episodeId: 'e1', offsetMs: 11_000, finished: false }, 2_000);

    expect(first.progressSeq).toBe(1);
    expect(second.progressSeq).toBe(2);
    expect(third.progressSeq).toBe(3);
    expect(second.progressSeq).toBeGreaterThan(first.progressSeq);
    // Same wall clock on the first two saves, different sequence numbers.
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(positions.get('e1')?.offsetMs).toBe(11_000);
  });

  it('keeps positions for different episodes independent (FR-018)', () => {
    const positions = createMemoryPositionStore();
    positions.save({ episodeId: 'e1', offsetMs: 872_000, finished: false }, 1);
    positions.save({ episodeId: 'e2', offsetMs: 10_000, finished: false }, 2);
    expect(positions.get('e1')?.offsetMs).toBe(872_000);
    expect(positions.get('e2')?.offsetMs).toBe(10_000);
    expect(positions.all()).toHaveLength(2);
    expect(positions.get('never-played')).toBeUndefined();
  });
});

describe('SubscriptionStore', () => {
  it('adds, lists, and does not duplicate', () => {
    const subscriptions = createMemorySubscriptionStore();
    subscriptions.add(FEED, 100);
    subscriptions.add(FEED, 200);
    expect(subscriptions.has(FEED)).toBe(true);
    expect(subscriptions.list()).toEqual([{ feedUrl: FEED, subscribedAt: 100 }]);
  });

  // (b) FR-023. This is the requirement an "obvious" ON DELETE CASCADE in the
  // schema would silently violate, and the reason the schema has none.
  it('unsubscribing leaves saved positions untouched (FR-023)', () => {
    const stores = createMemoryStores(testHash);
    stores.subscriptions.add(FEED, 100);
    stores.positions.save({ episodeId: 'e1', offsetMs: 872_000, finished: false }, 200);

    stores.subscriptions.remove(FEED);

    expect(stores.subscriptions.has(FEED)).toBe(false);
    expect(stores.subscriptions.list()).toEqual([]);
    expect(stores.positions.get('e1')?.offsetMs).toBe(872_000);
    expect(stores.positions.all()).toHaveLength(1);
  });
});

describe('FeedCache', () => {
  // (c) FR-002: newest first, and an episode with no date goes LAST, not
  // first. Sorting `undefined` naively puts it wherever the engine likes.
  it('lists episodes newest first with undated last', () => {
    const feeds = createMemoryFeedCache(testHash);
    feeds.put(
      FEED,
      parsed([
        episode('old', 1_000),
        episode('undated'),
        episode('newest', 3_000),
        episode('middle', 2_000),
        episode('undated-two'),
      ]),
      {},
      500,
    );
    expect(feeds.listEpisodes(FEED).map((e) => e.guid)).toEqual([
      'newest',
      'middle',
      'old',
      'undated',
      'undated-two',
    ]);
  });

  it('keys episodes by hash(feedUrl + separator + guid) and finds them again', () => {
    const feeds = createMemoryFeedCache(testHash);
    feeds.put(FEED, parsed([episode('ep-1', 1_000)]), { etag: 'W/"a"' }, 500);
    const id = episodeId(FEED, 'ep-1', testHash);
    expect(feeds.getEpisode(id)?.guid).toBe('ep-1');
    expect(feeds.getEpisode(id)?.feedUrl).toBe(FEED);
    expect(feeds.getShow(FEED)?.etag).toBe('W/"a"');
    expect(feeds.getShow(FEED)?.fetchedAt).toBe(500);
    expect(feeds.getShow('https://other.example/feed.xml')).toBeUndefined();
  });

  it('a second put replaces the show episodes rather than appending', () => {
    const feeds = createMemoryFeedCache(testHash);
    feeds.put(FEED, parsed([episode('a', 1), episode('b', 2)]), {}, 1);
    feeds.put(FEED, parsed([episode('b', 2), episode('c', 3)]), {}, 2);
    expect(feeds.listEpisodes(FEED).map((e) => e.guid)).toEqual(['c', 'b']);
    expect(feeds.getEpisode(episodeId(FEED, 'a', testHash))).toBeUndefined();
  });

  it('stores what did not parse alongside what did (Principle IV)', () => {
    const feeds = createMemoryFeedCache(testHash);
    feeds.put(
      FEED,
      {
        show: show(),
        episodes: [episode('ok', 1)],
        warnings: [{ code: 'item-without-enclosure', message: 'skipped', itemTitle: 'Announcement' }],
      },
      {},
      1,
    );
    expect(feeds.listEpisodes(FEED)).toHaveLength(1);
    expect(feeds.getShow(FEED)?.lastWarnings).toEqual([
      { code: 'item-without-enclosure', message: 'skipped', itemTitle: 'Announcement' },
    ]);
  });
});

describe('SessionStore', () => {
  // (d) One row. "Continue listening" has exactly one answer.
  it('holds a single row, replaced on every set', () => {
    const session = createMemorySessionStore();
    expect(session.get()).toBeUndefined();

    session.set({ episodeId: 'e1', intent: 'play' }, 100);
    expect(session.get()).toEqual({ episodeId: 'e1', intent: 'play', updatedAt: 100 });

    session.set({ episodeId: 'e2', intent: 'pause' }, 200);
    expect(session.get()).toEqual({ episodeId: 'e2', intent: 'pause', updatedAt: 200 });
  });
});

// ---------------------------------------------------------------------------
// US4: subscriptions, end to end (T053)
// ---------------------------------------------------------------------------

describe('subscribing and unsubscribing (FR-021, FR-022, FR-023)', () => {
  it('unsubscribing leaves the episode still resumable from Continue Listening', () => {
    const stores = createMemoryStores(testHash);
    stores.feeds.put(FEED, parsed([episode('ep-1', 1_000)]), {}, 1);
    const id = episodeId(FEED, 'ep-1', testHash);

    stores.subscriptions.add(FEED, 10);
    stores.positions.save({ episodeId: id, offsetMs: 872_000, finished: false }, 20);
    stores.session.set({ episodeId: id, intent: 'pause' }, 20);

    stores.subscriptions.remove(FEED);

    // The show is gone from the library; the listening is not.
    expect(stores.subscriptions.list()).toEqual([]);
    expect(stores.positions.get(id)?.offsetMs).toBe(872_000);
    expect(stores.session.get()?.episodeId).toBe(id);
    expect(stores.feeds.getEpisode(id)?.title).toBe('ep-1');
  });
});

// ---- M3 (migration 002) ----

describe('PositionStore sync fields (M3)', () => {
  it('a fresh save is unsynced; markSynced clears it; a lower mark is ignored', () => {
    const s = createMemoryStores(testHash);
    const row = s.positions.save({ episodeId: 'e', offsetMs: 1000, finished: false }, 1);
    expect(row.explicitSeek).toBe(false);
    expect(s.positions.unsynced().map((r) => r.episodeId)).toEqual(['e']);
    s.positions.markSynced('e', row.progressSeq);
    expect(s.positions.unsynced()).toEqual([]);
    const later = s.positions.save({ episodeId: 'e', offsetMs: 2000, finished: false, explicitSeek: true }, 2);
    expect(later.explicitSeek).toBe(true);
    s.positions.markSynced('e', row.progressSeq); // stale ack
    expect(s.positions.unsynced().map((r) => r.progressSeq)).toEqual([later.progressSeq]);
  });

  it('applyRemote with an unchanged offset does not re-queue; a changed one is synced by definition', () => {
    const s = createMemoryStores(testHash);
    const row = s.positions.save({ episodeId: 'e', offsetMs: 1000, finished: false }, 1);
    s.positions.markSynced('e', row.progressSeq);
    const echo = s.positions.applyRemote({ episodeId: 'e', offsetMs: 1000, finished: false, explicitSeek: false }, 2);
    expect(echo.progressSeq).toBe(row.progressSeq);
    expect(s.positions.unsynced()).toEqual([]);
    const moved = s.positions.applyRemote({ episodeId: 'e', offsetMs: 5000, finished: false, explicitSeek: true }, 3);
    expect(moved.progressSeq).toBe(row.progressSeq + 1);
    expect(moved.syncedSeq).toBe(moved.progressSeq);
    expect(s.positions.unsynced()).toEqual([]);
  });
});

describe('AuthStore, SocialCacheStore, DraftStore (M3)', () => {
  it('auth holds one row; clear empties it', () => {
    const s = createMemoryStores(testHash);
    expect(s.auth.get()).toBeUndefined();
    s.auth.set({ listenerId: 'L', displayName: 'Alex', email: 'a@x' }, 5);
    expect(s.auth.get()).toEqual({ listenerId: 'L', displayName: 'Alex', email: 'a@x', signedInAt: 5 });
    s.auth.clear();
    expect(s.auth.get()).toBeUndefined();
  });

  it('social cache is per episode and replaced on put', () => {
    const s = createMemoryStores(testHash);
    s.socialCache.put({ episodeId: 'e', etag: '"1"', fetchedAt: 1, bodyJson: '{"a":1}' });
    s.socialCache.put({ episodeId: 'e', fetchedAt: 2, bodyJson: '{"a":2}' });
    expect(s.socialCache.get('e')).toEqual({ episodeId: 'e', fetchedAt: 2, bodyJson: '{"a":2}' });
    expect(s.socialCache.get('other')).toBeUndefined();
  });

  it('drafts keep the captured moment and clear per episode or all', () => {
    const s = createMemoryStores(testHash);
    s.drafts.put({ episodeId: 'e', body: 'hi', offsetMs: 872000, savedAt: 1 });
    s.drafts.put({ episodeId: 'f', body: 'yo', savedAt: 1 });
    expect(s.drafts.get('e')?.offsetMs).toBe(872000);
    s.drafts.clear('e');
    expect(s.drafts.get('e')).toBeUndefined();
    expect(s.drafts.get('f')?.body).toBe('yo');
    s.drafts.clearAll();
    expect(s.drafts.get('f')).toBeUndefined();
  });
});

describe('explicitSeek stays until synced (M3, R5 rule 2)', () => {
  it('a tick after an unsynced seek keeps the flag; once synced, a tick clears it', () => {
    const s = createMemoryStores(testHash);
    s.positions.save({ episodeId: 'e', offsetMs: 1_193_000, finished: false, explicitSeek: true }, 1);
    const tick = s.positions.save({ episodeId: 'e', offsetMs: 1_253_000, finished: false }, 2);
    expect(tick.explicitSeek).toBe(true);
    s.positions.markSynced('e', tick.progressSeq);
    const later = s.positions.save({ episodeId: 'e', offsetMs: 1_260_000, finished: false }, 3);
    expect(later.explicitSeek).toBe(false);
  });
});

// ---- M2 (migration 003) ----

describe('M2 stores', () => {
  it('queue.replace renumbers and keeps order; downloads list in requestedAt order; active() is the one downloading', () => {
    const s = createMemoryStores(testHash);
    s.queue.replace(['c', 'a', 'b'], 1);
    expect(s.queue.list()).toEqual(['c', 'a', 'b']);
    s.queue.replace(['a'], 2);
    expect(s.queue.list()).toEqual(['a']);
    s.downloads.put({ episodeId: 'y', filePath: '/y', state: 'waiting', bytesDone: 0, allowMobile: false, requestedAt: 2 });
    s.downloads.put({ episodeId: 'x', filePath: '/x', state: 'downloading', bytesDone: 5, allowMobile: false, requestedAt: 1 });
    expect(s.downloads.list().map((d) => d.episodeId)).toEqual(['x', 'y']);
    expect(s.downloads.active()?.episodeId).toBe('x');
    s.downloads.remove('x');
    expect(s.downloads.active()).toBeUndefined();
  });

  it('settings overwrite; speed per show; inbox mark is idempotent (first reason wins); extras round-trip', () => {
    const s = createMemoryStores(testHash);
    s.settings.set('speed.default', '1.2');
    s.settings.set('speed.default', '1.5');
    expect(s.settings.get('speed.default')).toBe('1.5');
    s.speed.set('f', 1.5);
    expect(s.speed.get('f')).toBe(1.5);
    s.speed.clear('f');
    expect(s.speed.get('f')).toBeUndefined();
    s.inboxState.mark('e', 'queued', 1);
    s.inboxState.mark('e', 'dismissed', 2);
    expect(s.inboxState.get('e')).toEqual({ left: 'queued', at: 1 });
    expect([...s.inboxState.all()]).toEqual(['e']);
    s.extras.put({ episodeId: 'e', chaptersJson: '[]', fetchedAt: 3 });
    expect(s.extras.get('e')).toEqual({ episodeId: 'e', chaptersJson: '[]', fetchedAt: 3 });
  });
});
