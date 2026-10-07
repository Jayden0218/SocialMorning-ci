// Chat messages between two listeners who follow each other: send, read, list conversations.
/**
 * Chat (owner, 2026-10-04). Two people may chat only while they follow each other and neither
 * has blocked the other; a suspended account is refused by `requireAuth` and hidden from lists.
 * Old messages stay readable after an unfollow, but nobody can send until both follow again.
 */
import type { Db } from '../../db.ts';

export const CHAT_BODY_MAX = 1000;
export const CHAT_PAGE = 50;

export type ChatEpisode = { id: string; feedUrl: string; guid: string; title: string; showTitle: string; enclosureUrl: string; imageUrl?: string; durationMs?: number };
export type ChatMessage = { id: string; fromMe: boolean; body: string; episode?: ChatEpisode; createdAt: string; read: boolean };
export type ChatPerson = { id: string; displayName: string; avatarUrl?: string };
export type Conversation = { with: ChatPerson; last: ChatMessage; unread: number; canSend: boolean };

/** Both directions of the follow, and no block either way. */
export async function canChat(db: Db, a: string, b: string): Promise<boolean> {
  const [r] = await db.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2)
        AND EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followed_id = $1)
        AND NOT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS ok`,
    [a, b],
  );
  return r?.ok === true;
}

/** A block in either direction: the conversation disappears for both. */
async function walled(db: Db, a: string, b: string): Promise<boolean> {
  return (await db.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [a, b])).length > 0;
}

type Row = {
  id: string; sender_id: string; body: string; created_at: Date | string; read_at: Date | string | null;
  e_id: string | null; feed_url: string | null; guid: string | null; title: string | null; show_title: string | null; enclosure_url: string | null; image_url: string | null; duration_ms: number | null;
};

const SELECT = `SELECT m.id::text, m.sender_id, m.body, m.created_at, m.read_at,
  e.id AS e_id, e.feed_url, e.guid, e.title, e.show_title, e.enclosure_url, e.image_url, e.duration_ms
  FROM chat_messages m LEFT JOIN episodes e ON e.id = m.episode_id`;

function toMessage(r: Row, me: string): ChatMessage {
  const episode: ChatEpisode | undefined = r.e_id ? {
    id: r.e_id, feedUrl: r.feed_url ?? '', guid: r.guid ?? '', title: r.title ?? '', showTitle: r.show_title ?? '', enclosureUrl: r.enclosure_url ?? '',
    ...(r.image_url ? { imageUrl: r.image_url } : {}), ...(r.duration_ms !== null ? { durationMs: Number(r.duration_ms) } : {}),
  } : undefined;
  return { id: r.id, fromMe: r.sender_id === me, body: r.body, ...(episode ? { episode } : {}), createdAt: new Date(r.created_at).toISOString(), read: r.read_at !== null };
}

export async function person(db: Db, id: string): Promise<ChatPerson | undefined> {
  const [r] = await db.query<{ id: string; display_name: string; avatar_url: string | null }>('SELECT id, display_name, avatar_url FROM listeners WHERE id = $1 AND suspended_at IS NULL AND hidden_at IS NULL', [id]);
  return r ? toPerson(r) : undefined;
}

export async function send(db: Db, from: string, to: string, body: string, episodeId: string | undefined): Promise<ChatMessage> {
  const [r] = await db.query<{ id: string }>(
    'INSERT INTO chat_messages (sender_id, recipient_id, body, episode_id) VALUES ($1, $2, $3, $4) RETURNING id::text',
    [from, to, body, episodeId ?? null],
  );
  const [row] = await db.query<Row>(`${SELECT} WHERE m.id = $1`, [r!.id]);
  return toMessage(row!, from);
}

/**
 * The conversation with `other`, oldest first. `after` → only newer messages (the poll);
 * `before` → the page before that id (scrolling up); neither → the newest page.
 * Reading marks the other person's messages to me as read. A block either way → none.
 */
export async function thread(db: Db, me: string, other: string, opts: { after?: string; before?: string } = {}): Promise<ChatMessage[]> {
  if (await walled(db, me, other)) return [];
  const pair = '((m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1))';
  const rows = opts.after !== undefined
    ? await db.query<Row>(`${SELECT} WHERE ${pair} AND m.id > $3::bigint ORDER BY m.id ASC LIMIT ${CHAT_PAGE}`, [me, other, opts.after])
    : opts.before !== undefined
      ? (await db.query<Row>(`${SELECT} WHERE ${pair} AND m.id < $3::bigint ORDER BY m.id DESC LIMIT ${CHAT_PAGE}`, [me, other, opts.before])).reverse()
      : (await db.query<Row>(`${SELECT} WHERE ${pair} ORDER BY m.id DESC LIMIT ${CHAT_PAGE}`, [me, other])).reverse();
  await db.query('UPDATE chat_messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL', [me, other]);
  return rows.map((r) => toMessage(r, me));
}

/** Every conversation I have, newest first: the person, the last message, my unread count. */
export async function conversations(db: Db, me: string): Promise<Conversation[]> {
  const rows = await db.query<Row & { other_id: string; other_name: string; other_avatar: string | null; unread: number; can_send: boolean }>(
    `WITH mine AS (
       SELECT DISTINCT ON (CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END)
              CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS other_id, m.id
       FROM chat_messages m
       WHERE m.sender_id = $1 OR m.recipient_id = $1
       ORDER BY CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END, m.id DESC
     )
     SELECT x.other_id, l.display_name AS other_name, l.avatar_url AS other_avatar,
            m.id::text, m.sender_id, m.body, m.created_at, m.read_at,
            e.id AS e_id, e.feed_url, e.guid, e.title, e.show_title, e.enclosure_url, e.image_url, e.duration_ms,
            (SELECT count(*)::int FROM chat_messages u WHERE u.recipient_id = $1 AND u.sender_id = x.other_id AND u.read_at IS NULL) AS unread,
            (EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = x.other_id)
              AND EXISTS (SELECT 1 FROM follows WHERE follower_id = x.other_id AND followed_id = $1)) AS can_send
     FROM mine x
     JOIN chat_messages m ON m.id = x.id
     JOIN listeners l ON l.id = x.other_id AND l.suspended_at IS NULL AND l.hidden_at IS NULL
     LEFT JOIN episodes e ON e.id = m.episode_id
     WHERE NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = x.other_id) OR (b.blocker_id = x.other_id AND b.blocked_id = $1))
     ORDER BY m.id DESC
     LIMIT 200`,
    [me],
  );
  return rows.map((r) => ({ with: toPerson({ id: r.other_id, display_name: r.other_name, avatar_url: r.other_avatar ?? null }), last: toMessage(r, me), unread: Number(r.unread), canSend: r.can_send === true }));
}

/** My unread messages, from people I can still see (the tab badge). */
export async function unreadCount(db: Db, me: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM chat_messages m JOIN listeners l ON l.id = m.sender_id AND l.suspended_at IS NULL AND l.hidden_at IS NULL
     WHERE m.recipient_id = $1 AND m.read_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = m.sender_id) OR (b.blocker_id = m.sender_id AND b.blocked_id = $1))`,
    [me],
  );
  return Number(r?.n ?? 0);
}

/** People I can start a chat with: we follow each other, no block, not suspended. By name. */
export async function friends(db: Db, me: string): Promise<ChatPerson[]> {
  const rows = await db.query<{ id: string; display_name: string; avatar_url: string | null }>(
    `SELECT l.id, l.display_name, l.avatar_url FROM follows a
     JOIN follows b ON b.follower_id = a.followed_id AND b.followed_id = $1
     JOIN listeners l ON l.id = a.followed_id AND l.suspended_at IS NULL AND l.hidden_at IS NULL
     WHERE a.follower_id = $1
       AND NOT EXISTS (SELECT 1 FROM blocks x WHERE (x.blocker_id = $1 AND x.blocked_id = l.id) OR (x.blocker_id = l.id AND x.blocked_id = $1))
     ORDER BY lower(l.display_name), l.id
     LIMIT 500`,
    [me],
  );
  return rows.map(toPerson);
}

/** M19 US1: a chat person carries their photo when they set one. */
function toPerson(r: { id: string; display_name: string; avatar_url: string | null }): ChatPerson {
  return { id: r.id, displayName: r.display_name, ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) };
}
