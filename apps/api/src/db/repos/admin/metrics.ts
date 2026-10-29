// Admin dashboard numbers: totals only, each section fails on its own.
/**
 * M18 (specs/019-m18-admin-dashboard, contracts/metrics-api.md). Aggregates only — nothing here
 * returns a listener's id, email or name (FR-013, guard G-AD2). Each section runs in its own `try`:
 * one failing query marks that section `{ ok: false }` and the rest still answer (FR-017, G-AD4).
 *
 * Days are calendar days in UTC+8 (research R3), computed in code from UTC so the server's own
 * time zone never matters; listening keeps the phone's stored day (FR-019). The numbers are counted in
 * safety/ddb/metrics.ts; this file holds the shapes and the helpers it shares.
 */
import { viaStore } from '../../backend.ts';
import { log } from '../../../log.ts';

export const METRIC_RANGES = [7, 30, 90] as const;
export type MetricRange = (typeof METRIC_RANGES)[number];
export type Point = { date: string; value: number };
type Ok<T> = { ok: true } & T;
type Failed = { ok: false; message: string };
export type Section<T> = Ok<T> | Failed;

const HOUR_MS = 3_600_000;
const UTC8_MS = 8 * HOUR_MS;
/** An instant (ms or ISO) → its UTC+8 calendar day `yyyy-mm-dd`. */
export const utc8Day = (t: number | string): string => new Date((typeof t === 'number' ? t : Date.parse(t)) + UTC8_MS).toISOString().slice(0, 10);

/** The range's days, oldest first, ending today (UTC+8). */
export function rangeDays(days: number, now: number): string[] {
  const today = Date.parse(new Date(now + UTC8_MS).toISOString().slice(0, 10) + 'T00:00:00Z');
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** The first instant of a UTC+8 day, as an ISO timestamp for a `>=` filter. */
export const startOf = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - UTC8_MS).toISOString();

/** Rows `{ d, n }` → one point per day of the range, 0 where nothing happened (FR-018). */
export function series(days: string[], rows: { d: string; n: number | string }[]): Point[] {
  const by = new Map(rows.map((r) => [r.d, Number(r.n)]));
  return days.map((date) => ({ date, value: by.get(date) ?? 0 }));
}

export async function section<T>(name: string, f: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, ...(await f()) };
  } catch (e) {
    log.warn('metrics_read_failed', { name, error: e });
    return { ok: false, message: `The ${name} numbers could not be counted.` };
  }
}

/** One listener's union for one (episode, day), with the episode's show — the input of the listening section. */
export type ListenedEntry = { listener: string; episode: string; d: string; feedUrl: string | null; title: string | null; showTitle: string | null; ms: number };

/** Per-day listeners and hours, and the top 10 shows and episodes, from the unions (an empty union counts nothing). */
export function summariseListening(days: string[], entries: readonly ListenedEntry[]) {
  const listeners = new Map<string, Set<string>>();
  const ms = new Map<string, number>();
  const shows = new Map<string, { feedUrl: string; title: string; ms: number }>();
  const episodes = new Map<string, { episodeId: string; title: string; showTitle: string; ms: number }>();
  for (const s of entries) {
    const n = s.ms;
    if (n <= 0) continue;
    listeners.set(s.d, (listeners.get(s.d) ?? new Set()).add(s.listener));
    ms.set(s.d, (ms.get(s.d) ?? 0) + n);
    if (s.feedUrl) {
      const sh = shows.get(s.feedUrl) ?? { feedUrl: s.feedUrl, title: s.showTitle ?? s.feedUrl, ms: 0 };
      sh.ms += n; shows.set(s.feedUrl, sh);
    }
    const ep = episodes.get(s.episode) ?? { episodeId: s.episode, title: s.title ?? s.episode, showTitle: s.showTitle ?? '', ms: 0 };
    ep.ms += n; episodes.set(s.episode, ep);
  }
  const hours = (n: number) => Math.round((n / HOUR_MS) * 100) / 100;
  const top = <T extends { ms: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.ms - a.ms).slice(0, 10).map(({ ms: n, ...rest }) => ({ ...rest, hours: hours(n) }));
  return {
    listenersPerDay: days.map((date) => ({ date, value: listeners.get(date)?.size ?? 0 })),
    hoursPerDay: days.map((date) => ({ date, value: hours(ms.get(date) ?? 0) })),
    topShows: top(shows),
    topEpisodes: top(episodes),
  };
}

type Count = { openReports: number; reports: number; actions: number; blocks: number };
export type MetricSections = {
  users: Section<{ total: number; suspended: number; active: { d1: number; d7: number; d30: number }; newPerDay: Point[]; dauPerDay: Point[]; recordedSince: string | null }>;
  listening: Section<{
    listenersPerDay: Point[]; hoursPerDay: Point[]; finished: number;
    topShows: { feedUrl: string; title: string; hours: number }[];
    topEpisodes: { episodeId: string; title: string; showTitle: string; hours: number }[];
  }>;
  library: Section<{ addedPerDay: Point[]; removedPerDay: Point[]; topShows: { feedUrl: string; title: string; subscribers: number }[] }>;
  social: Section<{ commentsPerDay: Point[]; reactionsPerDay: Point[]; clipsPerDay: Point[]; followsPerDay: Point[]; sharesPerDay: Point[]; voicePostsLive: number }>;
  recs: Section<{ byChannel: { channel: string; shown: number; played: number }[] }>;
  safety: Section<Count>;
  money: Section<{ activePurchases: number; purchases: number; tips: number; amounts: { currency: string; micros: number }[] }>;
  creators: Section<{ claimedShows: number; hostedShows: number; hostedEpisodes: number; teamMembers: number }>;
};
export type Metrics = { days: MetricRange; from: string; to: string; countedAt: string; partial: boolean; sections: MetricSections };

// Counted in safety/ddb/metrics.ts (db/backend.ts).
export const computeMetrics = viaStore<typeof import('../safety/ddb/metrics.ts').computeMetrics>('sf/metrics', 'computeMetrics');
export const dropCachedMetrics = viaStore<typeof import('../safety/ddb/metrics.ts').dropCachedMetrics>('sf/metrics', 'dropCachedMetrics');
export const checkDashboard = viaStore<typeof import('../safety/ddb/metrics.ts').checkDashboard>('sf/metrics', 'checkDashboard');
