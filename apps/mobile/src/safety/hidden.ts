/**
 * M6 report / block on the phone (FR-002, FR-005, research R1): the hide is a local
 * row written at once — the screen re-renders from it — and delivered later, once,
 * by `deliver()`. Sign-in refills the delivered rows from the server. Pure
 * orchestration over injected pieces so the tests run without a device.
 */
import { canBlock, canReport, hiddenKey, type TargetKind } from '@socialmorning/social-core';
import { ApiError, type ApiClient } from '../social/api';
import type { HiddenKind, Stores } from '../storage/types';

export type SafetyDeps = {
  api: ApiClient;
  stores: Pick<Stores, 'hidden' | 'blocks' | 'settings'>;
  now: () => number;
  viewerId: () => string | undefined;
  /** The owner's listener id, when the app knows it (never blockable). */
  ownerId?: () => string | undefined;
  /** Called after any local change so screens re-render. */
  onChange?: () => void;
};

export type ReportOutcome = 'hidden' | 'sign_in' | 'own';
export type BlockOutcome = 'blocked' | 'sign_in' | 'self' | 'owner';

const HIDDEN_FEEDS_KEY = 'safety.hiddenFeeds';

export function createSafety(deps: SafetyDeps) {
  let delivering: Promise<void> | undefined;

  const sets = () => ({
    blocked: new Set(deps.stores.blocks.all().filter((b) => b.pending >= 0).map((b) => b.listenerId)),
    hidden: new Set(deps.stores.hidden.all().map((h) => hiddenKey(h.kind as TargetKind, h.id))),
  });

  function hiddenFeeds(): Set<string> {
    const raw = deps.stores.settings.get(HIDDEN_FEEDS_KEY);
    const mine = deps.stores.hidden.all().filter((h) => h.kind === 'show').map((h) => h.id);
    try { return new Set([...(raw ? (JSON.parse(raw) as string[]) : []), ...mine]); } catch { return new Set(mine); }
  }

  /** Report: hidden at once, delivered later. `authorId` is the target's author (null for a show). */
  function report(kind: HiddenKind, id: string, authorId: string | null, reason: string, note?: string): ReportOutcome {
    const why = canReport(deps.viewerId(), kind === 'profile' ? id : authorId);
    if (why !== 'ok') return why;
    deps.stores.hidden.put({ kind, id, reason, ...(note ? { note } : {}), at: deps.now(), pending: true });
    deps.onChange?.();
    void deliver();
    return 'hidden';
  }

  function block(listenerId: string, displayName?: string): BlockOutcome {
    const why = canBlock(deps.viewerId(), listenerId, deps.ownerId?.());
    if (why !== 'ok') return why;
    deps.stores.blocks.put({ listenerId, ...(displayName ? { displayName } : {}), at: deps.now(), pending: 1 });
    deps.onChange?.();
    void deliver();
    return 'blocked';
  }

  function unblock(listenerId: string): void {
    const row = deps.stores.blocks.all().find((b) => b.listenerId === listenerId);
    if (!row) return;
    if (row.pending === 1) deps.stores.blocks.remove(listenerId); // never delivered: just forget it
    else deps.stores.blocks.put({ ...row, at: deps.now(), pending: -1 });
    deps.onChange?.();
    void deliver();
  }

  /** Sends every pending row once. A network failure stops the run; the rows wait. */
  function deliver(): Promise<void> {
    if (delivering) return delivering;
    delivering = (async () => {
      try {
        for (const h of deps.stores.hidden.pending()) {
          try {
            await deps.api.report(h.kind, h.id, h.reason, h.note);
            deps.stores.hidden.markDelivered(h.kind, h.id);
          } catch (e) {
            if (e instanceof ApiError && (e.code === 'network' || e.code === 'locked' || e.code === 'unavailable' || e.code === 'unauthenticated')) return;
            // The server refused it for good (own content, gone, bad id): the local hide stands, nothing to resend.
            deps.stores.hidden.markDelivered(h.kind, h.id);
          }
        }
        for (const b of deps.stores.blocks.pending()) {
          try {
            if (b.pending === 1) { await deps.api.block(b.listenerId); deps.stores.blocks.put({ ...b, pending: 0 }); }
            else { await deps.api.unblock(b.listenerId); deps.stores.blocks.remove(b.listenerId); }
          } catch (e) {
            if (e instanceof ApiError && (e.code === 'network' || e.code === 'locked' || e.code === 'unavailable' || e.code === 'unauthenticated')) return;
            if (b.pending === 1) deps.stores.blocks.remove(b.listenerId); else deps.stores.blocks.put({ ...b, pending: 0 });
          }
        }
      } finally {
        delivering = undefined;
        deps.onChange?.();
      }
    })();
    return delivering;
  }

  /** Sign-in: the server's lists replace the delivered rows; pending rows survive and go out next. */
  async function refill(): Promise<void> {
    const h = await deps.api.hidden();
    deps.stores.hidden.replaceDelivered(h.reported, deps.now());
    deps.stores.blocks.replaceDelivered(h.blocked, deps.now());
    deps.stores.settings.set(HIDDEN_FEEDS_KEY, JSON.stringify(h.hiddenFeeds));
    deps.onChange?.();
    await deliver();
  }

  return {
    report, block, unblock, deliver, refill, sets, hiddenFeeds,
    isHidden: (kind: HiddenKind, id: string) => deps.stores.hidden.has(kind, id),
    isBlocked: (listenerId: string) => deps.stores.blocks.has(listenerId),
    blockedList: () => deps.stores.blocks.all().filter((b) => b.pending >= 0),
  };
}

export type Safety = ReturnType<typeof createSafety>;
