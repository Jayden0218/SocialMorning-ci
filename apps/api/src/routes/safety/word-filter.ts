// Refuses a write whose text holds a blocked word, before the route sees it (422 blocked_word).
/**
 * M24 US2 (guard G-M24-A1b). One table of the writes whose words other people read — a comment,
 * a status and a status reply, a chat message, a shared list or playlist title, a clip caption, a
 * display name or bio — and the JSON fields checked on each. Kept in one place so a new surface
 * is one row here, and so the guard can name every row it protects.
 *
 * Runs only on a JSON body; a body that is not JSON goes on untouched (the route's own check
 * answers it). Hono keeps the parsed body, so the route's validator reads it again for free.
 *
 * M25 S4 (audit #5, #6; guard G-M25-S4): "JSON" is what Hono's validator takes as JSON — any
 * `application/json` or `application/*+json`, with parameters — so `application/vnd.x+json` no
 * longer walks past the filter into a route that parses it. A field may name a list of strings
 * (`options`); `header` checks a request header (the voice uploads' URI-encoded `x-transcript`).
 * New rows: voice transcripts, Studio host replies, announcements, polls, show details (created
 * and claimed shows, hosted episodes), and appeals.
 */
import type { MiddlewareHandler } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { assertNoBlockedWords } from '../../db/repos/safety/words.ts';

export type CheckedWrite = { method: string; path: RegExp; fields: readonly string[]; header?: string };

export const CHECKED_WRITES: readonly CheckedWrite[] = [
  { method: 'POST', path: /^\/v1\/episodes\/[^/]+\/comments$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/episodes\/[^/]+\/clips$/, fields: ['caption'] },
  { method: 'POST', path: /^\/v1\/voice-posts$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/voice-posts\/[^/]+\/replies$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/me\/chats\/[^/]+$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/me\/shared-lists$/, fields: ['title'] },
  { method: 'POST', path: /^\/v1\/me\/playlists$/, fields: ['title'] },
  { method: 'PATCH', path: /^\/v1\/me\/playlists\/[^/]+$/, fields: ['title'] },
  { method: 'POST', path: /^\/v1\/auth\/code\/verify$/, fields: ['displayName'] },
  { method: 'PATCH', path: /^\/v1\/me$/, fields: ['displayName', 'bio'] },
  // M25 S4: voice transcripts (the body is audio; the words come in a header).
  { method: 'POST', path: /^\/v1\/voice-posts$/, fields: [], header: 'x-transcript' },
  { method: 'POST', path: /^\/v1\/voice-posts\/[^/]+\/replies$/, fields: [], header: 'x-transcript' },
  { method: 'POST', path: /^\/v1\/episodes\/[^/]+\/comments\/voice$/, fields: [], header: 'x-transcript' },
  // M25 S4: the Studio — host replies, announcements, polls, show details, hosted episodes.
  { method: 'POST', path: /^\/v1\/studio\/shows\/[^/]+\/comments\/[^/]+\/reply$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/studio\/shows\/[^/]+\/announcements$/, fields: ['body'] },
  { method: 'PUT', path: /^\/v1\/studio\/shows\/[^/]+\/announcements\/[^/]+$/, fields: ['body'] },
  { method: 'POST', path: /^\/v1\/studio\/shows\/[^/]+\/polls$/, fields: ['question', 'options'] },
  { method: 'POST', path: /^\/v1\/studio\/hosted-shows$/, fields: ['title', 'description', 'author'] },
  { method: 'PUT', path: /^\/v1\/studio\/shows\/[^/]+\/details$/, fields: ['title', 'description', 'author'] },
  { method: 'PUT', path: /^\/v1\/studio\/shows\/[^/]+\/overrides$/, fields: ['title', 'description', 'milestoneMessage'] },
  { method: 'POST', path: /^\/v1\/studio\/shows\/[^/]+\/hosted-episodes$/, fields: ['title', 'description'] },
  { method: 'PUT', path: /^\/v1\/studio\/shows\/[^/]+\/hosted-episodes\/[^/]+$/, fields: ['title', 'description'] },
  // M25 S4: an appeal's text is read by the admin and quoted back.
  { method: 'POST', path: /^\/v1\/appeals$/, fields: ['text'] },
];

/** The same test Hono's validator uses (hono/dist/validator/validator.js `jsonRegex`). */
const JSON_TYPE = /^application\/([a-z-.]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/i;
export const isJson = (ct: string | undefined): boolean => JSON_TYPE.test((ct ?? '').trim());

/** Every string a field holds: the string itself, or the strings in a list. */
const textsOf = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A URI-encoded header as text; undecodable → the raw value (the route refuses it anyway). */
const headerText = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;
  try { return decodeURIComponent(raw); } catch { return raw; }
};

export const wordFilter: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const method = c.req.method;
  const path = c.req.path.replace(/\/+$/, '') || '/';
  // A path may have more than one row (a status is JSON text, or audio with its words in a header).
  const rows = CHECKED_WRITES.filter((w) => w.method === method && w.path.test(path));
  for (const row of rows) {
    if (row.header) await assertNoBlockedWords(c.get('db'), [headerText(c.req.header(row.header))]);
    if (row.fields.length > 0 && isJson(c.req.header('content-type'))) {
      let body: unknown;
      try { body = await c.req.json(); } catch { body = undefined; }
      if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        await assertNoBlockedWords(c.get('db'), row.fields.flatMap((f) => textsOf(b[f])));
      }
    }
  }
  await next();
};
