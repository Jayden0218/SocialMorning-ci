// The queue sync rule: given this phone's queue, the server's, and the last one both agreed on, what to do.
/**
 * M22 US4 (research R4, FR-014/015): one queue on every device, "last writer asks".
 *
 *   local       this phone's queue now
 *   server      the account's queue and its version (version 0, [] when it never had one)
 *   lastSynced  the list + version this phone and the server last agreed on; undefined
 *               before this phone's first sync
 *
 * Only one side changed since the last agreement → that side wins (push or pull).
 * Both changed (and differ) → `choose`: the listener picks, never the code (SC-003).
 * An empty list never silently replaces a non-empty one on a pull — not on the first sync
 * (300 here, 0 there: the 300 go up), and not when the account's list became empty while
 * this phone still holds episodes (spec edge case) — that is a `choose`.
 * Pure: no I/O; `test/queue-sync.test.ts` is the spec.
 */
import { QUEUE_MAX } from './queue';

export type QueueSnapshot = { items: readonly string[]; version: number };

export type QueueSyncPlan =
  /** Already the same: remember `version` as agreed. */
  | { kind: 'none'; version: number }
  /** Send `items` with `baseVersion`; the server refuses (409) if it moved meanwhile. */
  | { kind: 'push'; items: readonly string[]; baseVersion: number }
  /** Replace this phone's queue with the account's. */
  | { kind: 'pull'; items: readonly string[]; version: number }
  /** Ask "Which playlist do you want to keep?" — `version` is the server's, the base for a push. */
  | { kind: 'choose'; local: readonly string[]; server: readonly string[]; version: number };

/** Same episodes in the same order. */
export function sameQueue(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function planQueueSync(local: readonly string[], server: QueueSnapshot, lastSynced: QueueSnapshot | undefined): QueueSyncPlan {
  const capped = local.slice(0, QUEUE_MAX);
  const pull: QueueSyncPlan = { kind: 'pull', items: server.items.slice(0, QUEUE_MAX), version: server.version };
  const push: QueueSyncPlan = { kind: 'push', items: capped, baseVersion: server.version };
  const choose: QueueSyncPlan = { kind: 'choose', local: capped, server: server.items.slice(0, QUEUE_MAX), version: server.version };
  if (sameQueue(capped, server.items)) return { kind: 'none', version: server.version };
  if (lastSynced === undefined) {
    // First sync on this phone: the non-empty side wins; two different lists → ask.
    if (capped.length === 0) return pull;
    if (server.items.length === 0) return push;
    return choose;
  }
  const localChanged = !sameQueue(capped, lastSynced.items);
  const serverChanged = server.version !== lastSynced.version;
  if (localChanged && serverChanged) return choose;
  if (localChanged) return push;
  // Local unchanged: the account's list wins — unless it would empty a non-empty queue.
  if (server.items.length === 0) return choose;
  return pull;
}
