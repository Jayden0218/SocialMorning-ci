/**
 * M4 FR-012: totals over listened rows (one per episode per day, already unioned across
 * devices by the server). Windows: the last 7 days including today, and all time.
 */
export type ListenedRow = { episodeId: string; feedUrl?: string; showTitle?: string; day: string; unionMs: number; finished: boolean };
export type TopShow = { feedUrl: string; showTitle?: string; listenedMs: number };
export type StatsWindow = { listenedMs: number; finished: number; topShows: TopShow[] };
export type Stats = { last7: StatsWindow; all: StatsWindow };

const DAY_MS = 86_400_000;

/** `today` and `row.day` are YYYY-MM-DD; a row on or after today−6 is inside the window. */
export function stats(rows: readonly ListenedRow[], today: string, topN: number = 5): Stats {
  const cutoff = new Date(`${today}T00:00:00Z`).getTime() - 6 * DAY_MS;
  const recent = rows.filter((r) => new Date(`${r.day}T00:00:00Z`).getTime() >= cutoff);
  return { last7: window(recent, topN), all: window(rows, topN) };
}

function window(rows: readonly ListenedRow[], topN: number): StatsWindow {
  let listenedMs = 0;
  const finishedEpisodes = new Set<string>();
  const byShow = new Map<string, TopShow>();
  for (const r of rows) {
    listenedMs += r.unionMs;
    if (r.finished) finishedEpisodes.add(r.episodeId);
    if (r.feedUrl !== undefined) {
      const s = byShow.get(r.feedUrl) ?? { feedUrl: r.feedUrl, listenedMs: 0, ...(r.showTitle !== undefined ? { showTitle: r.showTitle } : {}) };
      s.listenedMs += r.unionMs;
      byShow.set(r.feedUrl, s);
    }
  }
  const topShows = [...byShow.values()].sort((a, b) => b.listenedMs - a.listenedMs || a.feedUrl.localeCompare(b.feedUrl)).slice(0, topN);
  return { listenedMs, finished: finishedEpisodes.size, topShows };
}
