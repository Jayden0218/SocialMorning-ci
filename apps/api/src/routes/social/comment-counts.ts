// Route returning comment counts for many episodes in one call.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { statsFor } from '../../db/repos/discover/discover-extras.ts';

/**
 * M12 FR-080, mounted at /v1/episodes — public.
 *   POST /comment-counts  { ids: string[] ≤ 100 } → { counts: { [episodeId]: number }, listeners: { [episodeId]: number } }
 * The Updates list shows each row's comment count; one call for the whole page instead of
 * one social poll per row. Same rule as Discover's pick cards (`statsFor`): top-level
 * comments not deleted, removed or hidden by a host. A count is an aggregate, so it is the
 * same for everyone — a block does not change it (M6 clarification). An id the server has
 * never seen answers 0. M12 FR-061: `listeners` (the show page's "plays") is the pick cards'
 * number too — distinct listeners whose listening is public (G2), never who they are.
 */
export const COUNTS_MAX = 100;
const body = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(COUNTS_MAX) });

export const commentCounts = new Hono<AuthEnv>();

commentCounts.post('/comment-counts', json(body), async (c) => {
  const { ids } = c.req.valid('json');
  const stats = await statsFor(c.get('db'), ids);
  const counts: Record<string, number> = {};
  const listeners: Record<string, number> = {};
  for (const id of ids) {
    counts[id] = stats.get(id)?.comments ?? 0;
    listeners[id] = stats.get(id)?.listeners ?? 0;
  }
  return c.json({ counts, listeners });
});
