// "Not interested" choices: episodes and shows a listener asked For You to stop showing.
/**
 * M19 US2 (FR-010–FR-012). An episode or a whole show the listener turned down. For You leaves
 * them out from the next request (filtered after its cache, and the cache key changes so the list
 * refills); charts, search and show pages are not affected.
 */
import { viaStore } from '../../backend.ts';

export type DismissalKind = 'episode' | 'show';
export type Dismissal = { kind: DismissalKind; itemKey: string; title?: string; createdAt: string };
export type Dismissed = { episodes: Set<string>; shows: Set<string> };

/** True when this episode, or its show, was turned down. */
export const isDismissed = (d: Dismissed, episodeId: string, feedUrl: string): boolean => d.episodes.has(episodeId) || d.shows.has(feedUrl);

// Each runs its DynamoDB body (ddb/dismissals.ts) on the Store the Db carries (db/backend.ts).
export const dismissedFor = viaStore<typeof import('./ddb/dismissals.ts').dismissedFor>('dv/dismissals', 'dismissedFor');
export const listDismissals = viaStore<typeof import('./ddb/dismissals.ts').listDismissals>('dv/dismissals', 'listDismissals');
export const addDismissal = viaStore<typeof import('./ddb/dismissals.ts').addDismissal>('dv/dismissals', 'addDismissal');
export const removeDismissal = viaStore<typeof import('./ddb/dismissals.ts').removeDismissal>('dv/dismissals', 'removeDismissal');
export const dismissalStamp = viaStore<typeof import('./ddb/dismissals.ts').dismissalStamp>('dv/dismissals', 'dismissalStamp');
