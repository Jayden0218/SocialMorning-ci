// Interaction notices: replies, likes, mentions and follows aimed at you, never from yourself or someone you shut out.
/**
 * M21 US10 (contracts/api.md "Notifications", G-M21-9). A row is written in the same transaction
 * as the act it reports. The one guard is in `notify`'s INSERT … SELECT: no row for a self-act
 * (the table CHECKs that too), none to a recipient who blocked the actor, none to a recipient who
 * muted the actor. Read: newest first, a page of 30, `unread` = newer than `notifications_seen_at`.
 */
import type { Db } from '../../db.ts';
import { pushFor, threadOf } from '../account/push.ts';

export type NoticeKind = 'reply' | 'like' | 'mention' | 'follow'
  // M22 US2/US3
  | 'like_post_comment' | 'like_post_like' | 'status_reply' | 'status_reaction' | 'status_milestone';

/** The most people one comment can mention; more are ignored (spam). */
export const MAX_MENTIONS = 5;
const PAGE = 30;

/**
 * Writes one notice unless the act is the recipient's own, or the recipient blocked or muted the
 * actor (G-M21-9). A like or a follow already reported is not reported again (unlike + like again).
 * Returns whether a row was written.
 */
export async function notify(db: Db, n: { recipientId: string | null | undefined; actorId: string; kind: NoticeKind; ref?: Record<string, string> }): Promise<boolean> {
  if (!n.recipientId) return false;
  // M22 US3: a muted thread, or a comment whose author stopped like notices, makes no notice at all.
  const thread = threadOf({ recipientId: n.recipientId, actorId: n.actorId, kind: n.kind, ref: n.ref ?? {} });
  if (thread || n.kind === 'like') {
    const [skip] = await db.query<{ skip: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM muted_threads WHERE listener_id = $1 AND thread_kind = $2 AND thread_key = $3)
           OR ($4 = 'like' AND COALESCE((SELECT like_notices_off FROM comments WHERE id::text = $5), false)) AS skip`,
      [n.recipientId, thread?.kind ?? '', thread?.key ?? '', n.kind, n.ref?.['commentId'] ?? ''],
    );
    if (skip?.skip) return false;
  }
  // M25 G3 (found by the API suite on real Postgres): `$4::jsonb` with a JSON string made the
  // `postgres` driver store a jsonb STRING, so `ref->>'commentId'` was NULL in production and the
  // list lost every excerpt and episode title. jsonb goes in as TEXT, cast in SQL (the M14 rule).
  const ref = JSON.stringify(n.ref ?? {});
  const rows = await db.query<{ id: string }>(
    `INSERT INTO notifications (recipient_id, actor_id, kind, ref)
     SELECT $1::uuid, $2::uuid, $3, ($4::text)::jsonb
     WHERE $1::uuid <> $2::uuid
       AND NOT EXISTS (SELECT 1 FROM blocks WHERE blocker_id = $1::uuid AND blocked_id = $2::uuid)
       AND NOT EXISTS (SELECT 1 FROM listener_mutes WHERE muter_id = $1::uuid AND muted_id = $2::uuid)
       AND ($3 NOT IN ('like', 'follow', 'like_post_like', 'status_reaction') OR NOT EXISTS (
         SELECT 1 FROM notifications WHERE recipient_id = $1::uuid AND actor_id = $2::uuid AND kind = $3 AND ref = ($4::text)::jsonb))
     RETURNING id`,
    [n.recipientId, n.actorId, n.kind, ref],
  );
  if (rows.length === 0) return false;
  // M22 US1: the same notice as a phone push (never throws; see pushFor).
  await pushFor(db, { recipientId: n.recipientId, actorId: n.actorId, kind: n.kind, ref: n.ref ?? {} });
  return true;
}

/**
 * The names a comment body may mention: for each `@`, the next one to four words (at most 40
 * characters), lower-cased. The caller matches them against display names, case-insensitively.
 */
export function mentionCandidates(body: string): string[][] {
  const out: string[][] = [];
  const re = /@([^\s@][^@\n]{0,39})/gu;
  for (const m of body.matchAll(re)) {
    const words = m[1]!.split(/\s+/).filter(Boolean);
    const cands: string[] = [];
    for (let i = 1; i <= Math.min(4, words.length); i += 1) {
      const name = words.slice(0, i).join(' ').replace(/[.,!?;:，。！？；：)]+$/u, '').toLowerCase();
      if (name && name.length <= 40) cands.push(name);
    }
    if (cands.length > 0) out.push(cands);
  }
  return out;
}

/** The listeners a body mentions: per `@`, the longest exact display name (case-insensitive); at most MAX_MENTIONS. */
export async function mentionedIds(db: Db, body: string): Promise<string[]> {
  const groups = mentionCandidates(body).slice(0, 20);
  const all = [...new Set(groups.flat())];
  if (all.length === 0) return [];
  const rows = await db.query<{ id: string; name: string }>(
    'SELECT id, lower(display_name) AS name FROM listeners WHERE lower(display_name) = ANY($1::text[]) ORDER BY created_at',
    [all],
  );
  const byName = new Map<string, string>();
  for (const r of rows) if (!byName.has(r.name)) byName.set(r.name, r.id);
  const ids: string[] = [];
  for (const cands of groups) {
    const hit = [...cands].reverse().find((c) => byName.has(c));
    const id = hit ? byName.get(hit)! : undefined;
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_MENTIONS) break;
  }
  return ids;
}

/** A new comment's notices: a reply tells the parent's author; each `@name` tells that listener (not twice). */
export async function notifyForComment(db: Db, c: { id: string; episodeId: string; authorId: string; parentId?: string | null; body: string | null }): Promise<void> {
  let parentAuthor: string | null = null;
  if (c.parentId) {
    const [p] = await db.query<{ author_id: string | null }>('SELECT author_id FROM comments WHERE id = $1', [c.parentId]);
    parentAuthor = p?.author_id ?? null;
    await notify(db, { recipientId: parentAuthor, actorId: c.authorId, kind: 'reply', ref: { commentId: c.id, parentId: c.parentId, episodeId: c.episodeId } });
  }
  if (!c.body || !c.body.includes('@')) return;
  for (const id of await mentionedIds(db, c.body)) {
    if (id === parentAuthor) continue; // already told by the reply
    await notify(db, { recipientId: id, actorId: c.authorId, kind: 'mention', ref: { commentId: c.id, episodeId: c.episodeId, ...(c.parentId ? { parentId: c.parentId } : {}) } });
  }
}

export type NoticeItem = {
  id: string;
  kind: NoticeKind;
  actor: { id: string; name: string; avatarUrl: string | null };
  ref: Record<string, string>;
  createdAt: string;
  unread: boolean;
};

/**
 * My notices, newest first, 30 a page; `cursor` is the last item's `createdAt`. Actors I have
 * blocked or muted since are left out too. `ref` gains the comment's `excerpt` (when it is still
 * visible) and the episode's `episodeTitle`, so a row can say what it is about.
 */
/** A row written before the M25 fix holds its ref as a jsonb string: read it as the object it encodes. */
const REF = "(CASE WHEN jsonb_typeof(n.ref) = 'string' THEN (n.ref #>> '{}')::jsonb ELSE n.ref END)";

export async function listNotifications(db: Db, recipientId: string, cursor?: string): Promise<{ items: NoticeItem[]; next: string | null }> {
  const before = cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(cursor).toISOString() : null;
  const rows = await db.query<{
    id: string; kind: NoticeKind; actor_id: string; display_name: string; avatar_url: string | null; ref: unknown;
    created_at: string | Date; unread: boolean; excerpt: string | null; episode_title: string | null;
  }>(
    `SELECT n.id, n.kind, n.actor_id, l.display_name, l.avatar_url, n.ref, n.created_at,
            (me.notifications_seen_at IS NULL OR n.created_at > me.notifications_seen_at) AS unread,
            CASE WHEN c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL THEN left(c.body, 120) END AS excerpt,
            e.title AS episode_title
     FROM notifications n
     JOIN listeners l ON l.id = n.actor_id
     JOIN listeners me ON me.id = n.recipient_id
     LEFT JOIN comments c ON c.id::text = ${REF}->>'commentId'
     LEFT JOIN episodes e ON e.id = ${REF}->>'episodeId'
     WHERE n.recipient_id = $1
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $1 AND b.blocked_id = n.actor_id)
       AND NOT EXISTS (SELECT 1 FROM listener_mutes m WHERE m.muter_id = $1 AND m.muted_id = n.actor_id)
       AND ($2::timestamptz IS NULL OR n.created_at < $2::timestamptz)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $3`,
    [recipientId, before, PAGE + 1],
  );
  const page = rows.slice(0, PAGE);
  const items = page.map((r): NoticeItem => {
    const raw = (typeof r.ref === 'string' ? JSON.parse(r.ref) : r.ref) as Record<string, string> | null;
    return {
      id: r.id,
      kind: r.kind,
      actor: { id: r.actor_id, name: r.display_name, avatarUrl: r.avatar_url ?? null },
      ref: { ...(raw ?? {}), ...(r.excerpt ? { excerpt: r.excerpt } : {}), ...(r.episode_title ? { episodeTitle: r.episode_title } : {}) },
      createdAt: new Date(r.created_at).toISOString(),
      unread: r.unread === true,
    };
  });
  return { items, next: rows.length > PAGE ? items[items.length - 1]!.createdAt : null };
}

/** Everything up to now is read. */
export async function markSeen(db: Db, recipientId: string): Promise<void> {
  await db.query('UPDATE listeners SET notifications_seen_at = now() WHERE id = $1', [recipientId]);
}
