// Stores listened time ranges per device and counts their union across devices.
/**
 * Listened ranges (M4 FR-012, research R3/R4). A phone REPLACES its own merged set per
 * (listener, episode, day, device); time listened is the UNION across devices (guard G3
 * on the server side); the `listened` activity row is written once per (listener,
 * episode, day) when the union first crosses the threshold or the episode is finished
 * (guard G6: the UNIQUE), with `hidden` fixed from the listener's switch at that moment
 * (research R5).
 */
import { unionLength, type Range } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export type ListenedDayIn = { episodeId: string; day: string; ranges: Range[] };

/** M21 US6 (G-M21-12): what one replace adds to `listeners.listened_ms` — the union's change. */
export function listenedDelta(beforeUnionMs: number, afterUnionMs: number): number {
  return Math.round(afterUnionMs - beforeUnionMs);
}

/** The union across devices of one (listener, episode, day), from rows of `listened_ranges.ranges`. */
export function unionOfRows(rows: readonly { ranges: Range[] | string }[]): number {
  return unionLength(rows.map((r) => (typeof r.ranges === 'string' ? (JSON.parse(r.ranges) as Range[]) : r.ranges)));
}

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const replaceRanges = viaStore<typeof import('./ddb/listened.ts').replaceRanges>('lb/listened', 'replaceRanges');
export const listenedRowsFor = viaStore<typeof import('./ddb/listened.ts').listenedRowsFor>('lb/listened', 'listenedRowsFor');
