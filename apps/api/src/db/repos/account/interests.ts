// A listener's chosen categories (first-open interests) and their "Not liking these?" answers.
/**
 * M22 US5 (FR-017–FR-019, research R5). `listener_interests` keeps the Apple top-level genre
 * ids a listener picked on first open (≥ 2), or the moment they skipped. For You reads them as
 * its "interests" channel; `interestsStamp` is part of its cache key, so a change shows on the
 * next refresh. `rec_feedback` keeps each "Not liking these?" answer; its category changes are
 * applied to `listener_interests` at once.
 */
import type { Db } from '../../db.ts';
import { APPLE_GENRES } from '../../../catalog/genres.ts';

export const INTERESTS_MIN = 2;
const KNOWN = new Set(Object.values(APPLE_GENRES));

/** Only Apple's top-level genre ids, each once, in the order given. */
export function cleanGenreIds(ids: readonly number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (KNOWN.has(id) && !out.includes(id)) out.push(id);
  return out;
}

export type Interests = { genreIds: number[]; skippedAt: string | null };

export async function getInterests(db: Db, listenerId: string): Promise<Interests> {
  const [r] = await db.query<{ genre_ids: number[] | string; skipped_at: Date | string | null }>(
    'SELECT genre_ids, skipped_at FROM listener_interests WHERE listener_id = $1', [listenerId]);
  if (!r) return { genreIds: [], skippedAt: null };
  return { genreIds: parseIntArray(r.genre_ids), skippedAt: r.skipped_at === null ? null : new Date(r.skipped_at).toISOString() };
}

/** pglite answers an int[] as an array; a driver may answer the text form `{1,2}`. */
function parseIntArray(v: number[] | string): number[] {
  if (Array.isArray(v)) return v.map(Number);
  return v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
}

export async function setInterests(db: Db, listenerId: string, genreIds: readonly number[]): Promise<void> {
  await db.query(
    `INSERT INTO listener_interests (listener_id, genre_ids, skipped_at, updated_at) VALUES ($1, $2::int[], NULL, now())
     ON CONFLICT (listener_id) DO UPDATE SET genre_ids = EXCLUDED.genre_ids, skipped_at = NULL, updated_at = now()`,
    [listenerId, [...genreIds]]);
}

/** Skip keeps whatever was picked before (normally nothing) and records when. */
export async function skipInterests(db: Db, listenerId: string): Promise<void> {
  await db.query(
    `INSERT INTO listener_interests (listener_id, genre_ids, skipped_at, updated_at) VALUES ($1, '{}', now(), now())
     ON CONFLICT (listener_id) DO UPDATE SET skipped_at = now(), updated_at = now()`,
    [listenerId]);
}

export type RecFeedbackIn = { reason: 'familiar' | 'topics' | 'long' | 'other'; note?: string; add?: number[]; remove?: number[] };

/** Stores the answer, then applies its category changes (FR-019). */
export async function addRecFeedback(db: Db, listenerId: string, f: RecFeedbackIn): Promise<void> {
  await db.query('INSERT INTO rec_feedback (listener_id, reason, note) VALUES ($1, $2, $3)', [listenerId, f.reason, f.note?.trim() || null]);
  const add = cleanGenreIds(f.add ?? []);
  const remove = new Set(f.remove ?? []);
  if (add.length === 0 && remove.size === 0) return;
  const cur = await getInterests(db, listenerId);
  const next = cleanGenreIds([...cur.genreIds.filter((g) => !remove.has(g)), ...add]);
  await db.query(
    `INSERT INTO listener_interests (listener_id, genre_ids, updated_at) VALUES ($1, $2::int[], now())
     ON CONFLICT (listener_id) DO UPDATE SET genre_ids = EXCLUDED.genre_ids, updated_at = now()`,
    [listenerId, next]);
}

/** Part of For You's cache key: any change to the interests is a new key. */
export async function interestsStamp(db: Db, listenerId: string): Promise<string> {
  const [r] = await db.query<{ v: string | null }>('SELECT updated_at::text AS v FROM listener_interests WHERE listener_id = $1', [listenerId]);
  return r?.v ?? '-';
}

/** How many episodes the listener has listened to — the interests channel fades as this grows. */
export async function playCount(db: Db, listenerId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(
    "SELECT count(DISTINCT episode_id)::int AS n FROM activity WHERE actor_id = $1 AND kind = 'listened'", [listenerId]);
  return Number(r?.n ?? 0);
}
