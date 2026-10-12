// Show announcements; at most two pushed per show each month.
/**
 * M11 US5 — a show's announcements (FR-020, FR-021). At most 2 are PUSHED per show per UTC
 * calendar month; over the limit, publishing is refused rather than silently not pushed, so the
 * creator is never surprised (guard G-N2). An edit changes the text and never pushes again.
 */
import { viaStore } from '../../backend.ts';

export const PUSHES_PER_MONTH = 2;

/** M19 US12: up to 9 pictures and a release time (a scheduled one is listed only from then, and not pushed). */
export type Announcement = { id: string; body: string; createdAt: string; editedAt: string | null; pushedAt: string | null; images: string[]; releaseAt: string };
/** A stored images value (an array, or a JSON string of one) as a list of strings. */
export const imagesOf = (v: unknown): string[] => {
  const a = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : [];
};
export const ANNOUNCEMENT_IMAGES_MAX = 9;

/** The first day of next month (UTC), as YYYY-MM-DD. */
export function resetsOn(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

// DynamoDB bodies: ddb/announce.ts (db/backend.ts).
export const listAnnouncements = viaStore<typeof import('./ddb/announce.ts').listAnnouncements>('st/announce', 'listAnnouncements');
export const publish = viaStore<typeof import('./ddb/announce.ts').publish>('st/announce', 'publish');
export const edit = viaStore<typeof import('./ddb/announce.ts').edit>('st/announce', 'edit');
export const remove = viaStore<typeof import('./ddb/announce.ts').remove>('st/announce', 'remove');
