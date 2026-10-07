// Replies and reactions on a status: text or voice replies only the owner and the author see, six reactions.
/**
 * M22 US2 (spec FR-007–FR-009; constitution 3.3.0 — voice replies on statuses; contracts/api.md
 * "Statuses"). A reply is text (1–140 characters) or a voice recording (≤ 60 s, ≤ 600 000 bytes,
 * the voice-status store). Only the status owner and the reply's author can read a reply; the
 * owner may delete any reply, the author their own. A listener has at most one reaction (1–6)
 * per status. Rows cascade with the status; a voice reply's file is deleted by the sweep (and on
 * delete) before its row — guard G-M22-2.
 *
 * Who may reply or react: anyone who can see the status — its author, a follower, or (since
 * suggestions, FR-010) any signed-in listener not blocked either way and not suspended.
 */
import type { Db } from '../../db.ts';
import type { VoiceStorage } from '../../../storage/voice-blob.ts';
import { initialsOf } from './comment-likes.ts';
import { notify } from './notifications.ts';

export const REPLY_TEXT_MAX = 140;
export const REACTION_KINDS = 6;
/** The owner is told once when one status reaches this many reactions (US2 scenario 5). */
export const REACTION_MILESTONE = 100;

export type StatusPostRow = { id: string; listener_id: string; expires_at: Date | string };

export type StatusReply = {
  id: string;
  author: { id: string; name: string; initials: string | null; avatarUrl?: string };
  body?: string;
  url?: string;
  durationMs?: number;
  createdAt: string;
  mine: boolean;
};

/** A live status the viewer may see, or undefined (→ 404; a block never shows as "blocked"). */
export async function visibleStatus(db: Db, postId: string, viewerId: string): Promise<StatusPostRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return undefined;
  const [row] = await db.query<StatusPostRow>(
    `SELECT v.id, v.listener_id, v.expires_at FROM voice_posts v JOIN listeners l ON l.id = v.listener_id
      WHERE v.id = $1 AND v.expires_at > now() AND l.suspended_at IS NULL AND l.hidden_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $2 AND b.blocked_id = v.listener_id) OR (b.blocker_id = v.listener_id AND b.blocked_id = $2))`,
    [postId, viewerId],
  );
  return row;
}

const chars = (s: string) => [...s].length;

export async function addTextReply(db: Db, post: StatusPostRow, authorId: string, body: string): Promise<string> {
  const text = body.trim();
  if (text.length === 0 || chars(text) > REPLY_TEXT_MAX) throw new Error('reply_length');
  const [r] = await db.query<{ id: string }>('INSERT INTO status_replies (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [post.id, authorId, text]);
  await notify(db, { recipientId: post.listener_id, actorId: authorId, kind: 'status_reply', ref: { postId: post.id, replyId: r!.id, excerpt: text.slice(0, 120) } });
  return r!.id;
}

export async function addAudioReply(db: Db, post: StatusPostRow, authorId: string, a: { key: string; url: string; durationMs: number }): Promise<string> {
  const [r] = await db.query<{ id: string }>(
    'INSERT INTO status_replies (post_id, author_id, audio_key, audio_url, audio_ms) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [post.id, authorId, a.key, a.url, a.durationMs],
  );
  await notify(db, { recipientId: post.listener_id, actorId: authorId, kind: 'status_reply', ref: { postId: post.id, replyId: r!.id, excerpt: 'A voice reply' } });
  return r!.id;
}

/** FR-007: the owner reads every reply; anyone else only their own. Oldest first. */
export async function listReplies(db: Db, post: StatusPostRow, viewerId: string): Promise<StatusReply[]> {
  const owner = post.listener_id === viewerId;
  const rows = await db.query<{ id: string; author_id: string; display_name: string; avatar_url: string | null; body: string | null; audio_url: string | null; audio_ms: number | null; created_at: Date | string }>(
    `SELECT r.id, r.author_id, l.display_name, l.avatar_url, r.body, r.audio_url, r.audio_ms, r.created_at
       FROM status_replies r JOIN listeners l ON l.id = r.author_id AND l.suspended_at IS NULL
      WHERE r.post_id = $1 AND ($3 OR r.author_id = $2)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $2 AND b.blocked_id = r.author_id)
      ORDER BY r.created_at, r.id LIMIT 500`,
    [post.id, viewerId, owner],
  );
  return rows.map((r) => ({
    id: r.id,
    author: { id: r.author_id, name: r.display_name, initials: initialsOf(r.display_name), ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) },
    ...(r.body !== null ? { body: r.body } : {}),
    ...(r.audio_url !== null ? { url: r.audio_url, durationMs: Number(r.audio_ms ?? 0) } : {}),
    createdAt: new Date(r.created_at).toISOString(),
    mine: r.author_id === viewerId,
  }));
}

/** The owner deletes any reply, the author their own; a voice reply's file goes first. */
export async function deleteReply(db: Db, storage: VoiceStorage, post: StatusPostRow, replyId: string, viewerId: string): Promise<'ok' | 'not_found'> {
  if (!/^[0-9a-f-]{36}$/i.test(replyId)) return 'not_found';
  const [r] = await db.query<{ id: string; author_id: string; audio_url: string | null }>(
    'SELECT id, author_id, audio_url FROM status_replies WHERE id = $1 AND post_id = $2', [replyId, post.id]);
  if (!r || (r.author_id !== viewerId && post.listener_id !== viewerId)) return 'not_found';
  if (r.audio_url) await storage.remove(r.audio_url);
  await db.query('DELETE FROM status_replies WHERE id = $1', [r.id]);
  return 'ok';
}

/**
 * One reaction per listener (FR-008); a new kind replaces the old. The owner is told of a first
 * reaction from each listener, and once — `milestone_sent_at` — when the status reaches 100.
 */
export async function setReaction(db: Db, post: StatusPostRow, listenerId: string, kind: number): Promise<void> {
  await db.query(
    `INSERT INTO status_reactions (post_id, listener_id, kind) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, listener_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now()`,
    [post.id, listenerId, kind],
  );
  await notify(db, { recipientId: post.listener_id, actorId: listenerId, kind: 'status_reaction', ref: { postId: post.id } });
  const [n] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM status_reactions WHERE post_id = $1', [post.id]);
  if (Number(n?.n ?? 0) < REACTION_MILESTONE) return;
  const claimed = await db.query('UPDATE voice_posts SET milestone_sent_at = now() WHERE id = $1 AND milestone_sent_at IS NULL RETURNING 1', [post.id]);
  // The actor is the listener whose reaction made 100; notify() skips it when that is the owner.
  if (claimed.length > 0) await notify(db, { recipientId: post.listener_id, actorId: listenerId, kind: 'status_milestone', ref: { postId: post.id } });
}

export async function clearReaction(db: Db, postId: string, listenerId: string): Promise<void> {
  await db.query('DELETE FROM status_reactions WHERE post_id = $1 AND listener_id = $2', [postId, listenerId]);
}

export type ReactionSummary = { reactions: { kind: number; count: number }[]; myReaction: number | null; replyCount?: number; reactedBy?: { id: string; name: string; kind: number }[] };

/**
 * Per post: counts per kind, the viewer's own kind, and — for the owner only — the reply count and
 * who reacted (FR-008 "the owner sees the count and who reacted").
 */
export async function summaries(db: Db, posts: readonly { id: string; listenerId: string }[], viewerId: string): Promise<Map<string, ReactionSummary>> {
  const out = new Map<string, ReactionSummary>();
  if (posts.length === 0) return out;
  const ids = posts.map((p) => p.id);
  for (const p of posts) out.set(p.id, { reactions: [], myReaction: null, ...(p.listenerId === viewerId ? { replyCount: 0, reactedBy: [] } : {}) });
  const counts = await db.query<{ post_id: string; kind: number; n: number; mine: boolean }>(
    `SELECT post_id, kind, count(*)::int AS n, bool_or(listener_id = $2) AS mine FROM status_reactions
      WHERE post_id = ANY($1::uuid[]) GROUP BY post_id, kind ORDER BY post_id, kind`,
    [ids, viewerId],
  );
  for (const r of counts) {
    const s = out.get(r.post_id);
    if (!s) continue;
    s.reactions.push({ kind: Number(r.kind), count: Number(r.n) });
    if (r.mine) s.myReaction = Number(r.kind);
  }
  const owned = posts.filter((p) => p.listenerId === viewerId).map((p) => p.id);
  if (owned.length > 0) {
    const replies = await db.query<{ post_id: string; n: number }>('SELECT post_id, count(*)::int AS n FROM status_replies WHERE post_id = ANY($1::uuid[]) GROUP BY post_id', [owned]);
    for (const r of replies) { const s = out.get(r.post_id); if (s) s.replyCount = Number(r.n); }
    const who = await db.query<{ post_id: string; listener_id: string; display_name: string; kind: number }>(
      `SELECT r.post_id, r.listener_id, l.display_name, r.kind FROM status_reactions r JOIN listeners l ON l.id = r.listener_id AND l.suspended_at IS NULL
        WHERE r.post_id = ANY($1::uuid[]) ORDER BY r.created_at DESC LIMIT 1000`,
      [owned],
    );
    for (const r of who) out.get(r.post_id)?.reactedBy?.push({ id: r.listener_id, name: r.display_name, kind: Number(r.kind) });
  }
  return out;
}

/** The voice-reply files hanging off these posts (for the sweep and for deleting a status). */
export async function replyAudioOf(db: Db, postIds: readonly string[]): Promise<{ id: string; audio_url: string }[]> {
  if (postIds.length === 0) return [];
  return db.query<{ id: string; audio_url: string }>('SELECT id, audio_url FROM status_replies WHERE post_id = ANY($1::uuid[]) AND audio_url IS NOT NULL', [postIds]);
}
