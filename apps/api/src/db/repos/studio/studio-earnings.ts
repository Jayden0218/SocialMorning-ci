// Earnings for a show: paid-show sales, gifts and tips per month, refunds apart, and the CSV.
/**
 * M24 US9 (specs/025-m24-gaps-and-look). Reads the existing money tables only — `purchases`,
 * `gifts`, `tips` — nothing new is stored. Every row is an App Store / Google Play purchase the
 * server verified (constitution 2.1.0). A refunded purchase is counted under "refunded" in the
 * month it was bought and never in the totals. Amounts are what the store reported, before the
 * store's fee; a purchase the store gave no amount for counts, with no amount.
 */
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { toCsv } from './studio-numbers.ts';

export type EarningKind = 'sale' | 'gift' | 'tip';
export type EarningRow = { at: string; kind: EarningKind; amountMicros: number | null; currency: string | null; refunded: boolean };
type Bucket = { count: number; refunded: number; totalMicrosByCurrency: Record<string, number>; refundedMicrosByCurrency: Record<string, number> };
export type EarningMonth = { month: string; sale: Bucket; gift: Bucket; tip: Bucket };

const empty = (): Bucket => ({ count: 0, refunded: 0, totalMicrosByCurrency: {}, refundedMicrosByCurrency: {} });

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

const LABEL: Record<EarningKind, string> = { sale: 'Paid show', gift: 'Gift', tip: 'Tip' };

export async function earningsCsv(db: Db, feedUrl: string): Promise<string> {
  const rows = await earningRows(db, feedUrl);
  return toCsv(['Date', 'Type', 'Amount', 'Currency', 'Refunded'],
    rows.map((r) => [r.at.slice(0, 10), LABEL[r.kind], r.amountMicros === null ? null : r.amountMicros / 1_000_000, r.currency, r.refunded ? 'yes' : 'no']));
}

// DynamoDB bodies: ddb/ (db/backend.ts).
export const earningRows = viaStore<typeof import('./ddb/numbers.ts').earningRows>('st/numbers', 'earningRows');
export const earnings = viaStore<typeof import('./ddb/numbers.ts').earnings>('st/numbers', 'earnings');
