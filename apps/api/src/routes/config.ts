// Public app settings for the phone: GET /v1/config, cached, with an ETag.
/**
 * M25 A7. Mounted at /v1/config, no sign-in. The phone reads it at start-up, keeps the last copy,
 * and falls back to its bundled defaults when the server cannot be reached — so this answer only
 * ever adds what an admin changed. `If-None-Match` with the same ETag → 304.
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { publicConfig } from '../db/repos/config/app-config.ts';

export const config = new Hono<AuthEnv>();

config.get('/', async (c) => {
  const { body, etag } = await publicConfig(c.get('db'));
  c.header('Cache-Control', 'public, max-age=60');
  c.header('ETag', etag);
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  return c.json(body);
});
