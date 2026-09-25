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
import type { ApiClient, SubscriptionOut } from '../social/api';
import type { SubscriptionRow, SubscriptionStore } from '../storage/types';

export type SubscriptionSyncDeps = {
  api: ApiClient;
  subscriptions: SubscriptionStore;
  isSignedIn: () => boolean;
};

export type SubscriptionSync = {
  /** Upload everything, take the merged set back, replace the local table. */
  reconcile(): Promise<void>;
  /** Fire-and-forget after a local subscribe/unsubscribe. Never throws. */
  push(): void;
};

export const toWire = (r: SubscriptionRow): SubscriptionOut => ({
  feedUrl: r.feedUrl,
  createdAt: new Date(r.subscribedAt).toISOString(),
  ...(r.deletedAt === undefined ? {} : { deletedAt: new Date(r.deletedAt).toISOString() }),
  starred: r.starred,
});

export const fromWire = (i: SubscriptionOut): SubscriptionRow => ({
  feedUrl: i.feedUrl,
  subscribedAt: new Date(i.createdAt).getTime(),
  ...(i.deletedAt === undefined ? {} : { deletedAt: new Date(i.deletedAt).getTime() }),
  starred: i.starred,
});

export function createSubscriptionSync(deps: SubscriptionSyncDeps): SubscriptionSync {
  let inFlight: Promise<void> | undefined;

  async function run(): Promise<void> {
    if (!deps.isSignedIn()) return;
    const local = deps.subscriptions.all();
    const res = await deps.api.putSubscriptions(local.map(toWire));
    deps.subscriptions.replaceAll(res.items.map(fromWire));
  }

  return {
    reconcile() {
      // One at a time: two overlapping full-set merges would race on replaceAll.
      inFlight = (inFlight ?? Promise.resolve()).then(run, run);
      return inFlight;
    },
    push() {
      void this.reconcile().catch(() => undefined);
    },
  };
}
