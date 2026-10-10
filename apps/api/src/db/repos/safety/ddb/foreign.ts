// What lane SF's DynamoDB code reads and writes in tables of lanes still on Postgres (SC content, SG graph, DV lists, ST Studio).
/**
 * M26 lane SF. Until each lane moves, its rows are in Postgres, so the safety code reaches them HERE with the
 * same SQL as before (minus the JOINs to `listeners` / `episodes`, which are lane AC's and LB's on DynamoDB and
 * are read through their items). When a lane converts, it replaces the function(s) below that touch its tables
 * with its own repo call (each names its lane), and CUT deletes this file. `pg` is a plain Postgres handle
 * (`pgOf(db)`) — or a transaction's, so moderation's effects roll back with it.
 */
import type { Db } from '../../../db.ts';
import { CHAT_CONTEXT } from '../reports.ts';

// ---- SC / DV: the reported item as it is now (reports.ts snapshotTarget) ----

export type CommentRow = { body: string | null; offset_ms: number | null; author_id: string | null; episode_id: string; deleted_at: string | null; removed_at: string | null; voice_url: string | null; transcript: string | null; image_url: string | null };
export async function commentRow(pg: Db, id: string): Promise<CommentRow | undefined> {
  const [r] = await pg.query<CommentRow>('SELECT body, offset_ms, author_id, episode_id, deleted_at, removed_at, voice_url, transcript, image_url FROM comments WHERE id = $1', [id]);
  return r;
}

export type ClipRow = { caption: string; start_ms: number; end_ms: number; author_id: string; episode_id: string; deleted_at: string | null; removed_at: string | null };
export async function clipRow(pg: Db, id: string): Promise<ClipRow | undefined> {
  const [r] = await pg.query<ClipRow>('SELECT caption, start_ms, end_ms, author_id, episode_id, deleted_at, removed_at FROM clips WHERE id = $1', [id]);
  return r;
}

export type StatusRow = { listener_id: string; body: string | null; blob_url: string | null; transcript: string | null; live: boolean };
export async function statusRow(pg: Db, id: string): Promise<StatusRow | undefined> {
  const [r] = await pg.query<StatusRow>('SELECT listener_id, body, blob_url, transcript, expires_at > now() AS live FROM voice_posts WHERE id = $1', [id]);
  return r;
}

export type ChatRow = { sender_id: string; recipient_id: string; body: string; removed_at: string | null; created_at: Date | string };
export async function chatRow(pg: Db, id: string): Promise<ChatRow | undefined> {
  const [r] = await pg.query<ChatRow>('SELECT sender_id, recipient_id, body, removed_at, created_at FROM chat_messages WHERE id = $1::bigint', [id]);
  return r;
}
/** Up to CHAT_CONTEXT live messages before `id` in the same conversation, newest first (as the SQL read them). */
export async function chatBefore(pg: Db, a: string, b: string, id: string): Promise<{ sender_id: string; body: string; created_at: Date | string }[]> {
  return pg.query<{ sender_id: string; body: string; created_at: Date | string }>(
    `SELECT sender_id, body, created_at FROM chat_messages
      WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)) AND id < $3::bigint AND removed_at IS NULL
      ORDER BY id DESC LIMIT ${CHAT_CONTEXT}`, [a, b, id]);
}

export type ListRow = { owner_id: string; title: string; n: number; removed_at: string | null };
export async function sharedListRow(pg: Db, id: string): Promise<ListRow | undefined> {
  const [r] = await pg.query<ListRow>('SELECT owner_id, title, cardinality(feed_urls) AS n, removed_at FROM shared_lists WHERE id = $1', [id]);
  return r;
}

/** SC/DV: who wrote the item, from its row while it exists (moderation.ts authorOf). */
export async function liveAuthor(pg: Db, kind: string, id: string): Promise<string | null> {
  const sql = kind === 'comment' ? 'SELECT author_id FROM comments WHERE id = $1'
    : kind === 'clip' ? 'SELECT author_id FROM clips WHERE id = $1'
    : kind === 'status' && /^[0-9a-f-]{36}$/i.test(id) ? 'SELECT listener_id AS author_id FROM voice_posts WHERE id = $1'
    : kind === 'chat_message' && /^\d{1,18}$/.test(id) ? 'SELECT sender_id AS author_id FROM chat_messages WHERE id = $1::bigint'
    : kind === 'list' ? 'SELECT owner_id AS author_id FROM shared_lists WHERE id = $1'
    : null;
  if (!sql) return null;
  const [r] = await pg.query<{ author_id: string | null }>(sql, [id]);
  return r?.author_id ?? null;
}

/** SC/DV: the effect of a `remove` (the activity entry is lane SG's: moderation.ts calls its removeActivityByRef) (moderation.ts act) — the same statements, in the caller's transaction. */
export async function removeEffect(pg: Db, kind: string, id: string): Promise<void> {
  if (kind === 'comment') {
    await pg.query('UPDATE comments SET removed_at = now() WHERE id = $1 AND removed_at IS NULL', [id]);
  } else if (kind === 'clip') {
    await pg.query('UPDATE clips SET removed_at = now() WHERE id = $1 AND removed_at IS NULL', [id]);
  } else if (kind === 'status') {
    // M24 US1: the status ends now — every reader asks `expires_at > now()`, and the hourly sweep deletes it (constitution V).
    await pg.query('UPDATE voice_posts SET expires_at = now() WHERE id = $1 AND expires_at > now()', [id]);
  } else if (kind === 'chat_message') {
    await pg.query('UPDATE chat_messages SET removed_at = now() WHERE id = $1::bigint AND removed_at IS NULL', [id]);
  } else if (kind === 'list') {
    await pg.query('UPDATE shared_lists SET removed_at = now() WHERE id = $1 AND removed_at IS NULL', [id]);
  }
}

// ---- ST: Studio shows (mod-shows.ts, admin-users.ts) ----

export type HostedShowRow = { id: string; title: string; feed_url: string; owner_id: string | null; created_at: Date | string; updated_at: Date | string; eps: number };
/** ST: the last 50 live shows made in the Studio, newest change first, with their live episode counts. */
export async function liveHostedShows(pg: Db): Promise<HostedShowRow[]> {
  return pg.query<HostedShowRow>(
    `SELECT h.id, h.title, h.feed_url, h.owner_id, h.created_at, h.updated_at,
            (SELECT count(*)::int FROM hosted_episodes e WHERE e.show_id = h.id AND e.deleted_at IS NULL) AS eps
       FROM hosted_shows h WHERE h.deleted_at IS NULL ORDER BY h.updated_at DESC LIMIT 50`);
}

/** ST: a listener's live Studio shows, newest first. */
export async function hostedShowsOf(pg: Db, ownerId: string): Promise<{ feed_url: string; title: string }[]> {
  return pg.query<{ feed_url: string; title: string }>('SELECT feed_url, title FROM hosted_shows WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50', [ownerId]);
}

/** ST: the Studio half of a take-down — its episodes go and its proven claims are revoked. */
export async function takedownStudio(pg: Db, showId: string, feedUrl: string): Promise<void> {
  await pg.query('UPDATE hosted_episodes SET deleted_at = now() WHERE show_id = $1 AND deleted_at IS NULL', [showId]);
  await pg.query("UPDATE creator_claims SET status = 'revoked' WHERE feed_url = $1 AND status = 'proven'", [feedUrl]);
}
