// Listening totals for the last 7 days and all time, top shows, and minutes per day or month.
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

/** M21 US9: one bar on the Listening data page — a day (`YYYY-MM-DD`) or, for all time, a month (`YYYY-MM`). */
export type SeriesPoint = { day: string; minutes: number };
export type ListeningRange = '30d' | 'all';
export type Listening = { days: SeriesPoint[]; totalMinutes: number; topShows: { feedUrl: string; title: string; minutes: number }[] };

const minutesOf = (ms: number) => Math.round(ms / 60_000);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * M21 US9 (research R8): the last `n` days ending `today`, oldest first, every day present
 * (0 when nothing was listened), each in whole minutes.
 */
export function daySeries(rows: readonly ListenedRow[], today: string, n: number = 30): SeriesPoint[] {
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.unionMs);
  const out: SeriesPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = dayOf(end - i * DAY_MS);
    out.push({ day: d, minutes: minutesOf(byDay.get(d) ?? 0) });
  }
  return out;
}

/**
 * M21 US9: every month from the first one with listening to `today`'s month (or the last row's,
 * if later), oldest first, 0-filled. No rows → no months.
 */
export function monthSeries(rows: readonly ListenedRow[], today: string): SeriesPoint[] {
  if (rows.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.day.slice(0, 7), (byMonth.get(r.day.slice(0, 7)) ?? 0) + r.unionMs);
  const months = [...byMonth.keys(), today.slice(0, 7)].sort();
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const out: SeriesPoint[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ day: key, minutes: minutesOf(byMonth.get(key) ?? 0) });
    if (key >= last) return out;
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
}

/**
 * M21 US9: `GET /v1/me/listening` — the bars for the range (30 days, or months for all time), the
 * range's total (rounded once, not a sum of rounded bars) and its top shows (a show with no
 * title is named by its feed URL).
 */
export function listening(rows: readonly ListenedRow[], today: string, range: ListeningRange, topN: number = 5): Listening {
  const first = dayOf(new Date(`${today}T00:00:00Z`).getTime() - 29 * DAY_MS);
  const inRange = range === 'all' ? rows : rows.filter((r) => r.day >= first && r.day <= today);
  const w = window(inRange, topN);
  return {
    days: range === 'all' ? monthSeries(rows, today) : daySeries(rows, today, 30),
    totalMinutes: minutesOf(w.listenedMs),
    topShows: w.topShows.map((s) => ({ feedUrl: s.feedUrl, title: s.showTitle ?? s.feedUrl, minutes: minutesOf(s.listenedMs) })),
  };
}

/** M21 US9: the first day on which the running all-time total reached `thresholdMs`; undefined if it never did. */
export function crossingDay(rows: readonly ListenedRow[], thresholdMs: number): string | undefined {
  let total = 0;
  for (const r of [...rows].sort((a, b) => a.day.localeCompare(b.day))) {
    total += r.unionMs;
    if (total >= thresholdMs) return r.day;
  }
  return undefined;
}
