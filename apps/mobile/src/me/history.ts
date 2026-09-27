/**
 * Listening history (收听历史, owner 2026-09-27): every episode this phone has a position
 * for, most recent first — the same rows M1 saves to resume, so nothing new is recorded.
 */
import type { CachedEpisode, Stores } from '../storage/types';

export type HistoryRow = { episode: CachedEpisode; offsetMs: number; finished: boolean; updatedAt: number };

export function listeningHistory(stores: Pick<Stores, 'positions' | 'feeds'>, limit = 100): HistoryRow[] {
  return stores.positions.all()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((p) => {
      const episode = stores.feeds.getEpisode(p.episodeId);
      return episode ? { episode, offsetMs: p.offsetMs, finished: p.finished, updatedAt: p.updatedAt } : undefined;
    })
    .filter((r): r is HistoryRow => r !== undefined)
    .slice(0, limit);
}
