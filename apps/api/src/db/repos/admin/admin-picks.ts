/**
 * M15 T012 — the owner's picks, by day, in the database (specs/015-m15-admin/data-model.md).
 *
 * Rules are the picks file's own (`validatePicks`, packages/social-core/src/picks.ts): an http(s)
 * feed URL, a quote of 1–140 characters, at most 5 a day. A save carries the `version` it loaded;
 * if the day moved since, it is refused 409 `changed` (FR-012, guard G-P3). 0 items deletes the day,
 * and the file's picks for that date (if any) serve again.
 */
import { PICKS_PER_DAY, validatePicks } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { fetchFeed } from '../../../catalog/feed.ts';

export type PickItemIn = { feedUrl: string; guid?: string; why: string };
export type PickItemRow = PickItemIn & { warning?: string };
export type PickDay = { day: string; version: number; items: PickItemRow[] };

/** Same rules as the file; a bad item is a 422 naming it, never a silent drop. */
export function checkPickItems(day: string, items: readonly PickItemIn[]): PickItemIn[] {
  if (items.length > PICKS_PER_DAY) throw new ApiError('validation', `At most ${PICKS_PER_DAY} picks a day.`, { fields: ['items'] });
  const { picks, warnings } = validatePicks(items.map((p, i) => ({ date: day, feedUrl: p.feedUrl, ...(p.guid ? { guid: p.guid } : {}), why: p.why, order: i + 1 })));
  if (warnings.length > 0) throw new ApiError('validation', warnings.join('; '), { fields: ['items'] });
  return picks.map((p) => ({ feedUrl: p.feedUrl, ...(p.guid !== undefined ? { guid: p.guid } : {}), why: p.why }));
}

export async function getPickDay(db: Db, day: string): Promise<PickDay | undefined> {
  const [d] = await db.query<{ version: number }>('SELECT version FROM pick_days WHERE day = $1::date', [day]);
  if (!d) return undefined;
  const rows = await db.query<{ feed_url: string; guid: string | null; why: string; warning: string | null }>(
    'SELECT feed_url, guid, why, warning FROM pick_items WHERE day = $1::date ORDER BY position', [day]);
  return {
    day, version: Number(d.version),
    items: rows.map((r) => ({ feedUrl: r.feed_url, ...(r.guid ? { guid: r.guid } : {}), why: r.why, ...(r.warning ? { warning: r.warning } : {}) })),
  };
}

/** Days in [from, to] that have admin picks, with their counts. */
export async function adminPickDays(db: Db, from: string, to: string): Promise<{ day: string; count: number }[]> {
  const rows = await db.query<{ day: string; count: number }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, (SELECT count(*)::int FROM pick_items i WHERE i.day = d.day) AS count
       FROM pick_days d WHERE d.day BETWEEN $1::date AND $2::date ORDER BY d.day`, [from, to]);
  return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}

/**
 * Saves a day in the caller's transaction. `version` is what the editor loaded (0 = the day had
 * no admin row). Returns the new version (0 when the day was cleared).
 */
export async function putPickDay(tx: Db, day: string, version: number, items: readonly PickItemRow[], by: string): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM pick_days WHERE day = $1::date FOR UPDATE', [day]);
  const current = cur ? Number(cur.version) : 0;
  if (current !== version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  if (items.length === 0) {
    await tx.query('DELETE FROM pick_days WHERE day = $1::date', [day]);
    return 0;
  }
  const next = current + 1;
  await tx.query(
    `INSERT INTO pick_days (day, version, updated_at, updated_by) VALUES ($1::date, $2, now(), $3)
     ON CONFLICT (day) DO UPDATE SET version = EXCLUDED.version, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [day, next, by],
  );
  await tx.query('DELETE FROM pick_items WHERE day = $1::date', [day]);
  for (const [i, p] of items.entries()) {
    await tx.query('INSERT INTO pick_items (day, position, feed_url, guid, why, warning) VALUES ($1::date, $2, $3, $4, $5, $6)',
      [day, i + 1, p.feedUrl, p.guid ?? null, p.why, p.warning ?? null]);
  }
  return next;
}

/**
 * FR-006 acceptance 4: an episode that does not resolve is saved WITH a warning (the phone skips it).
 * Known episodes cost one query; others one feed fetch (cached an hour). Never throws.
 */
export async function pickWarning(db: Db, f: typeof fetch, feedUrl: string, guid: string | undefined): Promise<string | undefined> {
  const [known] = guid !== undefined
    ? await db.query('SELECT 1 FROM episodes WHERE feed_url = $1 AND guid = $2 LIMIT 1', [feedUrl, guid])
    : await db.query('SELECT 1 FROM episodes WHERE feed_url = $1 LIMIT 1', [feedUrl]);
  if (known) return undefined;
  try {
    const { feed } = await fetchFeed(db, f, feedUrl);
    const ep = guid === undefined ? feed.episodes[0] : feed.episodes.find((e) => e.guid === guid);
    return ep ? undefined : guid === undefined ? 'The feed has no episodes.' : 'This episode is not in the feed.';
  } catch (e) {
    return `The feed did not answer: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
}
