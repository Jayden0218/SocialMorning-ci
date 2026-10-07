// Studio comment routes: list a show's comments, reply, hide, unhide and pin.
/**
 * Studio API (`/v1/studio/*`) — US3: Comments
 */
import { ApiError } from '../../errors.ts';
import { z } from 'zod';
import { json } from '../../validate.ts';
import { commentOnFeed, listShowComments, setHostHidden } from '../../db/repos/studio/studio-comments.ts';
import { createComment, toPublic } from '../../db/repos/social/comments.ts';
import { pinAsHost, pinBottomAsHost } from '../../db/repos/social/comment-extras.ts';
import { registerBans } from './bans.ts';
import { isBlockedBy } from '../../db/repos/safety/blocks.ts';
import type { Context, Hono } from 'hono';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerComments(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/comments', async (c) =>
    c.json(await listShowComments(c.get('db'), c.get('show').feedUrl, {
      ...(c.req.query('q') ? { q: c.req.query('q')! } : {}),
      ...(c.req.query('episodeId') ? { episodeId: c.req.query('episodeId')! } : {}),
      ...(c.req.query('before') ? { before: c.req.query('before')! } : {}),
    })));

  const replyBody = z.object({ body: z.string().trim().min(1).max(2000) });

  /** The same rules as the app's POST: 5 s floor, no reply to someone who blocked you, one level deep. */
  studio.post('/shows/:show/comments/:id/reply', json(replyBody), async (c) => {
    const db = c.get('db');
    const me = c.get('listener')!;
    const parent = await commentOnFeed(db, c.get('show').feedUrl, c.req.param('id'));
    if (!parent) throw new ApiError('not_found', 'No such comment on this show.');
    const [recent] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM comments WHERE author_id = $1 AND created_at > now() - interval '5 seconds'", [me.id]);
    if (Number(recent?.n ?? 0) > 0) throw new ApiError('locked', 'One comment every few seconds, please.', { retryAfterSeconds: 5 });
    if (parent.author_id && parent.author_id !== me.id && (await isBlockedBy(db, parent.author_id, me.id))) {
      throw new ApiError('blocked', "You can't interact with this listener.");
    }
    // Reply to the thread's top comment when answering a reply (replies are one level deep).
    const created = await createComment(db, { episodeId: parent.episode_id, authorId: me.id, body: c.req.valid('json').body, parentId: parent.parent_id ?? parent.id });
    return c.json({ comment: toPublic(created, me.id) }, 201);
  });

  studio.post('/shows/:show/comments/:id/hide', async (c) => {
    await setHostHidden(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.get('listener')!.id, true);
    return c.body(null, 204);
  });

  studio.post('/shows/:show/comments/:id/unhide', async (c) => {
    await setHostHidden(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.get('listener')!.id, false);
    return c.body(null, 204);
  });

  /** M19 US5 (FR-040, FR-071): pin one top-level comment per episode; pinning another moves the pin. */
  for (const [verb, pin] of [['pin', true], ['unpin', false]] as const) {
    studio.post(`/shows/:show/comments/:id/${verb}`, async (c) => {
      const db = c.get('db');
      const row = await commentOnFeed(db, c.get('show').feedUrl, c.req.param('id'));
      if (!row || row.author_id === null) throw new ApiError('not_found', 'No such comment on this show.');
      if (row.parent_id !== null) throw new ApiError('validation', 'Only a top-level comment can be pinned.');
      await pinAsHost(db, row.id, row.episode_id, c.get('listener')!.id, pin);
      return c.body(null, 204);
    });
  }

  /** M22 US10 (FR-030, G-M22-11): one bottom pin per episode, last under every sort; a new one replaces the old. */
  const pinBottom = (pin: boolean) => async (c: Context<StudioEnv>) => {
    const db = c.get('db');
    const row = await commentOnFeed(db, c.get('show').feedUrl, c.req.param('id') ?? '');
    if (!row || row.author_id === null) throw new ApiError('not_found', 'No such comment on this show.');
    if (row.parent_id !== null) throw new ApiError('validation', 'Only a top-level comment can be pinned.');
    await pinBottomAsHost(db, row.id, row.episode_id, pin);
    return c.body(null, 204);
  };
  studio.post('/shows/:show/comments/:id/pin-bottom', pinBottom(true));
  studio.delete('/shows/:show/comments/:id/pin-bottom', pinBottom(false));

  // M22 US10 (FR-031): the Banned listeners list lives beside the comments it protects.
  registerBans(studio);
}
