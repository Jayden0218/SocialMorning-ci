/**
 * The storage contracts (specs/001-m1-it-plays/contracts/stores.ts).
 *
 * Everything is SYNCHRONOUS on purpose: the reducer's effects run on the JS
 * thread and a `savePosition` that returned a promise would let the app be
 * killed between the effect and the write — which is the exact thing FR-016
 * exists to prevent.
 *
 * Two implementations satisfy these: `sqlite.ts` on the device and
 * `memory.ts` in the tests. Nothing above this layer knows which it has.
 */
import type { Episode, FeedWarning, ParsedFeed, Show } from '@socialmorning/feed-parser';

export type CachedShow = Show & {
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
  lastWarnings: FeedWarning[];
};

export type CachedEpisode = Episode & { id: string; feedUrl: string };

export type PositionRow = {
  episodeId: string;
  offsetMs: number;
  durationMsAtSave?: number;
  finished: boolean;
  updatedAt: number;
  /**
   * Monotonic per row. The constitution is explicit that last-write-wins on a
   * wall clock is the wrong merge rule, so M3's sync will key on `updatedAt`
   * PLUS this. It exists in the first migration because retrofitting it means
   * every row already written has no ordering information at all.
   */
  progressSeq: number;
  /** M3 (research R5): true when this row was written by a listener's deliberate SEEK. */
  explicitSeek: boolean;
  /** M3: the last `progressSeq` the server accepted. `< progressSeq` ⇒ needs upload. */
  syncedSeq: number;
};

export interface PositionStore {
  get(episodeId: string): PositionRow | undefined;
  /**
   * Increments `progressSeq`; never decreases it. `explicitSeek` defaults to false but
   * stays true from an earlier save until that row has been synced (M3, R5 rule 2).
   */
  save(
    p: Omit<PositionRow, 'progressSeq' | 'updatedAt' | 'syncedSeq' | 'explicitSeek'> & { explicitSeek?: boolean },
    now: number,
  ): PositionRow;
  all(): PositionRow[];
  /** M3: rows with `syncedSeq < progressSeq`. */
  unsynced(): PositionRow[];
  /** M3: records that the server accepted `progressSeq` for this episode. */
  markSynced(episodeId: string, progressSeq: number): void;
  /**
   * M3 (FR-029): the server's answer, already merged with `mergePosition`. Writes the row
   * WITHOUT bumping `progressSeq` when the offset is unchanged, so a server echo does not
   * queue itself for re-upload.
   */
  applyRemote(p: { episodeId: string; offsetMs: number; finished: boolean; explicitSeek: boolean }, now: number): PositionRow;
}

export type SubscriptionRow = { feedUrl: string; subscribedAt: number; deletedAt?: number; starred: boolean };

export interface SubscriptionStore {
  /** The LIVE subscriptions. Tombstones are never in here (M8, guard G-M1). */
  list(): { feedUrl: string; subscribedAt: number }[];
  add(feedUrl: string, now: number): void;
  /**
   * FR-023: MUST NOT touch PositionStore. Positions outlive subscriptions.
   * M8: this writes a TOMBSTONE rather than deleting the row. A deleted row cannot sync —
   * the other phone still holds it and its next reconcile would put the show back.
   */
  remove(feedUrl: string, now?: number): void;
  has(feedUrl: string): boolean;
  /** Everything including tombstones — what the sync uploads (M8 US1). */
  all(): SubscriptionRow[];
  /** Replace the whole table with the server's merged set (M8 US1, FR-002). */
  replaceAll(rows: readonly SubscriptionRow[]): void;
}

export interface FeedCache {
  getShow(feedUrl: string): CachedShow | undefined;
  /** Newest first, undated last (FR-002). */
  listEpisodes(feedUrl: string): CachedEpisode[];
  getEpisode(id: string): CachedEpisode | undefined;
  put(
    feedUrl: string,
    parsed: ParsedFeed,
    http: { etag?: string; lastModified?: string },
    now: number,
  ): void;
}

export interface SessionStore {
  get(): { episodeId?: string; intent: 'play' | 'pause'; updatedAt: number } | undefined;
  set(s: { episodeId?: string; intent: 'play' | 'pause' }, now: number): void;
}

/** M3: the signed-in listener as the UI shows them. The token is in expo-secure-store. */
export type AuthRow = { listenerId: string; displayName: string; email: string; signedInAt: number };

export interface AuthStore {
  get(): AuthRow | undefined;
  set(a: Omit<AuthRow, 'signedInAt'>, now: number): void;
  clear(): void;
}

/** M3 (FR-032): the last successful GET /episodes/:id/social, per episode. */
export type SocialCacheRow = { episodeId: string; etag?: string; fetchedAt: number; bodyJson: string };

export interface SocialCacheStore {
  get(episodeId: string): SocialCacheRow | undefined;
  put(row: SocialCacheRow): void;
}

/** M3 (US1 #6): a comment being written, with its captured moment. */
export type DraftRow = { episodeId: string; body: string; offsetMs?: number; parentId?: string; savedAt: number };

export interface DraftStore {
  get(episodeId: string): DraftRow | undefined;
  put(row: DraftRow): void;
  clear(episodeId: string): void;
  clearAll(): void;
}

// ---- M2 (migration 003) ----

export type DownloadState = 'waiting' | 'downloading' | 'paused' | 'complete' | 'failed';
export type DownloadRow = {
  episodeId: string;
  filePath: string;
  state: DownloadState;
  bytesDone: number;
  bytesTotal?: number;
  resumeData?: string;
  allowMobile: boolean;
  requestedAt: number;
  completedAt?: number;
  error?: string;
};

export interface DownloadStore {
  get(episodeId: string): DownloadRow | undefined;
  put(row: DownloadRow): void;
  /** Every row, in `requestedAt` order. */
  list(): DownloadRow[];
  remove(episodeId: string): void;
  /** The one row in state `downloading`, if any (FR-001a). */
  active(): DownloadRow | undefined;
}

export interface QueueStore {
  /** Episode ids in play order (index 0 = next). */
  list(): string[];
  /** Replaces the whole order, renumbering 0..n-1. The 300 cap is player-core's job. */
  replace(ids: readonly string[], now: number): void;
}

export interface SpeedStore {
  get(feedUrl: string): number | undefined;
  set(feedUrl: string, rate: number): void;
  clear(feedUrl: string): void;
}

export interface SettingsStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export type InboxLeft = 'played' | 'queued' | 'downloaded' | 'dismissed';

export interface InboxStateStore {
  get(episodeId: string): { left: InboxLeft; at: number } | undefined;
  /** Idempotent: the first reason wins. */
  mark(episodeId: string, left: InboxLeft, now: number): void;
  all(): Set<string>;
}

export type ExtrasRow = { episodeId: string; chaptersJson?: string; transcriptJson?: string; fetchedAt: number; error?: string };

export interface ExtrasStore {
  get(episodeId: string): ExtrasRow | undefined;
  put(row: ExtrasRow): void;
}

// ---- M4 (migration 004) ----

export type PendingClipRow = { clientId: string; episodeId: string; startMs: number; endMs: number; caption: string; createdAt: number; attempts: number; lastError?: string };

export interface PendingClipStore {
  list(): PendingClipRow[];
  listForEpisode(episodeId: string): PendingClipRow[];
  put(row: PendingClipRow): void;
  remove(clientId: string): void;
}

export type ListenedRow = { episodeId: string; day: string; ranges: [number, number][]; dirty: boolean };

export interface ListenedStore {
  get(episodeId: string, day: string): ListenedRow | undefined;
  /** Merges `ranges` into the row (union), marks it dirty. */
  addRanges(episodeId: string, day: string, ranges: readonly (readonly [number, number])[]): void;
  dirty(): ListenedRow[];
  markPushed(keys: readonly { episodeId: string; day: string }[]): void;
}

export type FeedCacheRow = { key: string; etag?: string; fetchedAt: number; body: string };

export interface FeedCacheStore {
  get(key: string): FeedCacheRow | undefined;
  set(row: FeedCacheRow): void;
}

// ---- M6 (migration 005) ----

export type HiddenKind = 'comment' | 'clip' | 'profile' | 'show';
/** `pending`: 1 = the report is not yet delivered; 0 = the server has it. */
export type HiddenRow = { kind: HiddenKind; id: string; reason: string; note?: string; at: number; pending: boolean };

export interface HiddenStore {
  has(kind: HiddenKind, id: string): boolean;
  all(): HiddenRow[];
  /** Idempotent: a second report of the same target keeps the first row (FR-003). */
  put(row: HiddenRow): void;
  pending(): HiddenRow[];
  markDelivered(kind: HiddenKind, id: string): void;
  /** Replaces every non-pending row with the server's list (sign-in refill); pending rows stay. */
  replaceDelivered(rows: readonly { kind: HiddenKind; id: string }[], now: number): void;
  clearAll(): void;
}

/** `pending`: 1 = block not yet delivered; -1 = unblock not yet delivered; 0 = in sync. */
export type BlockRow = { listenerId: string; displayName?: string; at: number; pending: 1 | 0 | -1 };

export interface BlockStore {
  has(listenerId: string): boolean;
  all(): BlockRow[];
  put(row: BlockRow): void;
  remove(listenerId: string): void;
  pending(): BlockRow[];
  replaceDelivered(rows: readonly { id: string; displayName?: string }[], now: number): void;
  clearAll(): void;
}

export type Stores = {
  positions: PositionStore;
  subscriptions: SubscriptionStore;
  feeds: FeedCache;
  session: SessionStore;
  auth: AuthStore;
  socialCache: SocialCacheStore;
  drafts: DraftStore;
  downloads: DownloadStore;
  queue: QueueStore;
  speed: SpeedStore;
  settings: SettingsStore;
  inboxState: InboxStateStore;
  extras: ExtrasStore;
  pendingClips: PendingClipStore;
  listened: ListenedStore;
  feedCache: FeedCacheStore;
  hidden: HiddenStore;
  blocks: BlockStore;
};
