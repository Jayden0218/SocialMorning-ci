// Likes with a note: like or unlike an episode, a timeline of likes from people you follow.
/**
 * M19 US3 (FR-020–FR-022). A like (喜欢) carries an optional note of at most 140 characters. Others
 * see a listener's likes only while `likes_public` is on; a blocked listener (either way), a
 * suspended account and a hidden show never appear (M6 rules, applied at read time).
 */
import type { Db } from '../../db.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';

export const TIMELINE_PAGE = 20;

export type LikeItem = {
  listener?: { id: string; displayName: string; avatarUrl?: string };
  episode: EpisodeCard & { id: string };
  note?: string;
  createdAt: string;
};

type Row = {
  listener_id: string; display_name: string; avatar_url: string | null; note: string | null; created_at: Date | string;
  id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null;
  duration_ms: number | null; enclosure_url: string; published_at: Date | string | null;
};

const COLS = `k.listener_id, l.display_name, l.avatar_url, k.note, k.created_at,
  e.id, e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url, e.published_at`;
const FROM = `FROM episode_likes k JOIN listeners l ON l.id = k.listener_id AND l.suspended_at IS NULL
  JOIN episodes e ON e.id = k.episode_id
  WHERE NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = e.feed_url)`;

function toItem(r: Row, withListener: boolean): LikeItem {
  return {
    ...(withListener ? { listener: { id: r.listener_id, displayName: r.display_name, ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) } } : {}),
    episode: {
      id: r.id, feedUrl: r.feed_url, guid: r.guid, title: r.title, showTitle: r.show_title ?? '', enclosureUrl: r.enclosure_url,
      ...(r.image_url ? { imageUrl: r.image_url } : {}), ...(r.duration_ms !== null ? { durationMs: r.duration_ms } : {}),
      ...(r.published_at !== null ? { publishedAt: new Date(r.published_at).toISOString() } : {}),
    },
    ...(r.note ? { note: r.note } : {}),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function like(db: Db, listenerId: string, episodeId: string, note: string | undefined): Promise<void> {
  await db.query(
    `INSERT INTO episode_likes (listener_id, episode_id, note) VALUES ($1, $2, $3)
     ON CONFLICT (listener_id, episode_id) DO UPDATE SET note = EXCLUDED.note`,
    [listenerId, episodeId, note ?? null],
  );
}

export async function unlike(db: Db, listenerId: string, episodeId: string): Promise<void> {
  await db.query('DELETE FROM episode_likes WHERE listener_id = $1 AND episode_id = $2', [listenerId, episodeId]);
}

export async function myLike(db: Db, listenerId: string, episodeId: string): Promise<{ liked: boolean; note?: string }> {
  const [r] = await db.query<{ note: string | null }>('SELECT note FROM episode_likes WHERE listener_id = $1 AND episode_id = $2', [listenerId, episodeId]);
  return r ? { liked: true, ...(r.note ? { note: r.note } : {}) } : { liked: false };
}

const page = (rows: Row[], withListener: boolean) => {
  const slice = rows.slice(0, TIMELINE_PAGE);
  const last = slice[slice.length - 1];
  return { items: slice.map((r) => toItem(r, withListener)), ...(rows.length > TIMELINE_PAGE && last ? { next: new Date(last.created_at).toISOString() } : {}) };
};

/** Likes from accounts the viewer follows, newest first, `before` an ISO time for the next page. */
export async function timeline(db: Db, viewerId: string, before: string | undefined): Promise<{ items: LikeItem[]; next?: string }> {
  const rows = await db.query<Row>(
    `SELECT ${COLS} ${FROM}
       AND k.listener_id IN (SELECT followed_id FROM follows WHERE follower_id = $1)
       AND l.likes_public = true
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = k.listener_id) OR (b.blocker_id = k.listener_id AND b.blocked_id = $1))
       AND NOT EXISTS (SELECT 1 FROM listener_mutes m WHERE m.muter_id = $1 AND m.muted_id = k.listener_id) -- M21 US6 (G-M21-6)
       AND ($2::timestamptz IS NULL OR k.created_at < $2::timestamptz)
     ORDER BY k.created_at DESC LIMIT ${TIMELINE_PAGE + 1}`,
    [viewerId, before ?? null],
  );
  return page(rows, true);
}

/** One account's likes: everyone sees them while likes are public; the account itself always does. */
export async function likesOf(db: Db, ownerId: string, viewerId: string | undefined, before: string | undefined): Promise<{ items: LikeItem[]; next?: string }> {
  const rows = await db.query<Row>(
    `SELECT ${COLS} ${FROM}
       AND k.listener_id = $1
       AND (l.likes_public = true OR k.listener_id = $2)
       AND ($2::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = $2)))
       AND ($3::timestamptz IS NULL OR k.created_at < $3::timestamptz)
     ORDER BY k.created_at DESC LIMIT ${TIMELINE_PAGE + 1}`,
    [ownerId, viewerId ?? null, before ?? null],
  );
  return page(rows, false);
}
