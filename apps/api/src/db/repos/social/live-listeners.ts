// Counts "listening now" per episode using only daily-salted install hashes.
/**
 * M12 FR-042 — "N listening now". Guard G-L1: what is stored is ONLY
 * `sha256(installId : dailySalt)` with the episode and a time. No account, no listener, no
 * install id: the table has no column that could hold one, and the salt changes every UTC
 * day, so yesterday's hash cannot be matched to today's.
 */
import { createHash } from 'node:crypto';
import { viaStore } from '../../backend.ts';

/** Seen in the last 3 minutes counts as listening now. */
export const LIVE_WINDOW_S = 180;
/** One write per install per episode per minute; faster heartbeats are accepted and dropped. */
export const WRITE_EVERY_S = 60;
/** Older rows are deleted on each write to that episode. */
export const KEEP_S = 600;

export function dailySalt(pepper: string, now: Date): string {
  return createHash('sha256').update(pepper).update(':').update(now.toISOString().slice(0, 10)).digest('hex');
}

export function listenerHash(installId: string, salt: string): string {
  return createHash('sha256').update(installId).update(':').update(salt).digest('hex');
}

// Bodies in graph-ddb/ (src/db/backend.ts).
export const heartbeat = viaStore<typeof import('./graph-ddb/index.ts').heartbeat>('sg/index', 'heartbeat');
export const listeningNow = viaStore<typeof import('./graph-ddb/index.ts').listeningNow>('sg/index', 'listeningNow');
