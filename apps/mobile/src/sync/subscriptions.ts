// Syncs your subscribed shows with the server.
/**
 * M8 US1 — subscription sync (FR-001..FR-004, research R1).
 *
 *   push:      on every subscribe and unsubscribe, best effort.
 *   reconcile: at launch when signed in, and at sign-in. Upload the whole local set
 *              (tombstones included), take the server's merged set back, replace the
 *              local table with it.
 *   offline:   the local write already happened. Nothing here blocks it, and nothing is
 *              lost: the next reconcile carries it (FR-003).
 *
 * The merge itself is the SERVER's, exactly as M2 decided for positions — one merge
 * point, not two implementations that can disagree. The rule is in
 * `apps/api/src/db/repos/subscriptions.ts`: later stamp wins, a tie keeps the tombstone.
 *
 * Why a tombstone at all: a deleted row cannot sync. Phone A unsubscribes, phone B still
 * holds the row, and B's next reconcile puts the show back (guard G-M2).
 */
import { reportAndDrop } from '@/telemetry/reportError';
import type { ApiClient, SubscriptionOut } from '@/social/api';
import type { SubscriptionRow, SubscriptionStore } from '@/storage/types';

export type SubscriptionSyncDeps = {
  api: ApiClient;
  subscriptions: SubscriptionStore;
  isSignedIn: () => boolean;
  /** 035: when a reconcile fails (a slow or unreachable server), try again `afterMs` later, up to `times` more times, each a little later than the last. */
  retry?: { afterMs: number; times: number; setTimeout: (fn: () => void, ms: number) => unknown };
};

export type SubscriptionSync = {
  /** Upload everything, take the merged set back, replace the local table. */
  reconcile(): Promise<void>;
  /** Fire-and-forget after a local subscribe/unsubscribe. Never throws. */
  push(): void;
  /** 035: called after each reconcile has replaced the local table (a page that read it earlier re-reads). Returns the way to stop. */
  onChange(listener: () => void): () => void;
};

export const toWire = (r: SubscriptionRow): SubscriptionOut => ({
  feedUrl: r.feedUrl,
  createdAt: new Date(r.subscribedAt).toISOString(),
  ...(r.deletedAt === undefined ? {} : { deletedAt: new Date(r.deletedAt).toISOString() }),
  starred: r.starred,
  ...(r.starredAt === undefined ? {} : { starredAt: new Date(r.starredAt).toISOString() }),
});

export const fromWire = (i: SubscriptionOut): SubscriptionRow => ({
  feedUrl: i.feedUrl,
  subscribedAt: new Date(i.createdAt).getTime(),
  ...(i.deletedAt === undefined ? {} : { deletedAt: new Date(i.deletedAt).getTime() }),
  starred: i.starred,
  ...(i.starredAt === undefined ? {} : { starredAt: new Date(i.starredAt).getTime() }),
});

export function createSubscriptionSync(deps: SubscriptionSyncDeps): SubscriptionSync {
  let inFlight: Promise<void> | undefined;
  const listeners = new Set<() => void>();

  // A failed reconcile is tried again in the background (bounded): a slow server delays the table instead of leaving it empty (device run 41385187706, r22).
  let retryPending = false; // one chain at a time: overlapping failures must not stack several
  function retryLater(done: number): void {
    const r = deps.retry;
    if (!r || done >= r.times || retryPending) return;
    retryPending = true;
    r.setTimeout(() => {
      retryPending = false;
      const p = (inFlight ?? Promise.resolve()).then(run, run);
      inFlight = p;
      p.catch(() => retryLater(done + 1));
    }, r.afterMs * (done + 1));
  }

  async function run(): Promise<void> {
    if (!deps.isSignedIn()) return;
    const local = deps.subscriptions.all();
    const res = await deps.api.putSubscriptions(local.map(toWire));
    deps.subscriptions.replaceAll(res.items.map(fromWire));
    for (const l of listeners) l();
  }

  return {
    reconcile() {
      // One at a time: two overlapping full-set merges would race on replaceAll.
      inFlight = (inFlight ?? Promise.resolve()).then(run, run);
      inFlight.catch(() => retryLater(0));
      return inFlight;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    push() {
      void this.reconcile().catch(reportAndDrop('sync.subscriptions'));
    },
  };
}
