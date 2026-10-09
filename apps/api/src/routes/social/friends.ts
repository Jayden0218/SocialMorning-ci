// Route listing episodes that people I follow listened to this week.
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import type { EpisodeCard } from '../../catalog/apple.ts';
import { initialsOf } from '../../db/repos/social/comment-likes.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { friendsListeningRows } from '../../db/repos/social/friends-listening.ts';

/**
 * M12 FR-102 — mounted at /v1/me. "Friends are listening": episodes that people the caller
 * follows listened to in the last 7 days, from `listened_ranges`. NEVER a person whose
 * listening is private — neither now (`listeners.private_listening`) nor at the time
 * (M4 wrote `activity.hidden` from the switch at write time). No one across a block, no
 * suspended account, no show the owner hid. At most 30 episodes, newest first.
 */
export const friends = new Hono<AuthEnv>();

export const FRIENDS_MAX = 30;

friends.get('/friends-listening', requireAuth, async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const rows = await friendsListeningRows(db, me);
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
