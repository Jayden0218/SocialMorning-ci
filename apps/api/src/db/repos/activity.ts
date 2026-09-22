/**
 * The Following feed (M4 FR-008, research R4): activity rows by the people a listener
 * follows, `hidden = false` (guard G5: a private actor's listens never show — the flag was
 * fixed when the row was written, R5), newest first, keyset-paged on (created_at, id).
 */
import { createHash } from 'node:crypto';
import type { Db } from '../db.ts';

export type ActivityKind = 'listened' | 'clipped' | 'commented';

export type FeedRow = {
  id: string; kind: ActivityKind; actor_id: string; actor_name: string | null;
  episode_id: string; episode_title: string; show_title: string | null; image_url: string | null;
  moment_ms: number | null; ref_id: string | null; created_at: string;
};

export type FeedItemOut = {
  id: number; kind: ActivityKind; actor: { id: string; displayName: string | null };
  episode: { id: string; title: string; showTitle: string | null; imageUrl: string | null };
  momentMs: number | null; refId: string | null; createdAt: string;
};

export const toFeedItem = (r: FeedRow): FeedItemOut => ({
  id: Number(r.id), kind: r.kind, actor: { id: r.actor_id, displayName: r.actor_name },
  episode: { id: r.episode_id, title: r.episode_title, showTitle: r.show_title, imageUrl: r.image_url },
  momentMs: r.moment_ms, refId: r.ref_id, createdAt: new Date(r.created_at).toISOString(),
});

const SELECT = `SELECT a.id, a.kind, a.actor_id, l.display_name AS actor_name, a.episode_id, e.title AS episode_title, e.show_title, e.image_url,
                       a.moment_ms, a.ref_id, a.created_at
                FROM activity a JOIN listeners l ON l.id = a.actor_id JOIN episodes e ON e.id = a.episode_id`;

/** `before` is "<createdAt ISO>,<id>" from a previous page's `next`. */
export async function feedFor(db: Db, listenerId: string, before?: string, limit = 20): Promise<{ items: FeedRow[]; next?: string }> {
  const cursor = before ? parseCursor(before) : undefined;
  const rows = await db.query<FeedRow>(
    `${SELECT} WHERE a.hidden = false AND a.actor_id IN (SELECT followed_id FROM follows WHERE follower_id = $1)
     AND a.actor_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
     ${cursor ? 'AND (a.created_at, a.id) < ($3::timestamptz, $4::bigint)' : ''}
     ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
    cursor ? [listenerId, limit + 1, cursor.createdAt, cursor.id] : [listenerId, limit + 1],
  );
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const next = rows.length > limit && last ? `${new Date(last.created_at).toISOString()},${last.id}` : undefined;
  return { items, ...(next ? { next } : {}) };
}

function parseCursor(s: string): { createdAt: string; id: string } | undefined {
  const i = s.lastIndexOf(',');
  if (i < 0) return undefined;
  const createdAt = s.slice(0, i);
  const id = s.slice(i + 1);
  return Number.isNaN(Date.parse(createdAt)) || !/^\d+$/.test(id) ? undefined : { createdAt, id };
}

/** Recent public activity by one listener, for their profile. */
export async function recentBy(db: Db, actorId: string, limit = 20): Promise<FeedRow[]> {
  return db.query<FeedRow>(`${SELECT} WHERE a.actor_id = $1 AND a.hidden = false ORDER BY a.created_at DESC, a.id DESC LIMIT $2`, [actorId, limit]);
}

/** A weak validator for the first page: the newest visible id and the count, hashed. */
export function etagFor(items: readonly FeedRow[]): string {
  const h = createHash('sha256').update(items.map((r) => r.id).join(',')).digest('base64url').slice(0, 16);
  return `W/"${h}"`;
}
