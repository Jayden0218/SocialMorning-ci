// Profile routes: read a listener's profile and public subscriptions, and set my privacy switch.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { profile, setPrivateListening, subscriptionsVisible } from '../../db/repos/social/profiles.ts';
import { publicSubscriptions } from '../../db/repos/library/subscriptions.ts';
import { hasPlus } from '../../db/repos/account/purchases.ts';

/** Mounted at /v1/listeners — GET /:id (public; stats hidden when private, unless it is you). */
export const profiles = new Hono<AuthEnv>();

profiles.get('/:id', optionalAuth, async (c) => {
  const p = await profile(c.get('db'), c.req.param('id'), c.get('listener')?.id, new Date().toISOString().slice(0, 10));
  if (!p) throw new ApiError('not_found', 'No such listener.');
  // M20 US6 (FR-022): the PLUS badge is public, like the name (owner Q3 = A).
  return c.json({ profile: { ...p, plus: await hasPlus(c.get('db'), c.req.param('id')) } });
});

/**
 * M21 US8 (FR-074, G-M21-10): GET /:id/subscriptions → { items: { feedUrl, title, imageUrl }[] }.
 * 403 `private` when they keep their subscriptions private (or a block stands between you); the
 * owner always sees their own. 404 for no such (or a suspended) listener.
 */
profiles.get('/:id/subscriptions', optionalAuth, async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such listener.');
  const db = c.get('db');
  const v = await subscriptionsVisible(db, id, c.get('listener')?.id);
  if (v === 'none') throw new ApiError('not_found', 'No such listener.');
  c.header('cache-control', 'private, no-store');
  if (v === 'private') return c.json({ error: 'private', message: 'These subscriptions are private.' }, 403);
  return c.json({ items: await publicSubscriptions(db, id) });
});

/** Mounted at /v1/me/privacy — PUT { privateListening }. */
export const privacy = new Hono<AuthEnv>();

privacy.put('/', requireAuth, json(z.object({ privateListening: z.boolean() })), async (c) => {
  const v = c.req.valid('json').privateListening;
  await setPrivateListening(c.get('db'), c.get('listener')!.id, v);
  return c.json({ privateListening: v });
});
