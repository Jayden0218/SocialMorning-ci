/**
 * M13 — the public RSS feed of a show created in the Studio (FR-003). Any podcast app, and the
 * SocialMorning app's own show page, reads it like any other feed.
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { feedXml, hostedById, listHostedEpisodes, promoteDue } from '../../db/repos/studio/hosted.ts';

export const feeds = new Hono<AuthEnv>();

feeds.get('/:file', async (c) => {
  const m = /^([0-9a-f-]{36})\.xml$/i.exec(c.req.param('file'));
  if (!m) return c.text('Not found', 404);
  const db = c.get('db');
  const [row] = await db.query<{ deleted: boolean }>('SELECT deleted_at IS NOT NULL AS deleted FROM hosted_shows WHERE id = $1', [m[1]]);
  if (!row) return c.text('Not found', 404);
  if (row.deleted) return c.text('This show was removed by its creator.', 410);
  const show = await hostedById(db, m[1]!);
  if (!show) return c.text('Not found', 404);
  await promoteDue(db, show);
  // Drafts and scheduled episodes stay out until their time (guard G-S1).
  const body = feedXml(show, await listHostedEpisodes(db, show.id, { liveOnly: true }));
  return c.body(body, 200, { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=60' });
});
