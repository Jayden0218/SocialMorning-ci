// "Friends are listening": what people I follow listened to in the last 7 days.
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { notHidden } from '../studio/hidden-episodes.ts';

export type FriendsListeningRow = {
  episode_id: string; listener_id: string; display_name: string; at: Date | string;
  feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string;
};

/** One row per (episode, listener) from people `me` follows, newest first, at most 1000. */
async function friendsListeningRowsPg(db: Db, me: string): Promise<FriendsListeningRow[]> {
  // M24 US11: hidden episodes leave this list.
  return db.query<FriendsListeningRow>(
    `WITH r AS (
       SELECT lr.episode_id, lr.listener_id, max(lr.updated_at) AS at
       FROM follows f
       JOIN listened_ranges lr ON lr.listener_id = f.followed_id
       JOIN listeners l ON l.id = lr.listener_id
       WHERE f.follower_id = $1
         AND lr.updated_at > now() - interval '7 days'
         AND l.private_listening = false AND l.suspended_at IS NULL AND l.hidden_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM activity a WHERE a.actor_id = lr.listener_id AND a.kind = 'listened' AND a.episode_id = lr.episode_id AND a.day = lr.day AND a.hidden)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = lr.listener_id) OR (b.blocker_id = lr.listener_id AND b.blocked_id = $1))
       GROUP BY lr.episode_id, lr.listener_id
     )
     SELECT r.episode_id, r.listener_id, l.display_name, r.at,
            e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url
     FROM r JOIN listeners l ON l.id = r.listener_id JOIN episodes e ON e.id = r.episode_id
     WHERE ${notHidden('e')}
     ORDER BY r.at DESC LIMIT 1000`,
    [me],
  );
}

// M26 lane SG: each runs on DynamoDB when the Db carries a Store (src/db/backend.ts; bodies in graph-ddb/).
export const friendsListeningRows = dual('sg/index', 'friendsListeningRows', friendsListeningRowsPg);
