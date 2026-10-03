/**
 * M11 US7 — tips a show received (FR-027). Tips are sold only through the App Store and Google
 * Play and verified by the server (constitution V); a refunded purchase is not counted (G-T1).
 * There is no withdrawal: payouts are not built (payments are owner-blocked, M10b).
 */
import type { Db } from '../../db.ts';

export async function tipsFor(db: Db, feedUrl: string) {
  const rows = await db.query<{ at: Date | string; amount_micros: string | number | null; currency: string | null; name: string | null }>(
    `SELECT t.created_at AS at, p.amount_micros, p.currency, l.display_name AS name
       FROM tips t JOIN purchases p ON p.id = t.purchase_id LEFT JOIN listeners l ON l.id = t.from_listener
      WHERE t.to_feed_url = $1 AND p.status <> 'refunded'
      ORDER BY t.created_at DESC LIMIT 200`,
    [feedUrl],
  );
  const totals: Record<string, number> = {};
  for (const r of rows) if (r.currency && r.amount_micros !== null) totals[r.currency] = (totals[r.currency] ?? 0) + Number(r.amount_micros);
  return {
    totalMicrosByCurrency: totals,
    items: rows.map((r) => ({ at: new Date(r.at).toISOString(), amountMicros: r.amount_micros === null ? null : Number(r.amount_micros), currency: r.currency, from: r.name ? { displayName: r.name } : null })),
  };
}
