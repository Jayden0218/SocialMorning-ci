/**
 * Listening time on the phone (M4 FR-012, research R3). TICKs feed `addTick`; a stop,
 * seek, load, background or day change closes the open interval into the
 * `listened` store (union per episode-day); `push()` sends every dirty day as this
 * phone's whole merged set and marks it pushed. The server unions across phones.
 */
import { addTick, closeAcc, type ListenAcc, type Range } from '@socialmorning/social-core';
import type { ApiClient } from '../social/api';
import type { ListenedStore } from '../storage/types';

export type ListenedDeps = {
  api: ApiClient;
  store: ListenedStore;
  deviceId: () => string | undefined;
  isSignedIn: () => boolean;
  now: () => number;
  /** The phone's local calendar day, YYYY-MM-DD. */
  today?: (nowMs: number) => string;
};

export const localDay = (nowMs: number): string => {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function createListened(deps: ListenedDeps) {
  const today = deps.today ?? localDay;
  let acc: ListenAcc | undefined;
  let accDay: string | undefined;
  let pushing: Promise<number> | undefined;

  /**
   * Writes what is accumulated into the store. `keepOpen` (a push, not a stop) leaves the
   * interval open at its last position so the next tick continues it — G3 on build 10
   * (2026-09-22): the 30-s upload timer closed it 13 times in 10 minutes and the ~750 ms
   * between the last tick before and the first tick after each push was lost, 9.8 s in all.
   */
  function flushAcc(keepOpen = false): void {
    if (acc === undefined || accDay === undefined) return;
    const ranges = closeAcc(acc);
    if (ranges.length > 0) deps.store.addRanges(acc.episodeId, accDay, ranges);
    if (keepOpen && acc.open !== undefined) {
      const at = acc.open[1];
      acc = { episodeId: acc.episodeId, open: [at, at], closed: [] };
      return;
    }
    acc = undefined;
    accDay = undefined;
  }

  return {
    /** Wire to PlayerDeps.onTick. */
    onTick(episodeId: string, positionMs: number): void {
      const day = today(deps.now());
      if (acc !== undefined && (acc.episodeId !== episodeId || accDay !== day)) flushAcc();
      acc = addTick(acc, episodeId, positionMs);
      accDay = day;
    },
    /** A stop, seek, load, background, or sign-out: close what is open into the store. */
    close(): void { flushAcc(); },
    /** What this phone would send right now (after closing the open interval). */
    pending(): { episodeId: string; day: string; ranges: Range[] }[] {
      flushAcc(true);
      return deps.store.dirty().map((r) => ({ episodeId: r.episodeId, day: r.day, ranges: r.ranges }));
    },
    /** Sends every dirty day; resolves with how many were accepted (0 when offline, signed out, or nothing to send). */
    async push(): Promise<number> {
      if (pushing) return pushing;
      pushing = (async () => {
        flushAcc(true); // into the store first: what cannot be sent now is kept for later; playing goes on
        const device = deps.deviceId();
        if (!device || !deps.isSignedIn()) return 0;
        const days = deps.store.dirty();
        if (days.length === 0) return 0;
        try {
          const r = await deps.api.putListened(device, days.map((d) => ({ episodeId: d.episodeId, day: d.day, ranges: d.ranges })));
          deps.store.markPushed(days.map((d) => ({ episodeId: d.episodeId, day: d.day })));
          return r.accepted;
        } catch { return 0; }
      })();
      try { return await pushing; } finally { pushing = undefined; }
    },
  };
}

export type Listened = ReturnType<typeof createListened>;
