// Runs the download queue: order, Wi-Fi rule, storage limit, and progress.
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
 *
 * M22 US17 (downloads tidy themselves; both off by default):
 *   "Delete after playing"  → afterFinished(id) removes a finished episode's download.
 *   "When storage is full, remove the oldest" → a request (or a tick) that would go over the
 *   limit first removes the oldest complete downloads — never a starred (favourite) episode,
 *   never one listened part-way — until the new one fits; if it cannot fit, nothing is removed.
 */
import { canStartDownload, nextDownload, usedBytesOf } from '@socialmorning/player-core';
import type { Downloader, Network } from './types';
import type { DownloadRow, Stores } from '@/storage/types';
import { isFavourite } from '@/me/favourites';

export const DEFAULT_BUDGET_BYTES = 2 * 1024 ** 3;
export const SETTING_BUDGET = 'downloads.budgetBytes';
export const SETTING_ALLOW_MOBILE = 'downloads.allowMobile';
/** M22 US17 (data-model "New settings keys"): '1' = on; off by default. */
export const SETTING_DELETE_AFTER_PLAY = 'downloads.deleteAfterPlay';
export const SETTING_EVICT_OLDEST = 'downloads.evictOldest';

/**
 * M22 US17: which complete downloads to remove, oldest first, so `needBytes` more fits under the
 * budget. `keep(id)` true = never removed (starred, in progress). Empty when it already fits, or
 * when even removing every allowed one would not make room (nothing is deleted for nothing).
 */
export function evictionPlan(rows: readonly DownloadRow[], needBytes: number, budgetBytes: number, keep: (episodeId: string) => boolean): string[] {
  let used = usedBytesOf(rows);
  if (canStartDownload(used, needBytes, budgetBytes)) return [];
  const oldest = rows
    .filter((r) => r.state === 'complete' && !keep(r.episodeId))
    .sort((a, b) => (a.completedAt ?? a.requestedAt) - (b.completedAt ?? b.requestedAt));
  const out: string[] = [];
  for (const r of oldest) {
    out.push(r.episodeId);
    used -= r.bytesTotal ?? 0;
    if (canStartDownload(used, needBytes, budgetBytes)) return out;
  }
  return [];
}

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
  /** M22 US17: the player saved `finished` for this episode — removes its download when "Delete after playing" is on. */
  afterFinished(episodeId: string): void;
  deleteAfterPlay(): boolean;
  setDeleteAfterPlay(v: boolean): void;
  evictOldest(): boolean;
  setEvictOldest(v: boolean): void;
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
  const deleteAfterPlay = () => deps.stores.settings.get(SETTING_DELETE_AFTER_PLAY) === '1';
  const evictOldest = () => deps.stores.settings.get(SETTING_EVICT_OLDEST) === '1';
  /** Starred, or listened part-way: never removed automatically. */
  const keep = (episodeId: string): boolean => {
    if (isFavourite(deps.stores.settings, episodeId)) return true;
    const p = deps.stores.positions.get(episodeId);
    return p !== undefined && !p.finished && p.offsetMs > 0;
  };
  /** M22 US17: makes room for `needBytes` when the switch is on. True when it now fits. */
  async function makeRoom(needBytes: number | undefined): Promise<boolean> {
    if (!evictOldest()) return false;
    const ids = evictionPlan(deps.stores.downloads.list(), needBytes ?? 0, budgetBytes(), keep);
    for (const id of ids) {
      const row = deps.stores.downloads.get(id);
      if (!row) continue;
      await deps.downloader.remove(row.filePath);
      deps.stores.downloads.remove(id);
    }
    if (ids.length > 0) notify();
    return ids.length > 0;
  }

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
        // FR-004 (gap 5, D7 on build 3): a feed that publishes length="0" — Megaphone does,
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
    // M23 T044: a paused row already holds its size in usedBytes — don't count it twice on resume.
    const held = usedBytesOf([row]);
    if (!canStartDownload(usedBytes() - held, row.bytesTotal, budgetBytes()) && !(await makeRoom(row.bytesTotal === undefined ? undefined : row.bytesTotal - held))) {
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
      if (!canStartDownload(usedBytes(), expected, budgetBytes()) && !(await makeRoom(expected))) {
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
    afterFinished(episodeId) {
      if (!deleteAfterPlay()) return;
      const row = deps.stores.downloads.get(episodeId);
      if (!row || row.state !== 'complete') return;
      deps.stores.downloads.remove(episodeId); // FR-006: positions, queue, inbox untouched
      notify();
      void deps.downloader.remove(row.filePath).catch(() => undefined);
    },
    deleteAfterPlay,
    setDeleteAfterPlay: (v) => { deps.stores.settings.set(SETTING_DELETE_AFTER_PLAY, v ? '1' : '0'); notify(); },
    evictOldest,
    setEvictOldest: (v) => { deps.stores.settings.set(SETTING_EVICT_OLDEST, v ? '1' : '0'); notify(); },
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
