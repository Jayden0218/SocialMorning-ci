/**
 * M12 FR-042 — "N listening now". Guard G-L1: what is stored is ONLY
 * `sha256(installId : dailySalt)` with the episode and a time. No account, no listener, no
 * install id: the table has no column that could hold one, and the salt changes every UTC
 * day, so yesterday's hash cannot be matched to today's.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../../db.ts';

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

export async function heartbeat(db: Db, episodeId: string, installId: string, pepper: string, now = new Date()): Promise<void> {
  const hash = listenerHash(installId, dailySalt(pepper, now));
  await db.query(
    `INSERT INTO live_listeners (episode_id, listener_hash, seen_at) VALUES ($1, $2, now())
     ON CONFLICT (episode_id, listener_hash) DO UPDATE SET seen_at = now()
     WHERE live_listeners.seen_at < now() - ($3 || ' seconds')::interval`,
    [episodeId, hash, String(WRITE_EVERY_S)],
  );
  await db.query(`DELETE FROM live_listeners WHERE episode_id = $1 AND seen_at < now() - ($2 || ' seconds')::interval`, [episodeId, String(KEEP_S)]);
}

export async function listeningNow(db: Db, episodeId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM live_listeners WHERE episode_id = $1 AND seen_at > now() - ($2 || ' seconds')::interval`,
    [episodeId, String(LIVE_WINDOW_S)],
  );
  return Number(r?.n ?? 0);
}
