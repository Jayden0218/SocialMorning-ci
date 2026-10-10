// Chat routes: my conversations, unread count, friends to chat with, read and send messages.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { getEpisode } from '../../db/repos/library/episodes.ts';
import { CHAT_BODY_MAX, canChat, conversations, friends, person, send, thread, unreadCount } from '../../db/repos/social/chat.ts';

/**
 * Chat (owner, 2026-10-04) — mounted at /v1/me/chats, every route signed in.
 *   GET  /            my conversations, newest first
 *   GET  /unread      { count } for the tab badge
 *   GET  /friends     people I can start a chat with (we follow each other)
 *   GET  /:id         the conversation; `?after=<messageId>` for the poll, `?before=` for older
 *   POST /:id         { body?, episodeId? } → 201 { message }; only while we follow each other
 */
export const chat = new Hono<AuthEnv>();

/** At most this many messages a minute from one account. */
export const CHAT_PER_MINUTE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR = /^\d{1,18}$/;

const otherOf = (id: string): string => {
  if (!UUID.test(id)) throw new ApiError('not_found', 'No such listener.');
  return id;
};
const cursor = (v: string | undefined): string | undefined => {
  if (v === undefined || v === '') return undefined;
  if (!CURSOR.test(v)) throw new ApiError('validation', 'Check these fields: after, before.', { fields: ['after', 'before'] });
  return v;
};

chat.get('/', requireAuth, async (c) => {
  c.header('cache-control', 'private, no-store');
  return c.json({ conversations: await conversations(c.get('db'), c.get('listener')!.id) });
});

chat.get('/unread', requireAuth, async (c) => {
  c.header('cache-control', 'private, no-store');
  return c.json({ count: await unreadCount(c.get('db'), c.get('listener')!.id) });
});

chat.get('/friends', requireAuth, async (c) => {
  c.header('cache-control', 'private, no-store');
  return c.json({ friends: await friends(c.get('db'), c.get('listener')!.id) });
});

chat.get('/:id', requireAuth, async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const other = otherOf(c.req.param('id'));
  const who = await person(db, other);
  if (!who || other === me) throw new ApiError('not_found', 'No such listener.');
  const after = cursor(c.req.query('after'));
  const before = cursor(c.req.query('before'));
  const messages = await thread(db, me, other, { ...(after !== undefined ? { after } : {}), ...(before !== undefined ? { before } : {}) });
  c.header('cache-control', 'private, no-store');
  return c.json({ with: who, canSend: await canChat(db, me, other), messages });
});

const Body = z.object({
  body: z.string().max(CHAT_BODY_MAX * 2).optional(),
  episodeId: z.string().min(1).max(200).optional(),
});

chat.post('/:id', requireAuth, json(Body), async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const other = otherOf(c.req.param('id'));
  const { body: raw, episodeId } = c.req.valid('json');
  const body = (raw ?? '').trim();
  if (body.length > CHAT_BODY_MAX) throw new ApiError('validation', `A message is at most ${CHAT_BODY_MAX} characters.`, { fields: ['body'] });
  if (body === '' && episodeId === undefined) throw new ApiError('validation', 'Write something or attach an episode.', { fields: ['body'] });
  if (other === me || !(await person(db, other))) throw new ApiError('not_found', 'No such listener.');
  if (!(await canChat(db, me, other))) throw new ApiError('forbidden', 'You can chat only with people who follow you back.');
  if (episodeId !== undefined && !(await getEpisode(db, episodeId))) throw new ApiError('not_found', 'That episode is not on the server yet — open it once, then try again.');
  const [recent] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM chat_messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [me]);
  if (Number(recent?.n ?? 0) >= CHAT_PER_MINUTE) throw new ApiError('locked', 'Too many messages in a minute.', { retryAfterSeconds: 60 });
  const message = await send(db, me, other, body, episodeId);
  return c.json({ message }, 201);
});
