// Lists episodes you listened to, most recent first.
/**
 * Listening history (收听历史, owner 2026-09-27): every episode this phone has a position
 * for, most recent first — the same rows M1 saves to resume, so nothing new is recorded.
 */
import type { CachedEpisode, Stores } from '@/storage/types';

export type HistoryRow = { episode: CachedEpisode; offsetMs: number; finished: boolean; updatedAt: number };

export function listeningHistory(stores: Pick<Stores, 'positions' | 'feeds'>, limit = 100): HistoryRow[] {
  // The lag audit (2026-10-04): read episodes only until `limit` rows are found — it used to read
  // every episode ever played (one SQLite read each) and then keep the first 100.
  const out: HistoryRow[] = [];
  for (const p of stores.positions.all().slice().sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (out.length >= limit) break;
    const episode = stores.feeds.getEpisode(p.episodeId);
    if (episode) out.push({ episode, offsetMs: p.offsetMs, finished: p.finished, updatedAt: p.updatedAt });
  }
  return out;
}

/** Every word of `term` somewhere in the texts, any case. An empty term matches all. */
export function matchesAll(term: string, texts: readonly (string | undefined)[]): boolean {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * M12 FR-006 (B6): this phone's own listening, for the listener's own profile. On the iPhone
 * the profile said "Nothing listened yet" while Recently played listed three episodes, one
 * finished — the server's totals only count what reached it. The profile shows the larger.
 */
export function localTotals(stores: Pick<Stores, 'positions' | 'feeds'>): { listenedMs: number; finished: number } {
  let listenedMs = 0;
  let finished = 0;
  for (const p of stores.positions.all()) {
    const duration = stores.feeds.getEpisode(p.episodeId)?.durationMs;
    listenedMs += p.finished && duration !== undefined ? duration : p.offsetMs;
    if (p.finished) finished += 1;
  }
  return { listenedMs, finished };
}
