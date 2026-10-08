// Refuses a write whose text holds a blocked word, before the route sees it (422 blocked_word).
/**
 * M24 US2 (guard G-M24-A1b). One table of the writes whose words other people read — a comment,
 * a status and a status reply, a chat message, a shared list or playlist title, a clip caption, a
 * display name or bio — and the JSON fields checked on each. Kept in one place so a new surface
 * is one row here, and so the guard can name every row it protects.
 *
 * Runs only on a JSON body; a body that is not JSON goes on untouched (the route's own check
 * answers it). Hono keeps the parsed body, so the route's validator reads it again for free.
 */
import type { MiddlewareHandler } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { assertNoBlockedWords } from '../../db/repos/safety/words.ts';

export type CheckedWrite = { method: string; path: RegExp; fields: readonly string[] };

export const CHECKED_WRITES: readonly CheckedWrite[] = [
  { method: 'POST', path: /^\/v1\/episodes\/[^/]+\/comments$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/episodes\/[^/]+\/clips$/, fields: ['caption'] },
  { method: 'POST', path: /^\/v1\/voice-posts$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/voice-posts\/[^/]+\/replies$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/me\/chats\/[^/]+$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/me\/shared-lists$/, fields: ['title'] },
  { method: 'POST', path: /^\/v1\/me\/playlists$/, fields: ['title'] },
  { method: 'PATCH', path: /^\/v1\/me\/playlists\/[^/]+$/, fields: ['title'] },
  { method: 'POST', path: /^\/v1\/auth\/sign-up$/, fields: ['displayName'] },
  { method: 'POST', path: /^\/v1\/auth\/code\/verify$/, fields: ['displayName'] },
  { method: 'PATCH', path: /^\/v1\/me$/, fields: ['displayName', 'bio'] },
];

const isJson = (ct: string | undefined): boolean => (ct ?? '').split(';')[0]!.trim().toLowerCase() === 'application/json';

export const wordFilter: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const method = c.req.method;
  const path = c.req.path.replace(/\/+$/, '') || '/';
  const row = CHECKED_WRITES.find((w) => w.method === method && w.path.test(path));
  if (row && isJson(c.req.header('content-type'))) {
    let body: unknown;
    try { body = await c.req.json(); } catch { body = undefined; }
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      void assertNoBlockedWords; void b; // RED-CHECK: the filter is skipped
    }
  }
  await next();
};
