// Retention: the share of an episode's listeners still listening at each minute.
/**
 * M19 US12 (FR-070). From the listened ranges every phone sends (M4): for each minute, the
 * listeners whose heard ranges cover that minute's middle, divided by everyone who heard any of
 * it. A count of listeners, never who; private listening counts in totals like everywhere else.
 */
import type { Db } from '../../db.ts';

export const RETENTION_MAX_MINUTES = 600;

type Range = [number, number];

const rangesOf = (v: unknown): Range[] => {
  const a = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  if (!Array.isArray(a)) return [];
  return a.filter((r): r is Range => Array.isArray(r) && typeof r[0] === 'number' && typeof r[1] === 'number' && r[1] > r[0]);
};

/** `durationMs` sets the number of minutes; unknown → up to the furthest point anyone heard. */
export async function retention(db: Db, episodeId: string, durationMs: number | null): Promise<number[]> {
  const rows = await db.query<{ listener_id: string; ranges: unknown }>('SELECT listener_id, ranges FROM listened_ranges WHERE episode_id = $1', [episodeId]);
  const byListener = new Map<string, Range[]>();
  for (const r of rows) byListener.set(r.listener_id, [...(byListener.get(r.listener_id) ?? []), ...rangesOf(r.ranges)]);
  const starters = [...byListener.values()].filter((rs) => rs.length > 0);
  if (starters.length === 0) return [];
  const furthest = Math.max(...starters.flatMap((rs) => rs.map((r) => r[1])));
  const minutes = Math.min(RETENTION_MAX_MINUTES, Math.max(1, Math.ceil((durationMs ?? furthest) / 60_000)));
  const out: number[] = [];
  for (let m = 0; m < minutes; m++) {
    const at = m * 60_000 + 30_000;
    const still = starters.filter((rs) => rs.some(([a, b]) => a <= at && at < b)).length;
    out.push(Math.round((still / starters.length) * 1000) / 1000);
  }
  return out;
}
