// Host notices: announcements from the shows a listener follows, from their release time.
/**
 * M19 US10 (FR-062). The "From hosts" list in Notifications: announcements of every show the
 * listener subscribes to, newest first, only once `release_at` has come, never from a hidden show.
 */
import type { Db } from '../../db.ts';
import { imagesOf } from '../studio/announcements.ts';

export const NOTICES_PAGE = 20;

export type HostNotice = { id: string; feedUrl: string; showTitle: string; imageUrl?: string; body: string; images: string[]; releaseAt: string };

export async function hostNotices(db: Db, listenerId: string, before: string | undefined): Promise<{ items: HostNotice[]; next?: string }> {
  const rows = await db.query<{ id: string; feed_url: string; body: string; images: unknown; release_at: Date | string; show_title: string | null; image_url: string | null }>(
    `SELECT a.id, a.feed_url, a.body, a.images, a.release_at, e.show_title, e.image_url
     FROM announcements a
     JOIN subscriptions s ON s.feed_url = a.feed_url AND s.listener_id = $1 AND s.deleted_at IS NULL
     LEFT JOIN LATERAL (SELECT show_title, image_url FROM episodes WHERE episodes.feed_url = a.feed_url AND show_title IS NOT NULL ORDER BY updated_at DESC LIMIT 1) e ON true
     WHERE a.deleted_at IS NULL AND a.release_at <= now()
       AND NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = a.feed_url)
       AND ($2::timestamptz IS NULL OR a.release_at < $2::timestamptz)
     ORDER BY a.release_at DESC LIMIT ${NOTICES_PAGE + 1}`,
    [listenerId, before ?? null],
  );
  const slice = rows.slice(0, NOTICES_PAGE);
  const last = slice[slice.length - 1];
  return {
    items: slice.map((r) => ({
      id: r.id, feedUrl: r.feed_url, showTitle: r.show_title ?? '', ...(r.image_url ? { imageUrl: r.image_url } : {}),
      body: r.body, images: imagesOf(r.images), releaseAt: new Date(r.release_at).toISOString(),
    })),
    ...(rows.length > NOTICES_PAGE && last ? { next: new Date(last.release_at).toISOString() } : {}),
  };
}
