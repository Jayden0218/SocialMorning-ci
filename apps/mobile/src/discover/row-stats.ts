// Fetches "listened" and comment counts for every episode on Discover in one call.
/**
 * Owner, 2026-10-05: every Discover episode carries "12 listened · 3 comments", not only the
 * editor's picks. One comment-counts call (M12 FR-080, ≤ 100 ids) for the page; a failure
 * leaves the rows without numbers — the page never waits on it. Counts only, never names (G6).
 */
import { useEffect, useState } from 'react';
import { useM12Api } from '@/social/m12-api';
import type { DiscoverModel } from './sections';

export type StatsById = Readonly<Record<string, { listeners: number; comments: number }>>;

/** Every episode id the page draws, first seen first, at most 100. */
export function rowIds(model: Pick<DiscoverModel, 'forYou' | 'picks' | 'chart' | 'arrivals'>): string[] {
  const ids = [
    ...model.forYou.map((r) => r.card.id),
    ...model.picks.map((p) => p.episode.id),
    ...model.chart.flatMap((t) => t.rows.map((c) => c.id)),
    ...model.arrivals.map((a) => a.episode.id),
  ];
  return [...new Set(ids)].slice(0, 100);
}

export function useRowStats(model: Pick<DiscoverModel, 'forYou' | 'picks' | 'chart' | 'arrivals'>): StatsById {
  const m12 = useM12Api();
  const [stats, setStats] = useState<StatsById>({});
  const ids = rowIds(model).join(',');
  useEffect(() => {
    if (ids === '') return;
    let live = true;
    m12.episodeCounts(ids.split(',')).then((r) => {
      if (!live) return;
      const out: Record<string, { listeners: number; comments: number }> = {};
      for (const id of ids.split(',')) out[id] = { listeners: r.listeners?.[id] ?? 0, comments: r.counts[id] ?? 0 };
      setStats(out);
    }, () => undefined);
    return () => { live = false; };
  }, [m12, ids]);
  return stats;
}
