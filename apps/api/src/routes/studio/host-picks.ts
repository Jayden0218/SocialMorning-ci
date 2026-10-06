// Studio host picks: read and replace the episodes a show's host marks for its show page.
/**
 * Studio API (`/v1/studio/*`) — M21 US5 (FR-042): Host picks. A verified host of the show (its
 * proven owner or a helper — the `/shows/:show/*` wall answers 403 `no_role` to anyone else)
 * stars up to 20 of the show's episodes and orders them; the app's show page lists them under
 * the "Host picks" chip. PUT replaces the whole list (positions 1..n).
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { json } from '../../validate.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';
import { HOST_PICKS_MAX, hostPickItems, setHostPicks } from '../../db/repos/studio/show-page.ts';

const picksBody = z.object({ episodeIds: z.array(z.string().min(1).max(64)).max(HOST_PICKS_MAX) });

export function registerHostPicks(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/host-picks', async (c) => c.json({ items: await hostPickItems(c.get('db'), c.get('show').feedUrl) }));

  studio.put('/shows/:show/host-picks', json(picksBody), async (c) => {
    const db = c.get('db');
    const feedUrl = c.get('show').feedUrl;
    await setHostPicks(db, feedUrl, c.req.valid('json').episodeIds, c.get('listener')!.id);
    return c.json({ items: await hostPickItems(db, feedUrl) });
  });
}
