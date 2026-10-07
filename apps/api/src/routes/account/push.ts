// Push routes: register or remove a device token and set alert preferences.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { deleteToken, getPrefs, saveToken, setPrefs } from '../../db/repos/account/push.ts';

/** Mounted at /v1/me/push-tokens and /v1/me/push-prefs (M10b US3). */
const tokenBody = z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]{8,200}\]$/), platform: z.enum(['ios', 'android']) });
// M22: every switch optional; only those sent are saved.
const prefsBody = z.object({
  newEpisodes: z.boolean(), popular: z.boolean(), replies: z.boolean(), likes: z.boolean(),
  follows: z.boolean(), mentions: z.boolean(), statuses: z.boolean(), digest: z.boolean(),
}).partial();

export const pushTokens = new Hono<AuthEnv>();
pushTokens.post('/', requireAuth, json(tokenBody), async (c) => {
  const b = c.req.valid('json');
  await saveToken(c.get('db'), c.get('listener')!.id, b.token, b.platform);
  return c.body(null, 204);
});
pushTokens.delete('/:token', requireAuth, async (c) => {
  await deleteToken(c.get('db'), c.get('listener')!.id, decodeURIComponent(c.req.param('token')));
  return c.body(null, 204);
});

export const pushPrefs = new Hono<AuthEnv>();
pushPrefs.get('/', requireAuth, async (c) => c.json(await getPrefs(c.get('db'), c.get('listener')!.id)));
pushPrefs.put('/', requireAuth, json(prefsBody), async (c) => {
  await setPrefs(c.get('db'), c.get('listener')!.id, c.req.valid('json'));
  return c.body(null, 204);
});
