// The owner's For You rules: boost, bury or never recommend a show; and the ranking weights.
/**
 * M25 A6 (lane AL). Read by `buildForYou` (foryou.ts): a `never` show leaves every listener's
 * list (also at serve time, so a cached list obeys at once); `boost` adds RULE_BOOST to each of
 * its episodes' scores and `bury` takes RULE_BURY off. The weights replace rank.ts's constants
 * (`cleanWeights` keeps them inside WEIGHT_BOUNDS; no row = the defaults). Every admin save drops
 * the cached lists (`dropForYouCache`), so the next request is rebuilt with them.
 */
import { cleanWeights, DEFAULT_WEIGHTS, type Weights } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

export const RULES = ['boost', 'bury', 'never'] as const;
export type Rule = (typeof RULES)[number];
export type RuleRow = { feedUrl: string; rule: Rule; note: string | null; createdAt: string; title: string | null };

/** Every cached For You list (signed in and signed out); the shared chart channel stays. */
export async function dropForYouCache(db: Db): Promise<void> {
  await db.query("DELETE FROM cache WHERE key LIKE 'foryou:%' AND key <> 'foryou:chart'");
}

export async function forYouRules(db: Db): Promise<Map<string, Rule>> {
  const rows = await db.query<{ feed_url: string; rule: Rule }>('SELECT feed_url, rule FROM foryou_rules');
  return new Map(rows.map((r) => [r.feed_url, r.rule]));
}

/** For Admin: every rule with the show's name when the server knows it. */
export async function listRules(db: Db): Promise<RuleRow[]> {
  const rows = await db.query<{ feed_url: string; rule: Rule; note: string | null; created_at: Date | string; title: string | null }>(
    `SELECT r.feed_url, r.rule, r.note, r.created_at,
            (SELECT e.show_title FROM episodes e WHERE e.feed_url = r.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS title
       FROM foryou_rules r ORDER BY r.created_at DESC, r.feed_url`);
  return rows.map((r) => ({ feedUrl: r.feed_url, rule: r.rule, note: r.note, createdAt: new Date(r.created_at).toISOString(), title: r.title }));
}

export async function putRule(tx: Db, feedUrl: string, rule: Rule, note: string | null, by: string): Promise<void> {
  await tx.query(
    `INSERT INTO foryou_rules (feed_url, rule, note, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (feed_url) DO UPDATE SET rule = EXCLUDED.rule, note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = now()`,
    [feedUrl, rule, note, by]);
}

export async function deleteRule(tx: Db, feedUrl: string): Promise<boolean> {
  return (await tx.query('DELETE FROM foryou_rules WHERE feed_url = $1 RETURNING feed_url', [feedUrl])).length > 0;
}

export async function getWeights(db: Db): Promise<{ weights: Weights; version: number; saved: boolean }> {
  const [r] = await db.query<{ weights: unknown; version: number }>('SELECT weights, version FROM foryou_weights WHERE id = 1');
  if (!r) return { weights: { ...DEFAULT_WEIGHTS }, version: 0, saved: false };
  const raw = typeof r.weights === 'string' ? JSON.parse(r.weights) as unknown : r.weights;
  return { weights: cleanWeights(raw), version: Number(r.version), saved: true };
}

/** Saves the weights (clamped); `null` = reset to the defaults. Optimistic: `version` must match. */
export async function putWeights(tx: Db, version: number, w: Partial<Weights> | null): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM foryou_weights WHERE id = 1 FOR UPDATE');
  const current = cur ? Number(cur.version) : 0;
  if (current !== version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  if (w === null) {
    await tx.query('DELETE FROM foryou_weights WHERE id = 1');
    return 0;
  }
  const next = current + 1;
  // jsonb goes in as TEXT, cast in SQL (M14 T-012: the `postgres` driver double-encodes otherwise).
  await tx.query(
    `INSERT INTO foryou_weights (id, weights, version, updated_at) VALUES (1, ($1::text)::jsonb, $2, now())
     ON CONFLICT (id) DO UPDATE SET weights = EXCLUDED.weights, version = EXCLUDED.version, updated_at = now()`,
    [JSON.stringify(cleanWeights(w)), next]);
  return next;
}
