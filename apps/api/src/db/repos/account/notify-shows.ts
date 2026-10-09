// Database queries for per-show new-episode notifications (M26: moved here from routes/account/notify.ts).
import type { Db } from '../../db.ts';

export type NotifyShowRow = { feed_url: string; title: string | null; enabled: boolean | null };

/** Every live subscription with its show title and the listener's switch (null = never set). */
export async function listNotifyShowRows(db: Db, listenerId: string): Promise<NotifyShowRow[]> {
  return db.query<NotifyShowRow>(
    `SELECT s.feed_url,
            (SELECT e.show_title FROM episodes e WHERE e.feed_url = s.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS title,
            p.enabled
     FROM subscriptions s LEFT JOIN notify_show_prefs p ON p.listener_id = s.listener_id AND p.feed_url = s.feed_url
     WHERE s.listener_id = $1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
    [listenerId],
  );
}

/** Turn one show's new-episode notification on or off. */
export async function setNotifyShow(db: Db, listenerId: string, feedUrl: string, enabled: boolean): Promise<void> {
  await db.query(
    `INSERT INTO notify_show_prefs (listener_id, feed_url, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (listener_id, feed_url) DO UPDATE SET enabled = excluded.enabled`,
    [listenerId, feedUrl, enabled],
  );
}
