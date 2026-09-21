import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth, requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { profile, setPrivateListening } from '../db/repos/profiles.ts';

/** Mounted at /v1/listeners — GET /:id (public; stats hidden when private, unless it is you). */
export const profiles = new Hono<AuthEnv>();

profiles.get('/:id', optionalAuth, async (c) => {
  const p = await profile(c.get('db'), c.req.param('id'), c.get('listener')?.id, new Date().toISOString().slice(0, 10));
  if (!p) throw new ApiError('not_found', 'No such listener.');
  return c.json({ profile: p });
});

/** Mounted at /v1/me/privacy — PUT { privateListening }. */
export const privacy = new Hono<AuthEnv>();

privacy.put('/', requireAuth, json(z.object({ privateListening: z.boolean() })), async (c) => {
  const v = c.req.valid('json').privateListening;
  await setPrivateListening(c.get('db'), c.get('listener')!.id, v);
  return c.json({ privateListening: v });
});
