/**
 * Position sync (US6, FR-025..029, research R5/R9).
 *
 *   uploads: every 30 s while playing (a timer the caller ticks), and at once on
 *            'stop' | 'seek' | 'finished' | 'background'. Never while paused.
 *   what:    every local row with syncedSeq < progressSeq, ≤ 100 per call.
 *   reply:   the SERVER is the merge point (research R5: it has the receipt clock).
 *            Each returned row is applied with `applyRemote` unless the local row has
 *            progress the server has not seen yet (a save during the round trip, or
 *            an upload that has not happened). The phone never re-runs the merge with
 *            its own rows stamped receivedAt=0 — that was the S9-row-4 clobber on
 *            2026-09-21 (20:53 became 45:29 after a relaunch).
 *   failure: retry at M1's 2/4/8/16/30/30 s; the local row is untouched.
 *   404:     the server does not know the episode → register it once, retry once.
 *
 * Pure over injected pieces; `__tests__/position-sync.test.ts` (A19, A20) is the spec.
 */
import type { ApiClient, EpisodeRegistration, PositionRowOut } from '../social/api';
import { ApiError } from '../social/api';
import type { PositionRow, PositionStore } from '../storage/types';
import type { SaveReason } from '../playback/types';

export const UPLOAD_EVERY_MS = 30_000;
export const RETRY_SCHEDULE_MS = [2_000, 4_000, 8_000, 16_000, 30_000, 30_000] as const;
export const IMMEDIATE: ReadonlySet<SaveReason> = new Set(['stop', 'seek', 'finished', 'background']);

export type SyncDeps = {
  api: ApiClient;
  positions: PositionStore;
  deviceId: string;
  isSignedIn: () => boolean;
  now: () => number;
  registration: (episodeId: string) => EpisodeRegistration | undefined;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
};

export type PositionSync = {
  /** Wire to PlayerDeps.onPositionSaved. */
  onSaved(row: PositionRow, reason: SaveReason): void;
  /** The 30 s timer tick while playing (the adapter owns the timer). */
  onTimer(): void;
  /** Called on sign-in and on app start when signed in (T057): pull, merge, push. */
  reconcile(): Promise<void>;
  /** Push whatever is unsynced now. Resolves when the attempt (not the retries) is done. */
  flush(): Promise<void>;
  dispose(): void;
};


export function createPositionSync(deps: SyncDeps): PositionSync {
  let retryIndex = 0;
  let retryHandle: unknown;
  let inFlight = false;
  let dirty = false;

  function applyServerRows(rows: PositionRowOut[], sent: Map<string, number>): void {
    for (const r of rows) {
      const local = deps.positions.get(r.episodeId);
      if (local) {
        // What the server knows of this row: the seq we just sent, else the last acked.
        const known = sent.get(r.episodeId) ?? local.syncedSeq;
        // Local progress the server has not seen wins locally; the next upload settles it.
        if (local.progressSeq > known) continue;
      }
      deps.positions.applyRemote({ episodeId: r.episodeId, offsetMs: r.offsetMs, finished: r.finished, explicitSeek: r.explicitSeek }, deps.now());
    }
  }

  async function attempt(): Promise<void> {
    if (inFlight || !deps.isSignedIn()) { dirty = dirty || inFlight; return; }
    const rows = deps.positions.unsynced().slice(0, 100);
    if (rows.length === 0) return;
    inFlight = true;
    const sent = new Map(rows.map((r) => [r.episodeId, r.progressSeq]));
    try {
      let reply: PositionRowOut[];
      try {
        reply = await deps.api.putPositions(deps.deviceId, rows.map((r) => ({ episodeId: r.episodeId, offsetMs: r.offsetMs, finished: r.finished, progressSeq: r.progressSeq, explicitSeek: r.explicitSeek })));
      } catch (e) {
        const missing = e instanceof ApiError && e.code === 'not_found' ? (e.extra['episodeId'] as string | undefined) : undefined;
        if (!missing) throw e;
        const reg = deps.registration(missing);
        if (!reg) throw e;
        await deps.api.registerEpisode(missing, reg);
        reply = await deps.api.putPositions(deps.deviceId, rows.map((r) => ({ episodeId: r.episodeId, offsetMs: r.offsetMs, finished: r.finished, progressSeq: r.progressSeq, explicitSeek: r.explicitSeek })));
      }
      // Everything we sent was accepted (merged) by the server; mark, then apply its answer.
      for (const [id, seq] of sent) deps.positions.markSynced(id, seq);
      applyServerRows(reply, sent);
      retryIndex = 0;
    } catch {
      const delay = RETRY_SCHEDULE_MS[Math.min(retryIndex, RETRY_SCHEDULE_MS.length - 1)]!;
      retryIndex++;
      deps.clearTimeout(retryHandle);
      retryHandle = deps.setTimeout(() => { retryHandle = undefined; void attempt(); }, delay);
    } finally {
      inFlight = false;
      if (dirty) { dirty = false; void attempt(); }
    }
  }

  return {
    onSaved(_row, reason) {
      if (IMMEDIATE.has(reason)) void attempt();
    },
    onTimer() { void attempt(); },
    async reconcile() {
      if (!deps.isSignedIn()) return;
      // Push first, so the server's answer already includes this phone's progress;
      // then pull, applying only rows this phone has nothing newer for.
      await attempt();
      try {
        const { positions } = await deps.api.getPositions();
        applyServerRows(positions, new Map());
      } catch { /* offline: the local rows stand, and the next attempt pushes them */ }
    },
    flush: () => attempt(),
    dispose() { deps.clearTimeout(retryHandle); retryHandle = undefined; },
  };
}
