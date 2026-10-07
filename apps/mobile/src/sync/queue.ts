// Syncs your playlist with your account, and asks which one to keep when two phones changed it.
/**
 * M22 US4 (research R4, FR-014..016). The queue stays in SQLite (`stores.queue`) and every
 * screen keeps writing it there; this module compares it with the account's on a schedule:
 * at app start, when the app comes back to the front, and every 60 s while it is open — only
 * when signed in (signed out, the queue stays on this phone as before).
 *
 *   rule:      player-core `planQueueSync(local, server, lastSynced)` — push / pull / none / choose.
 *   agreed:    settings `queue.synced` = `{ listenerId, items, version }`, the list and version this
 *              phone and the account last agreed on (another account → a first sync again).
 *   conflict:  `choose`, or a 409 on a push, holds a pending choice and tells the chooser sheet
 *              ("Which playlist do you want to keep?"). Nothing is replaced until the listener
 *              picks. The list not kept is saved to `queue_backups` (newest 10).
 *   restore:   a backup replaces the queue (the current one is saved first) and syncs at once.
 *
 * Pure over injected pieces; `__tests__/queue-sync.test.ts` is the spec.
 */
import { planQueueSync, type QueueSnapshot } from '@socialmorning/player-core';
import type { PutQueueResult, ServerQueue } from '@/social/api-m22-library';
import type { QueueBackupStore, QueueStore, SettingsStore } from '@/storage/types';

export const QUEUE_SYNC_EVERY_MS = 60_000;
export const SYNCED_KEY = 'queue.synced';
/** data-model: the agreed version also stands alone under this key. */
export const VERSION_KEY = 'queue.version';
export const BACKUPS_KEEP = 10;

export type QueueChoice = {
  local: string[];
  server: string[];
  /** The device that last wrote the account's list, when the server knows it. */
  serverDevice: string | null;
  /** The account's version: the base for keeping this phone's list. */
  version: number;
};

export type QueueSyncDeps = {
  api: {
    getQueue(): Promise<ServerQueue>;
    putQueue(items: readonly string[], baseVersion: number, deviceId: string): Promise<PutQueueResult>;
  };
  queue: QueueStore;
  backups: QueueBackupStore;
  settings: SettingsStore;
  /** The signed-in listener's id, or undefined when signed out. */
  listenerId: () => string | undefined;
  deviceId: () => string | undefined;
  now: () => number;
};

export type QueueSync = {
  /** One round: read the account's list, then push, pull, nothing, or hold a choice. */
  sync(): Promise<void>;
  /** The listener's answer to the chooser. */
  choose(keep: 'local' | 'server'): Promise<void>;
  /** A backup replaces the queue; the current queue is saved first; then a sync pushes it. */
  restore(backupId: number): Promise<void>;
  /** The choice waiting for the listener, if any. */
  pending(): QueueChoice | undefined;
  /** Called whenever the pending choice appears or goes; returns an unsubscribe. */
  subscribe(fn: () => void): () => void;
};

type Agreed = QueueSnapshot & { listenerId: string };

export function readAgreed(settings: Pick<SettingsStore, 'get'>, listenerId: string): QueueSnapshot | undefined {
  try {
    const v = JSON.parse(settings.get(SYNCED_KEY) ?? 'null') as Partial<Agreed> | null;
    if (!v || v.listenerId !== listenerId || !Array.isArray(v.items) || typeof v.version !== 'number') return undefined;
    return { items: v.items.filter((i): i is string => typeof i === 'string'), version: v.version };
  } catch { return undefined; }
}

export function createQueueSync(deps: QueueSyncDeps): QueueSync {
  let choice: QueueChoice | undefined;
  let running: Promise<void> | undefined;
  const subscribers = new Set<() => void>();
  const changed = () => { for (const fn of subscribers) fn(); };

  const agree = (listenerId: string, items: readonly string[], version: number) => {
    const row: Agreed = { listenerId, items: [...items], version };
    deps.settings.set(SYNCED_KEY, JSON.stringify(row));
    deps.settings.set(VERSION_KEY, String(version));
  };
  const hold = (next: QueueChoice) => { choice = next; changed(); };
  const backup = (items: readonly string[], device: string | null, reason: 'chooser' | 'restore') => {
    if (items.length > 0) deps.backups.add({ items: [...items], device, reason, createdAt: deps.now() }, BACKUPS_KEEP);
  };

  async function push(listenerId: string, deviceId: string, items: readonly string[], baseVersion: number): Promise<void> {
    const r = await deps.api.putQueue(items, baseVersion, deviceId);
    if (r.ok) { agree(listenerId, items, r.version); return; }
    // The account moved on meanwhile (409): ask, with the account's current list.
    hold({ local: [...items], server: r.server.items, serverDevice: r.server.deviceId, version: r.server.version });
  }

  async function round(): Promise<void> {
    const listenerId = deps.listenerId();
    const deviceId = deps.deviceId();
    if (listenerId === undefined || deviceId === undefined || choice !== undefined) return;
    const server = await deps.api.getQueue();
    const local = deps.queue.list();
    const plan = planQueueSync(local, server, readAgreed(deps.settings, listenerId));
    switch (plan.kind) {
      case 'none': agree(listenerId, server.items, plan.version); return;
      case 'pull': deps.queue.replace(plan.items, deps.now()); agree(listenerId, plan.items, plan.version); return;
      case 'push': await push(listenerId, deviceId, plan.items, plan.baseVersion); return;
      case 'choose': hold({ local: [...plan.local], server: [...plan.server], serverDevice: server.deviceId, version: plan.version });
    }
  }

  const sync = (): Promise<void> => {
    if (running) return running;
    running = round().finally(() => { running = undefined; });
    return running;
  };

  return {
    sync,
    async choose(keep) {
      const c = choice;
      const listenerId = deps.listenerId();
      const deviceId = deps.deviceId();
      if (c === undefined || listenerId === undefined || deviceId === undefined) return;
      choice = undefined;
      changed();
      if (keep === 'server') {
        backup(deps.queue.list(), 'This phone', 'chooser');
        deps.queue.replace(c.server, deps.now());
        agree(listenerId, c.server, c.version);
        return;
      }
      backup(c.server, c.serverDevice, 'chooser');
      // This phone's list as it is now (it may have changed while the sheet was up).
      await push(listenerId, deviceId, deps.queue.list(), c.version);
    },
    async restore(backupId) {
      const b = deps.backups.get(backupId);
      if (!b) return;
      backup(deps.queue.list(), 'This phone', 'restore');
      deps.queue.replace(b.items, deps.now());
      await sync().catch(() => undefined);
    },
    pending: () => choice,
    subscribe(fn) { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
  };
}
