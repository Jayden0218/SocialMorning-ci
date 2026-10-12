// The owner's daily picks stored in the database, refusing out-of-date saves.
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
import { viaStore } from '../../backend.ts';
import { pickEpisodeRows } from '../discover/pick-episodes.ts';
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

/**
 * FR-006 acceptance 4: an episode that does not resolve is saved WITH a warning (the phone skips it).
 * Known episodes cost one query; others one feed fetch (cached an hour). Never throws.
 */
export async function pickWarning(db: Db, f: typeof fetch, feedUrl: string, guid: string | undefined): Promise<string | undefined> {
  const [known] = await pickEpisodeRows(db, feedUrl, guid, false);
  if (known) return undefined;
  try {
    const { feed } = await fetchFeed(db, f, feedUrl);
    const ep = guid === undefined ? feed.episodes[0] : feed.episodes.find((e) => e.guid === guid);
    return ep ? undefined : guid === undefined ? 'The feed has no episodes.' : 'This episode is not in the feed.';
  } catch (e) {
    return `The feed did not answer: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
}

// DynamoDB bodies: discover/ddb/admin-picks.ts (db/backend.ts).
export const getPickDay = viaStore<typeof import('../discover/ddb/admin-picks.ts').getPickDay>('dv/admin-picks', 'getPickDay');
export const adminPickDays = viaStore<typeof import('../discover/ddb/admin-picks.ts').adminPickDays>('dv/admin-picks', 'adminPickDays');
export const putPickDay = viaStore<typeof import('../discover/ddb/admin-picks.ts').putPickDay>('dv/admin-picks', 'putPickDay');
