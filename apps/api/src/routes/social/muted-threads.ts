// Muted-thread routes: mute or unmute one notice thread, list them; stop like notices on my comment.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { listMutedThreads, muteThread, setLikeNotices, unmuteThread, validThreadKey } from '../../db/repos/social/muted-threads.ts';

/**
 * M22 US3 (contracts/api.md "Push") — mounted at /v1/me/muted-threads:
 *   GET    /                      → { items: { threadKind, threadKey, title, createdAt }[] }
 *   PUT    /  { threadKind, threadKey } → 204
 *   DELETE /  { threadKind, threadKey } → 204 (also `?threadKind=&threadKey=`, for clients that send no DELETE body)
 */
export const mutedThreads = new Hono<AuthEnv>();

const thread = z.object({ threadKind: z.enum(['comment', 'like_post']), threadKey: z.string().min(1).max(300) });

mutedThreads.get('/', requireAuth, async (c) => {
  c.header('cache-control', 'private, no-store');
  return c.json({ items: await listMutedThreads(c.get('db'), c.get('listener')!.id) });
});

mutedThreads.put('/', requireAuth, json(thread), async (c) => {
  const b = c.req.valid('json');
  if (!validThreadKey(b.threadKind, b.threadKey)) throw new ApiError('validation', 'No such thread.', { fields: ['threadKey'] });
  await muteThread(c.get('db'), c.get('listener')!.id, b.threadKind, b.threadKey);
  return c.body(null, 204);
});

mutedThreads.delete('/', requireAuth, async (c) => {
  let raw: unknown = { threadKind: c.req.query('threadKind'), threadKey: c.req.query('threadKey') };
  if ((c.req.header('content-type') ?? '').includes('application/json')) {
    try { raw = await c.req.json(); } catch { /* fall back to the query */ }
  }
  const b = thread.safeParse(raw);
  if (!b.success) throw new ApiError('validation', 'Check these fields: threadKind, threadKey.', { fields: ['threadKind', 'threadKey'] });
  await unmuteThread(c.get('db'), c.get('listener')!.id, b.data.threadKind, b.data.threadKey);
  return c.body(null, 204);
});

/** M22 US3 (FR-012) — mounted at /v1/comments: PUT /:id/like-notices { off } → 204, the author only. */
export const commentLikeNotices = new Hono<AuthEnv>();

commentLikeNotices.put('/:id/like-notices', requireAuth, json(z.object({ off: z.boolean() })), async (c) => {
  const r = await setLikeNotices(c.get('db'), c.req.param('id'), c.get('listener')!.id, c.req.valid('json').off);
  if (r === 'not_found') throw new ApiError('not_found', 'No such comment.');
  if (r === 'forbidden') throw new ApiError('forbidden', 'Only the author can change this.');
  return c.body(null, 204);
});
