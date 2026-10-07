// Interests routes: read and save my first-open categories, and send "Not liking these?" answers.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { addRecFeedback, cleanGenreIds, getInterests, INTERESTS_MIN, setInterests, skipInterests } from '../../db/repos/account/interests.ts';

/**
 * M22 US5 (contracts/api.md "Interests").
 *   GET /v1/me/interests      → { genreIds, skippedAt }
 *   PUT /v1/me/interests      { genreIds (≥ 2 known genres) } | { skip: true } → 204
 *   POST /v1/me/rec-feedback  { reason, note? ≤ 300, add?, remove? } → 204
 */
export const interests = new Hono<AuthEnv>();

interests.get('/', requireAuth, async (c) => c.json(await getInterests(c.get('db'), c.get('listener')!.id)));

const putBody = z.union([
  z.object({ genreIds: z.array(z.number().int()).min(INTERESTS_MIN).max(40) }),
  z.object({ skip: z.literal(true) }),
]);

interests.put('/', requireAuth, json(putBody), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  const id = c.get('listener')!.id;
  if ('skip' in b) {
    await skipInterests(db, id);
    return c.body(null, 204);
  }
  const ids = cleanGenreIds(b.genreIds);
  if (ids.length < INTERESTS_MIN) throw new ApiError('validation', `Pick at least ${INTERESTS_MIN} categories.`, { fields: ['genreIds'] });
  await setInterests(db, id, ids);
  return c.body(null, 204);
});

export const recFeedback = new Hono<AuthEnv>();

const feedbackBody = z.object({
  reason: z.enum(['familiar', 'topics', 'long', 'other']),
  note: z.string().max(300).optional(),
  add: z.array(z.number().int()).max(40).optional(),
  remove: z.array(z.number().int()).max(40).optional(),
});

recFeedback.post('/', requireAuth, json(feedbackBody), async (c) => {
  const b = c.req.valid('json');
  await addRecFeedback(c.get('db'), c.get('listener')!.id, {
    reason: b.reason,
    ...(b.note !== undefined ? { note: b.note } : {}),
    ...(b.add !== undefined ? { add: b.add } : {}),
    ...(b.remove !== undefined ? { remove: b.remove } : {}),
  });
  return c.body(null, 204);
});
