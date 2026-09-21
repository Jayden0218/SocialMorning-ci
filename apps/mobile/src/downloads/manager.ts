/**
 * The download manager (US1, FR-001..007). Pure orchestration over a `Downloader`, a
 * `Network`, the `DownloadStore` and the feed cache; the rules (one at a time, order,
 * Wi-Fi, budget) are player-core's. `__tests__/download-manager.test.ts` (A9) is the
 * spec; the phone row is D0.
 *
 *   request()  → a `waiting` row (or joins an existing one), then tick()
 *   tick()     → nextDownload() picks the row; start/resume it; persist progress
 *   pause on network loss / app restart → resumeData kept; tick() resumes it
 *   remove()   → file + row gone; positions, queue and inbox untouched (FR-006)
 */
import { canStartDownload, nextDownload, usedBytesOf } from '@socialmorning/player-core';
import type { Downloader, Network } from './types';
import type { DownloadRow, Stores } from '../storage/types';

export const DEFAULT_BUDGET_BYTES = 2 * 1024 ** 3;
export const SETTING_BUDGET = 'downloads.budgetBytes';
export const SETTING_ALLOW_MOBILE = 'downloads.allowMobile';

export type ManagerDeps = {
  downloader: Downloader;
  network: Network;
  stores: Pick<Stores, 'downloads' | 'settings' | 'feeds' | 'positions'>;
  now: () => number;
  /** Where the file goes for this episode. */
  pathFor: (episodeId: string, enclosureUrl: string, enclosureType?: string) => string;
  onChange?: () => void;
};

export type RequestResult = { kind: 'queued' } | { kind: 'joined' } | { kind: 'budget'; usedBytes: number; budgetBytes: number } | { kind: 'no-episode' };

export type DownloadManager = {
  request(episodeId: string, opts?: { allowMobile?: boolean }): Promise<RequestResult>;
  cancel(episodeId: string): Promise<void>;
  remove(episodeId: string): Promise<void>;
  removeFinished(): Promise<number>;
  usedBytes(): number;
  budgetBytes(): number;
  setBudgetBytes(n: number): void;
  allowMobile(): boolean;
  setAllowMobile(v: boolean): void;
  /** Runs the scheduler once; safe to call often. Resolves when this pass has started (not finished) a transfer. */
  tick(): Promise<void>;
  /** Called at app start: puts any row left `downloading` by a killed process back to `paused`, then ticks. */
  recover(): Promise<void>;
  /** Marks a `complete` row whose file is gone as removed (FR-007). Returns true if it was. */
  verify(episodeId: string): Promise<boolean>;
  subscribe(fn: () => void): () => void;
};

export function createDownloadManager(deps: ManagerDeps): DownloadManager {
  const listeners = new Set<() => void>();
  const notify = () => { listeners.forEach((l) => l()); deps.onChange?.(); };
  let running: string | undefined;

  const budgetBytes = () => Number(deps.stores.settings.get(SETTING_BUDGET) ?? DEFAULT_BUDGET_BYTES);
  const allowMobile = () => deps.stores.settings.get(SETTING_ALLOW_MOBILE) === '1';
  const usedBytes = () => usedBytesOf(deps.stores.downloads.list());

  async function run(row: DownloadRow): Promise<void> {
    const episode = deps.stores.feeds.getEpisode(row.episodeId);
    if (!episode) {
      deps.stores.downloads.put({ ...row, state: 'failed', error: 'episode-missing' });
      return;
    }
    running = row.episodeId;
    deps.stores.downloads.put({ ...row, state: 'downloading', error: undefined });
    notify();
    let sawProgress = false;
    let overBudget = false;
    try {
      const result = await deps.downloader.start(row, episode.enclosureUrl, (done, total, resumeData) => {
        const current = deps.stores.downloads.get(row.episodeId);
        if (!current || current.state !== 'downloading' || overBudget) return;
        // FR-002: a transfer that starts again below what we already had is a restart —
        // either the server ignored our Range, or (gap 1) the process was killed before a
        // pause could produce resumeData. Say so; never pretend.
        const restarted = !sawProgress && row.bytesDone > 0 && done < row.bytesDone;
        sawProgress = true;
        deps.stores.downloads.put({
          ...current,
          bytesDone: done,
          bytesTotal: total > 0 ? total : current.bytesTotal,
          ...(resumeData !== undefined ? { resumeData } : {}),
          ...(restarted ? { error: 'no-resume' } : {}),
        });
        // FR-004 (gap 3, D7 on build 3): a feed that publishes length="0" — Megaphone does,
        // for every item — gives no size at request time, so the pre-check passed on 186 of
        // 200 MB and a 32 MB file went through. The first progress event is the first time
        // the size is known; refuse then, not never.
        if (current.bytesTotal === undefined && total > 0 && !canStartDownload(usedBytes() - total, total, budgetBytes())) {
          overBudget = true;
          void deps.downloader.cancel(row.episodeId);
        }
        notify();
      });
      const after = deps.stores.downloads.get(row.episodeId);
      if (!after) return; // cancelled meanwhile
      if (overBudget) {
        await deps.downloader.remove(after.filePath);
        deps.stores.downloads.put({ ...after, state: 'failed', error: 'budget', bytesDone: 0, resumeData: undefined });
      } else if (result.paused) {
        deps.stores.downloads.put({ ...after, state: 'paused', resumeData: result.resumeData });
      } else {
        const size = (await deps.downloader.size(after.filePath)) ?? after.bytesTotal ?? after.bytesDone;
        deps.stores.downloads.put({ ...after, state: 'complete', bytesDone: size, bytesTotal: size, completedAt: deps.now(), resumeData: undefined });
      }
    } catch (e) {
      const after = deps.stores.downloads.get(row.episodeId);
      if (after && overBudget) {
        // The native task may reject on cancel(); the outcome is the same either way.
        await deps.downloader.remove(after.filePath);
        deps.stores.downloads.put({ ...after, state: 'failed', error: 'budget', bytesDone: 0, resumeData: undefined });
      } else if (after) {
        // Keep whatever resume state we have; the next tick retries from it.
        const resume = await deps.downloader.pause(row.episodeId).catch(() => undefined);
        deps.stores.downloads.put({ ...after, state: 'paused', resumeData: resume?.resumeData ?? after.resumeData, error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      running = undefined;
      notify();
    }
  }

  async function tick(): Promise<void> {
    if (running) return;
    const kind = await deps.network.kind();
    const rows = deps.stores.downloads.list();
    const next = nextDownload(rows, kind, allowMobile());
    if (!next) return;
    const row = deps.stores.downloads.get(next);
    if (!row) return;
    if (!canStartDownload(usedBytes(), row.bytesTotal, budgetBytes())) {
      deps.stores.downloads.put({ ...row, state: 'failed', error: 'budget' });
      notify();
      return;
    }
    void run(row).then(() => tick());
  }

  return {
    async request(episodeId, opts = {}) {
      const existing = deps.stores.downloads.get(episodeId);
      if (existing && existing.state !== 'failed') return { kind: 'joined' };
      const episode = deps.stores.feeds.getEpisode(episodeId);
      if (!episode) return { kind: 'no-episode' };
      const expected = existing?.bytesTotal ?? episode.enclosureBytes;
      if (!canStartDownload(usedBytes(), expected, budgetBytes())) {
        return { kind: 'budget', usedBytes: usedBytes(), budgetBytes: budgetBytes() };
      }
      deps.stores.downloads.put({
        episodeId,
        filePath: deps.pathFor(episodeId, episode.enclosureUrl, episode.enclosureType),
        state: 'waiting',
        bytesDone: 0,
        ...(expected !== undefined ? { bytesTotal: expected } : {}),
        allowMobile: opts.allowMobile ?? false,
        requestedAt: deps.now(),
      });
      notify();
      await tick();
      return { kind: 'queued' };
    },
    async cancel(episodeId) {
      const row = deps.stores.downloads.get(episodeId);
      if (!row) return;
      if (running === episodeId) await deps.downloader.cancel(episodeId);
      deps.stores.downloads.remove(episodeId);
      await deps.downloader.remove(row.filePath);
      notify();
      if (running !== episodeId) await tick();
    },
    async remove(episodeId) {
      const row = deps.stores.downloads.get(episodeId);
      if (!row) return;
      if (running === episodeId) await deps.downloader.cancel(episodeId);
      await deps.downloader.remove(row.filePath);
      deps.stores.downloads.remove(episodeId); // FR-006: positions, queue, inbox untouched
      notify();
    },
    async removeFinished() {
      let n = 0;
      for (const row of deps.stores.downloads.list()) {
        if (row.state !== 'complete') continue;
        if (!deps.stores.positions.get(row.episodeId)?.finished) continue;
        await deps.downloader.remove(row.filePath);
        deps.stores.downloads.remove(row.episodeId);
        n++;
      }
      if (n > 0) notify();
      return n;
    },
    usedBytes,
    budgetBytes,
    setBudgetBytes: (n) => { deps.stores.settings.set(SETTING_BUDGET, String(n)); notify(); },
    allowMobile,
    setAllowMobile: (v) => { deps.stores.settings.set(SETTING_ALLOW_MOBILE, v ? '1' : '0'); notify(); void tick(); },
    tick,
    async recover() {
      for (const row of deps.stores.downloads.list()) {
        if (row.state === 'downloading') deps.stores.downloads.put({ ...row, state: 'paused' });
      }
      await tick();
    },
    async verify(episodeId) {
      const row = deps.stores.downloads.get(episodeId);
      if (!row || row.state !== 'complete') return false;
      if ((await deps.downloader.size(row.filePath)) !== undefined) return false;
      deps.stores.downloads.remove(episodeId);
      notify();
      return true;
    },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
