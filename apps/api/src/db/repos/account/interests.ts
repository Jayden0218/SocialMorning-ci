// A listener's chosen categories (first-open interests) and their "Not liking these?" answers.
/**
 * M22 US5 (FR-017–FR-019, research R5). `listener_interests` keeps the Apple top-level genre
 * ids a listener picked on first open (≥ 2), or the moment they skipped. For You reads them as
 * its "interests" channel; `interestsStamp` is part of its cache key, so a change shows on the
 * next refresh. `rec_feedback` keeps each "Not liking these?" answer; its category changes are
 * applied to `listener_interests` at once.
 */
import { APPLE_GENRES } from '../../../catalog/genres.ts';
import { viaStore } from '../../backend.ts';

export const INTERESTS_MIN = 2;
const KNOWN = new Set(Object.values(APPLE_GENRES));

/** Only Apple's top-level genre ids, each once, in the order given. */
export function cleanGenreIds(ids: readonly number[]): number[] {
  const out: number[] = [];
  for (const id of ids) if (KNOWN.has(id) && !out.includes(id)) out.push(id);
  return out;
}

export type Interests = { genreIds: number[]; skippedAt: string | null };

export const getInterests = viaStore<typeof import('./ddb/index.ts').getInterests>('ac/index', 'getInterests');

export const setInterests = viaStore<typeof import('./ddb/index.ts').setInterests>('ac/index', 'setInterests');

/** Skip keeps whatever was picked before (normally nothing) and records when. */
export const skipInterests = viaStore<typeof import('./ddb/index.ts').skipInterests>('ac/index', 'skipInterests');

export type RecFeedbackIn = { reason: 'familiar' | 'topics' | 'long' | 'other'; note?: string; add?: number[]; remove?: number[] };

/** Stores the answer, then applies its category changes (FR-019). */
export const addRecFeedback = viaStore<typeof import('./ddb/index.ts').addRecFeedback>('ac/index', 'addRecFeedback');

/** Part of For You's cache key: any change to the interests is a new key. */
export const interestsStamp = viaStore<typeof import('./ddb/index.ts').interestsStamp>('ac/index', 'interestsStamp');

/** How many episodes the listener has listened to — the interests channel fades as this grows. */
export const playCount = viaStore<typeof import('./ddb/index.ts').playCount>('ac/index', 'playCount');
