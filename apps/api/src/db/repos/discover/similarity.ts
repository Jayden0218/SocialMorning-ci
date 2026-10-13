// Computes which shows are similar, ignoring private listeners and storing no listener ids.
/**
 * M8 — show-to-show similarity (research R2/R3; guards G-R1, G-R2, G-R3).
 *
 * Three rules this file exists to keep:
 *
 *  1. **Shows, never episodes.** An episode is born with no interactions; ItemCF cannot
 *     serve it. A show accumulates interactions for years.
 *  2. **A private listener contributes nothing.** The owner's clarification of
 *     2026-09-25 was "one switch, one meaning" — private listening removes a listener
 *     from every shared computation, aggregate included, not only from what other people
 *     can see (G-R1).
 *  3. **No listener identifier may reach `show_similarity`** (G-R3). The table holds
 *     feed URLs and a number.
 *
 * The rebuild writes into `show_similarity_next` and swaps at the end, so a run that dies
 * between chunks never leaves half a neighbourhood visible (principle IV).
 *
 * The Swing computation itself is redone on every chunk. At thousands of shows and dozens
 * of listeners that is cheap and it keeps the chunking to one thing — which rows to WRITE
 * — instead of two. If the catalogue grows by an order of magnitude, cache the computed
 * map in `cache` between chunks rather than making the chunking cleverer.
 */
import { viaStore } from '../../backend.ts';

/** How stale a similarity table may be before the rebuild is presumed dead (research R4). */
export const SIMILARITY_STALE_HOURS = 168;

export type RebuildResult = { done: boolean; next?: string; written: number; shows: number };

// Each runs its DynamoDB body (ddb/similarity.ts) on the Store the Db carries (db/backend.ts).
export const likers = viaStore<typeof import('./ddb/similarity.ts').likers>('dv/similarity', 'likers');
export const rebuildSimilarity = viaStore<typeof import('./ddb/similarity.ts').rebuildSimilarity>('dv/similarity', 'rebuildSimilarity');
export const neighboursOf = viaStore<typeof import('./ddb/similarity.ts').neighboursOf>('dv/similarity', 'neighboursOf');
export const similarityAgeHours = viaStore<typeof import('./ddb/similarity.ts').similarityAgeHours>('dv/similarity', 'similarityAgeHours');
