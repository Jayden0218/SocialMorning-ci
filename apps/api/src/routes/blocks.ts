/** M6 blocks (contracts/api.md): GET/POST /v1/me/blocks · DELETE /v1/me/blocks/:id. Self and the owner are refused. */
import { Hono } from 'hono';
import { z } from 'zod';
import { canBlock } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { block, listBlocks, unblock } from '../db/repos/blocks.ts';

export const blocks = new Hono<AuthEnv>();

blocks.get('/', requireAuth, async (c) => c.json({ blocks: await listBlocks(c.get('db'), c.get('listener')!.id) }));

blocks.post('/', requireAuth, json(z.object({ listenerId: z.string().uuid() })), async (c) => {
  const me = c.get('listener')!;
  const target = c.req.valid('json').listenerId;
  const why = canBlock(me.id, target, c.get('safety').ownerListenerId);
  if (why === 'self') throw new ApiError('validation', "You can't block yourself.", { fields: ['listenerId'] });
  if (why === 'owner') throw new ApiError('validation', "You can't block the app's owner — write to them instead.", { fields: ['listenerId'] });
  const r = await block(c.get('db'), me.id, target);
  if (r === 'no_such_listener') throw new ApiError('not_found', 'No such listener.');
  return c.json({}, 201);
});

blocks.delete('/:id', requireAuth, async (c) => {
  await unblock(c.get('db'), c.get('listener')!.id, c.req.param('id'));
  return c.json({});
});
