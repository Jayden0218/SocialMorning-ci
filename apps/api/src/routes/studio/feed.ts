// Studio routes for a claimed feed: its last fetch and "Sync now", and hiding one episode from listeners.
/**
 * Studio API (`/v1/studio/*`) — M24 US10 (feed sync status) and US11 (hide an episode).
 */
import { z } from 'zod';
import type { Hono } from 'hono';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { claimManual, recordSync, syncStatus } from '../../db/repos/studio/feed-sync.ts';
import { listHidden, setHidden } from '../../db/repos/studio/hidden-episodes.ts';
import { refreshOne } from '../internal.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerFeed(studio: Hono<StudioEnv>): void {
  /** US10: when the feed was last fetched, whether it worked, the error, and when Sync now is next allowed. */
  studio.get('/shows/:show/feed-sync', async (c) => {
    const show = c.get('show');
    return c.json({ hosted: show.hosted, ...(await syncStatus(c.get('db'), show.feedUrl)) });
  });

  /** US10: fetch the feed now — at most once per 10 minutes per feed (429 `locked` with retryAfterSeconds). */
  studio.post('/shows/:show/feed-sync', async (c) => {
    const db = c.get('db');
    const show = c.get('show');
    if (show.hosted) throw new ApiError('validation', 'This show is made here; its feed is always up to date.');
    if (!(await claimManual(db, show.feedUrl))) {
      const s = await syncStatus(db, show.feedUrl);
      const wait = s.nextManualAt ? Math.max(1, Math.ceil((Date.parse(s.nextManualAt) - Date.now()) / 1000)) : 600;
      throw new ApiError('locked', 'Sync now works once every 10 minutes.', { retryAfterSeconds: wait });
    }
    // The cached copy would answer for up to its lifetime: drop it so this is a real fetch.
    await db.query('DELETE FROM cache WHERE key = $1', [`feed:${show.feedUrl}`]);
    const counts = { registered: 0, pushed: 0, moved: 0, blocked: 0 };
    let error: string | null = null;
    try {
      await refreshOne(db, c.get('catalog'), show.feedUrl, counts, []);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await recordSync(db, show.feedUrl, error === null, error);
    return c.json({ hosted: false, ...(await syncStatus(db, show.feedUrl)), registered: counts.registered });
  });

  /** US11: the episodes this show hid from listeners. */
  studio.get('/shows/:show/hidden-episodes', async (c) => c.json({ items: await listHidden(c.get('db'), c.get('show').feedUrl) }));

  /** US11: hide or show again one episode. Comments, likes and positions on it are kept. */
  studio.put('/shows/:show/episodes/:id/hidden', json(z.object({ hidden: z.boolean() }).strict()), async (c) => {
    await setHidden(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.req.valid('json').hidden, c.get('listener')!.id);
    return c.json({ hidden: c.req.valid('json').hidden });
  });
}
