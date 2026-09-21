/**
 * In-memory implementations of the four stores (contracts/stores.ts).
 *
 * These are the test doubles, and they are the reason the reducer plus the
 * whole persistence path can be exercised in Node with no device. They must
 * behave the same way `sqlite.ts` does on every rule the requirements name —
 * `progressSeq` monotonicity, FR-023, list ordering — or the tests certify
 * the double rather than the app.
 */
import { mergeRanges } from '@socialmorning/social-core';
import { episodeId } from './schema';
import type {
  AuthRow,
  AuthStore,
  CachedEpisode,
  CachedShow,
  DownloadRow,
  DownloadStore,
  DraftRow,
  DraftStore,
  ExtrasRow,
  ExtrasStore,
  PendingClipRow,
  PendingClipStore,
  ListenedRow,
  ListenedStore,
  FeedCacheRow,
  FeedCacheStore,
  FeedCache,
  InboxLeft,
  InboxStateStore,
  QueueStore,
  SettingsStore,
  SpeedStore,
  PositionRow,
  PositionStore,
  SessionStore,
  SocialCacheRow,
  SocialCacheStore,
  Stores,
  SubscriptionStore,
} from './types';
import type { ParsedFeed } from '@socialmorning/feed-parser';

export function createMemoryPositionStore(): PositionStore {
  const rows = new Map<string, PositionRow>();
  return {
    get: (id) => rows.get(id),
    save(p, now) {
      const previous = rows.get(p.episodeId);
      // M3: a seek's flag stays until the server has seen it — otherwise the next
      // 5 s tick would erase the one fact that lets a backwards move win (R5 rule 2).
      const unsyncedSeek = previous !== undefined && previous.explicitSeek && previous.syncedSeq < previous.progressSeq;
      const row: PositionRow = {
        ...p,
        explicitSeek: (p.explicitSeek ?? false) || unsyncedSeek,
        updatedAt: now,
        // Strictly increasing, and never derived from the clock: two saves in
        // the same millisecond must still be orderable.
        progressSeq: (previous?.progressSeq ?? 0) + 1,
        syncedSeq: previous?.syncedSeq ?? 0,
      };
      rows.set(p.episodeId, row);
      return row;
    },
    all: () => [...rows.values()],
    unsynced: () => [...rows.values()].filter((r) => r.syncedSeq < r.progressSeq),
    markSynced(episodeId, progressSeq) {
      const r = rows.get(episodeId);
      if (r && progressSeq > r.syncedSeq) rows.set(episodeId, { ...r, syncedSeq: progressSeq });
    },
    applyRemote(p, now) {
      const previous = rows.get(p.episodeId);
      const unchanged = previous && previous.offsetMs === p.offsetMs && previous.finished === p.finished;
      const progressSeq = unchanged ? previous.progressSeq : (previous?.progressSeq ?? 0) + 1;
      const row: PositionRow = {
        episodeId: p.episodeId,
        offsetMs: p.offsetMs,
        ...(previous?.durationMsAtSave !== undefined ? { durationMsAtSave: previous.durationMsAtSave } : {}),
        finished: p.finished,
        explicitSeek: p.explicitSeek,
        updatedAt: now,
        progressSeq,
        // The server just told us this; it is synced by definition.
        syncedSeq: progressSeq,
      };
      rows.set(p.episodeId, row);
      return row;
    },
  };
}

export function createMemoryAuthStore(): AuthStore {
  let row: AuthRow | undefined;
  return {
    get: () => row,
    set: (a, now) => void (row = { ...a, signedInAt: now }),
    clear: () => void (row = undefined),
  };
}

export function createMemorySocialCacheStore(): SocialCacheStore {
  const rows = new Map<string, SocialCacheRow>();
  return { get: (id) => rows.get(id), put: (r) => void rows.set(r.episodeId, r) };
}

export function createMemoryDraftStore(): DraftStore {
  const rows = new Map<string, DraftRow>();
  return {
    get: (id) => rows.get(id),
    put: (r) => void rows.set(r.episodeId, r),
    clear: (id) => void rows.delete(id),
    clearAll: () => rows.clear(),
  };
}

export function createMemorySubscriptionStore(): SubscriptionStore {
  const rows = new Map<string, number>();
  return {
    list: () => [...rows.entries()].map(([feedUrl, subscribedAt]) => ({ feedUrl, subscribedAt })),
    add(feedUrl, now) {
      if (!rows.has(feedUrl)) rows.set(feedUrl, now);
    },
    // FR-023: this touches subscriptions and nothing else. No position is
    // reachable from here, which is the point.
    remove: (feedUrl) => void rows.delete(feedUrl),
    has: (feedUrl) => rows.has(feedUrl),
  };
}

/** Newest first; an episode with no date sorts last, never first (FR-002). */
export function byNewestFirst(a: { publishedAt?: number }, b: { publishedAt?: number }): number {
  if (a.publishedAt === undefined && b.publishedAt === undefined) return 0;
  if (a.publishedAt === undefined) return 1;
  if (b.publishedAt === undefined) return -1;
  return b.publishedAt - a.publishedAt;
}

export function createMemoryFeedCache(hash: (s: string) => string): FeedCache {
  const shows = new Map<string, CachedShow>();
  const episodes = new Map<string, CachedEpisode>();
  return {
    getShow: (feedUrl) => shows.get(feedUrl),
    getEpisode: (id) => episodes.get(id),
    listEpisodes: (feedUrl) =>
      [...episodes.values()].filter((e) => e.feedUrl === feedUrl).sort(byNewestFirst),
    put(feedUrl, parsed: ParsedFeed, http, now) {
      shows.set(feedUrl, {
        ...parsed.show,
        fetchedAt: now,
        ...(http.etag !== undefined && { etag: http.etag }),
        ...(http.lastModified !== undefined && { lastModified: http.lastModified }),
        lastWarnings: parsed.warnings,
      });
      for (const existing of [...episodes.values()]) {
        if (existing.feedUrl === feedUrl) episodes.delete(existing.id);
      }
      for (const episode of parsed.episodes) {
        const id = episodeId(feedUrl, episode.guid, hash);
        episodes.set(id, { ...episode, id, feedUrl });
      }
    },
  };
}

export function createMemorySessionStore(): SessionStore {
  let row: { episodeId?: string; intent: 'play' | 'pause'; updatedAt: number } | undefined;
  return {
    get: () => row,
    // One row, replaced. `session` is CHECK (id = 1) in SQL for the same reason.
    set: (s, now) => void (row = { ...s, updatedAt: now }),
  };
}

// ---- M2 ----

export function createMemoryDownloadStore(): DownloadStore {
  const rows = new Map<string, DownloadRow>();
  return {
    get: (id) => rows.get(id),
    put: (r) => void rows.set(r.episodeId, r),
    list: () => [...rows.values()].sort((a, b) => a.requestedAt - b.requestedAt),
    remove: (id) => void rows.delete(id),
    active: () => [...rows.values()].find((r) => r.state === 'downloading'),
  };
}

export function createMemoryQueueStore(): QueueStore {
  let ids: string[] = [];
  return {
    list: () => [...ids],
    replace: (next) => void (ids = [...next]),
  };
}

export function createMemorySpeedStore(): SpeedStore {
  const rows = new Map<string, number>();
  return { get: (f) => rows.get(f), set: (f, r) => void rows.set(f, r), clear: (f) => void rows.delete(f) };
}

export function createMemorySettingsStore(): SettingsStore {
  const rows = new Map<string, string>();
  return { get: (k) => rows.get(k), set: (k, v) => void rows.set(k, v) };
}

export function createMemoryInboxStateStore(): InboxStateStore {
  const rows = new Map<string, { left: InboxLeft; at: number }>();
  return {
    get: (id) => rows.get(id),
    mark(id, left, now) {
      if (!rows.has(id)) rows.set(id, { left, at: now });
    },
    all: () => new Set(rows.keys()),
  };
}

export function createMemoryExtrasStore(): ExtrasStore {
  const rows = new Map<string, ExtrasRow>();
  return { get: (id) => rows.get(id), put: (r) => void rows.set(r.episodeId, r) };
}

export function createMemoryPendingClipStore(): PendingClipStore {
  const rows = new Map<string, PendingClipRow>();
  const sorted = () => [...rows.values()].sort((a, b) => a.createdAt - b.createdAt);
  return {
    list: sorted,
    listForEpisode: (id) => sorted().filter((r) => r.episodeId === id),
    put: (r) => void rows.set(r.clientId, r),
    remove: (id) => void rows.delete(id),
  };
}

export function createMemoryListenedStore(): ListenedStore {
  const rows = new Map<string, ListenedRow>();
  const key = (e: string, d: string) => `${e}\u0000${d}`;
  return {
    get: (e, d) => rows.get(key(e, d)),
    addRanges(e, d, ranges) {
      const cur = rows.get(key(e, d));
      const merged = mergeRanges([...(cur?.ranges ?? []), ...ranges]).map((r): [number, number] => [r[0], r[1]]);
      rows.set(key(e, d), { episodeId: e, day: d, ranges: merged, dirty: true });
    },
    dirty: () => [...rows.values()].filter((r) => r.dirty),
    markPushed(keys) {
      for (const k of keys) {
        const cur = rows.get(key(k.episodeId, k.day));
        if (cur) rows.set(key(k.episodeId, k.day), { ...cur, dirty: false });
      }
    },
  };
}

export function createMemoryFeedCacheStore(): FeedCacheStore {
  const rows = new Map<string, FeedCacheRow>();
  return { get: (k) => rows.get(k), set: (r) => void rows.set(r.key, r) };
}

export function createMemoryStores(hash: (s: string) => string): Stores {
  return {
    positions: createMemoryPositionStore(),
    subscriptions: createMemorySubscriptionStore(),
    feeds: createMemoryFeedCache(hash),
    session: createMemorySessionStore(),
    auth: createMemoryAuthStore(),
    socialCache: createMemorySocialCacheStore(),
    drafts: createMemoryDraftStore(),
    downloads: createMemoryDownloadStore(),
    queue: createMemoryQueueStore(),
    speed: createMemorySpeedStore(),
    settings: createMemorySettingsStore(),
    inboxState: createMemoryInboxStateStore(),
    extras: createMemoryExtrasStore(),
    pendingClips: createMemoryPendingClipStore(),
    listened: createMemoryListenedStore(),
    feedCache: createMemoryFeedCacheStore(),
  };
}
