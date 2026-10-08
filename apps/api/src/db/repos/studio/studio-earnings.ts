// Earnings for a show: paid-show sales, gifts and tips per month, refunds apart, and the CSV.
/**
 * M24 US9 (specs/025-m24-gaps-and-look). Reads the existing money tables only — `purchases`,
 * `gifts`, `tips` — nothing new is stored. Every row is an App Store / Google Play purchase the
 * server verified (constitution 2.1.0). A refunded purchase is counted under "refunded" in the
 * month it was bought and never in the totals. Amounts are what the store reported, before the
 * store's fee; a purchase the store gave no amount for counts, with no amount.
 */
import type { Db } from '../../db.ts';
import { toCsv } from './studio-numbers.ts';

export type EarningKind = 'sale' | 'gift' | 'tip';
export type EarningRow = { at: string; kind: EarningKind; amountMicros: number | null; currency: string | null; refunded: boolean };
type Bucket = { count: number; refunded: number; totalMicrosByCurrency: Record<string, number>; refundedMicrosByCurrency: Record<string, number> };
export type EarningMonth = { month: string; sale: Bucket; gift: Bucket; tip: Bucket };

const empty = (): Bucket => ({ count: 0, refunded: 0, totalMicrosByCurrency: {}, refundedMicrosByCurrency: {} });

/** Every money row for the show, newest first. M25 SB: a test purchase (licence tester) is never earnings. */
export async function earningRows(db: Db, feedUrl: string, limit = 5000): Promise<EarningRow[]> {
  const rows = await db.query<{ kind: EarningKind; created_at: Date | string; amount_micros: string | number | null; currency: string | null; status: string }>(
    `SELECT * FROM (
       SELECT 'sale' AS kind, p.created_at, p.amount_micros, p.currency, p.status
         FROM purchases p WHERE p.ref = $1 AND p.product_id LIKE 'show\\_tier\\_%' AND NOT p.test
       UNION ALL
       SELECT 'gift', p.created_at, p.amount_micros, p.currency, p.status
         FROM gifts g JOIN purchases p ON p.id = g.purchase_id WHERE g.feed_url = $1 AND NOT p.test
       UNION ALL
       SELECT 'tip', p.created_at, p.amount_micros, p.currency, p.status
         FROM tips t JOIN purchases p ON p.id = t.purchase_id WHERE t.to_feed_url = $1 AND NOT p.test
     ) x ORDER BY created_at DESC LIMIT $2`,
    [feedUrl, limit],
  );
  return rows.map((r) => ({
    at: new Date(r.created_at).toISOString(), kind: r.kind,
    amountMicros: r.amount_micros === null ? null : Number(r.amount_micros), currency: r.currency?.trim() || null, refunded: r.status === 'refunded',
  }));
}

/** Month by month (UTC, newest first), each kind on its own. */
export function byMonth(rows: EarningRow[]): EarningMonth[] {
  const months = new Map<string, EarningMonth>();
  for (const r of rows) {
    const key = r.at.slice(0, 7);
    const m = months.get(key) ?? { month: key, sale: empty(), gift: empty(), tip: empty() };
    months.set(key, m);
    const b = m[r.kind];
    const sums = r.refunded ? b.refundedMicrosByCurrency : b.totalMicrosByCurrency;
    if (r.refunded) b.refunded += 1;
    else b.count += 1;
    if (r.amountMicros !== null && r.currency) sums[r.currency] = (sums[r.currency] ?? 0) + r.amountMicros;
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export async function earnings(db: Db, feedUrl: string): Promise<{ months: EarningMonth[]; items: EarningRow[] }> {
  const rows = await earningRows(db, feedUrl);
  return { months: byMonth(rows), items: rows.slice(0, 200) };
}

const LABEL: Record<EarningKind, string> = { sale: 'Paid show', gift: 'Gift', tip: 'Tip' };

export async function earningsCsv(db: Db, feedUrl: string): Promise<string> {
  const rows = await earningRows(db, feedUrl);
  return toCsv(['Date', 'Type', 'Amount', 'Currency', 'Refunded'],
    rows.map((r) => [r.at.slice(0, 10), LABEL[r.kind], r.amountMicros === null ? null : r.amountMicros / 1_000_000, r.currency, r.refunded ? 'yes' : 'no']));
}
