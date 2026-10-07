// Mute routes: list the listeners I muted, mute one, unmute one.
/**
 * M21 US6 (contracts/api.md, G-M21-6) — mounted at /v1/me/mutes:
 *   GET /               → { items: { id, name, avatarUrl }[] }
 *   PUT /:listenerId    → 204 (idempotent; yourself → 400, unknown → 404)
 *   DELETE /:listenerId → 204 (idempotent)
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { listMutes, mute, unmute } from '../../db/repos/social/mutes.ts';

export const mutes = new Hono<AuthEnv>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

mutes.get('/', requireAuth, async (c) => c.json({ items: await listMutes(c.get('db'), c.get('listener')!.id) }));

mutes.put('/:listenerId', requireAuth, async (c) => {
  const me = c.get('listener')!;
  const target = c.req.param('listenerId');
  if (target === me.id) throw new ApiError('validation', "You can't mute yourself.", { fields: ['listenerId'] });
  if (!UUID.test(target)) throw new ApiError('not_found', 'No such listener.');
  const r = await mute(c.get('db'), me.id, target);
  if (r === 'no_such_listener') throw new ApiError('not_found', 'No such listener.');
  return c.body(null, 204);
});

mutes.delete('/:listenerId', requireAuth, async (c) => {
  const target = c.req.param('listenerId');
  if (UUID.test(target)) await unmute(c.get('db'), c.get('listener')!.id, target);
  return c.body(null, 204);
});
