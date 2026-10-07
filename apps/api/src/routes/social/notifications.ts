// Notification routes: my interaction notices in pages, and mark them all read.
/**
 * M21 US10 (contracts/api.md "Notifications") — mounted at /v1/me/notifications:
 *   GET /?cursor=  → { items: { id, kind, actor, ref, createdAt, unread }[], next }
 *   POST /seen     → 204 (everything up to now is read)
 *   GET /system    → { items: { id, title, body, createdAt, action?, to }[] }  (M24 US3: messages from SocialNet)
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { listNotifications, markSeen } from '../../db/repos/social/notifications.ts';
import { noticesFor } from '../../db/repos/social/system-notices.ts';

export const notifications = new Hono<AuthEnv>();

notifications.get('/', requireAuth, async (c) =>
  c.json(await listNotifications(c.get('db'), c.get('listener')!.id, c.req.query('cursor') || undefined)));

notifications.post('/seen', requireAuth, async (c) => {
  await markSeen(c.get('db'), c.get('listener')!.id);
  return c.body(null, 204);
});

notifications.get('/system', requireAuth, async (c) => {
  c.header('cache-control', 'private, no-store');
  return c.json({ items: (await noticesFor(c.get('db'), c.get('listener')!.id)).map(({ push: _push, ...n }) => n) });
});
