import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import type { EpisodeCard } from '../catalog/apple.ts';
import { initialsOf } from '../db/repos/comment-likes.ts';
import { hiddenFeedUrls } from '../db/repos/moderation.ts';

/**
 * M12 FR-102 — mounted at /v1/me. "Friends are listening": episodes that people the caller
 * follows listened to in the last 7 days, from `listened_ranges`. NEVER a person whose
 * listening is private — neither now (`listeners.private_listening`) nor at the time
 * (M4 wrote `activity.hidden` from the switch at write time). No one across a block, no
 * suspended account, no show the owner hid. At most 30 episodes, newest first.
 */
export const friends = new Hono<AuthEnv>();

export const FRIENDS_MAX = 30;

type Row = {
  episode_id: string; listener_id: string; display_name: string; at: Date | string;
  feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string;
};

friends.get('/friends-listening', requireAuth, async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const rows = await db.query<Row>(
    `WITH r AS (
       SELECT lr.episode_id, lr.listener_id, max(lr.updated_at) AS at
       FROM follows f
       JOIN listened_ranges lr ON lr.listener_id = f.followed_id
       JOIN listeners l ON l.id = lr.listener_id
       WHERE f.follower_id = $1
         AND lr.updated_at > now() - interval '7 days'
         AND l.private_listening = false AND l.suspended_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.actor_id = lr.listener_id AND a.kind = 'listened' AND a.episode_id = lr.episode_id AND a.day = lr.day AND a.hidden)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = lr.listener_id) OR (b.blocker_id = lr.listener_id AND b.blocked_id = $1))
       GROUP BY lr.episode_id, lr.listener_id
     )
     SELECT r.episode_id, r.listener_id, l.display_name, r.at,
            e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url
     FROM r JOIN listeners l ON l.id = r.listener_id JOIN episodes e ON e.id = r.episode_id
     ORDER BY r.at DESC LIMIT 1000`,
    [me],
  );
  const hidden = await hiddenFeedUrls(db);
  const byEpisode = new Map<string, { episode: EpisodeCard & { id: string }; listeners: { id: string; name: string; initials: string | null }[]; lastAt: string }>();
  for (const r of rows) {
    if (hidden.has(r.feed_url)) continue;
    let item = byEpisode.get(r.episode_id);
    if (!item) {
      if (byEpisode.size >= FRIENDS_MAX) continue;
      const episode: EpisodeCard & { id: string } = {
        id: r.episode_id, feedUrl: r.feed_url, guid: r.guid, title: r.title, showTitle: r.show_title ?? '', enclosureUrl: r.enclosure_url,
        ...(r.image_url ? { imageUrl: r.image_url } : {}), ...(r.duration_ms !== null ? { durationMs: Number(r.duration_ms) } : {}),
      };
      item = { episode, listeners: [], lastAt: new Date(r.at).toISOString() };
      byEpisode.set(r.episode_id, item);
    }
    item.listeners.push({ id: r.listener_id, name: r.display_name, initials: initialsOf(r.display_name) });
  }
  c.header('cache-control', 'private, no-store');
  return c.json({ items: [...byEpisode.values()] });
});
