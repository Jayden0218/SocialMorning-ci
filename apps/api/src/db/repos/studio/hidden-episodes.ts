// Episodes of a claimed show that its creator hid from listeners.
/**
 * M24 US11 (specs/025-m24-gaps-and-look). A creator hides one episode of a claimed feed; the
 * server then leaves it out of every list it builds for listeners (Discover, For You, search,
 * next-up, issues, friends' listening, the show's own episode lists the server serves). Rows are
 * keyed by (feed_url, guid) — the publisher's own identity for an item — so a hide survives the
 * episode being re-registered. The phone parses a show's feed itself; it learns the hidden guids
 * from `GET /v1/shows/hidden-episodes?feedUrl=` (creators/extras.ts).
 *
 * Comments, likes and positions on a hidden episode are kept (a hide is undone with one click).
 * Admin's hide-with-a-reason (A3) lives here too, so every write of the hidden set goes through this repo (ddb/page.ts).
 */
import { viaStore } from '../../backend.ts';

export type HiddenEpisode = { episodeId: string; guid: string; title: string; hiddenAt: string };

// ---- Admin › Lists › hidden episodes (M25 A3) ----

export type HiddenEpRow = { feed_url: string; guid: string; reason: string | null; hidden_at: Date | string; title: string | null; show_title: string | null; hidden_by: string | null };

// DynamoDB bodies: ddb/page.ts (db/backend.ts).
export const hiddenEpisodeIds = viaStore<typeof import('./ddb/page.ts').hiddenEpisodeIds>('st/page', 'hiddenEpisodeIds');
export const hiddenGuids = viaStore<typeof import('./ddb/page.ts').hiddenGuids>('st/page', 'hiddenGuids');
export const listHidden = viaStore<typeof import('./ddb/page.ts').listHidden>('st/page', 'listHidden');
export const setHidden = viaStore<typeof import('./ddb/page.ts').setHidden>('st/page', 'setHidden');
export const hiddenEpisodeRows = viaStore<typeof import('./ddb/page.ts').hiddenEpisodeRows>('st/page', 'hiddenEpisodeRows');
export const hiddenEpisodeReason = viaStore<typeof import('./ddb/page.ts').hiddenEpisodeReason>('st/page', 'hiddenEpisodeReason');
export const hideEpisodeWithReason = viaStore<typeof import('./ddb/page.ts').hideEpisodeWithReason>('st/page', 'hideEpisodeWithReason');
export const unhideEpisode = viaStore<typeof import('./ddb/page.ts').unhideEpisode>('st/page', 'unhideEpisode');
