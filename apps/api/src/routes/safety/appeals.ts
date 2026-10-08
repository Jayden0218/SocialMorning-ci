// Appeal routes for the phone: what I may appeal, and sending one appeal per action — even while suspended.
/**
 * M24 US6 — mounted at /v1/appeals:
 *   GET  /        → { items: Appealable[] }
 *   POST / { actionId, text 1–1000 } → 201 { id } · 404 not_found (not yours to appeal) · 409 conflict (sent already)
 *
 * Who is asking: a session (`Authorization: Bearer`) — a suspended one too, which every other
 * route refuses — or the `x-appeal-token` the `suspended` answer carried (auth/appeal-token.ts),
 * since the phone forgets its session when it hears "suspended".
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { listenerForToken, type AuthEnv } from '../../auth/session.ts';
import { listenerForAppealToken } from '../../auth/appeal-token.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { APPEAL_TEXT_MAX, appealableFor, sendAppeal } from '../../db/repos/safety/appeals.ts';

type AppealEnv = { Variables: AuthEnv['Variables'] & { appellant: string } };

const appellant: MiddlewareHandler<AppealEnv> = async (c, next) => {
  const h = c.req.header('authorization');
  const bearer = h && /^bearer /i.test(h) ? h.slice(7).trim() : '';
  let id: string | undefined;
  if (bearer) id = (await listenerForToken(c.get('db'), bearer, c.get('pepper'), c.get('pepperNext')))?.id;
  if (!id) {
    const t = c.req.header('x-appeal-token');
    const next = c.get('pepperNext');
    if (t) id = listenerForAppealToken(t, c.get('pepper')) ?? (next ? listenerForAppealToken(t, next) : undefined); // M25 SB: either pepper
  }
  if (!id) throw new ApiError('unauthenticated', 'Sign in to appeal.');
  c.set('appellant', id);
  c.header('cache-control', 'private, no-store');
  await next();
};

export const appeals = new Hono<AppealEnv>();

appeals.get('/', appellant, async (c) => c.json({ items: await appealableFor(c.get('db'), c.get('appellant')) }));

appeals.post('/', appellant, json(z.object({ actionId: z.string().uuid(), text: z.string().trim().min(1).max(APPEAL_TEXT_MAX) })), async (c) => {
  const b = c.req.valid('json');
  const r = await sendAppeal(c.get('db'), c.get('appellant'), b.actionId, b.text);
  if (r === 'not_appealable') throw new ApiError('not_found', 'There is nothing to appeal here.');
  if (r === 'already') throw new ApiError('conflict', 'You already appealed this. We will tell you what we decide.');
  return c.json(r, 201);
});
