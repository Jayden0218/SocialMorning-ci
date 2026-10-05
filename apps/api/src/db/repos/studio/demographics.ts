// Demographics: age range, gender and country totals of a show's subscribers, never under 10.
/**
 * M19 US12 (FR-073). Only listeners who chose to give an age range or gender are counted for
 * those; country comes from the public sign-in country (M10b). Any group under MIN_GROUP is
 * reported as '<10' so no listener can be picked out — a creator never learns who.
 */
import type { Db } from '../../db.ts';

export const MIN_GROUP = 10;

export type Bucket = { key: string; count: number | '<10' };
export type Demographics = { total: number; age: Bucket[]; gender: Bucket[]; countries: Bucket[] };

const bucket = (rows: { k: string | null; n: number | string }[]): Bucket[] =>
  rows.filter((r) => r.k !== null && r.k !== '').map((r) => ({ key: String(r.k).trim(), count: Number(r.n) >= MIN_GROUP ? Number(r.n) : ('<10' as const) }));

export async function demographics(db: Db, feedUrl: string): Promise<Demographics> {
  const base = `FROM subscriptions s JOIN listeners l ON l.id = s.listener_id AND l.suspended_at IS NULL WHERE s.feed_url = $1 AND s.deleted_at IS NULL`;
  const [total, age, gender, countries] = await Promise.all([
    db.query<{ n: number }>(`SELECT count(*)::int AS n ${base}`, [feedUrl]),
    db.query<{ k: string | null; n: number }>(`SELECT l.age_range AS k, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 2 DESC, 1`, [feedUrl]),
    db.query<{ k: string | null; n: number }>(`SELECT l.gender AS k, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 2 DESC, 1`, [feedUrl]),
    db.query<{ k: string | null; n: number }>(`SELECT l.country AS k, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 2 DESC, 1`, [feedUrl]),
  ]);
  return { total: Number(total[0]?.n ?? 0), age: bucket(age), gender: bucket(gender), countries: bucket(countries) };
}
