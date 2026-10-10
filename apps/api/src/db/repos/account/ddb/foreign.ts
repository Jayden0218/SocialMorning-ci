// What the account lane reads from lanes that are still on Postgres (hybrid only): subscriptions, PLUS, episodes, follows, blocks…
/**
 * M26 lane AC. These rows belong to other lanes (LB catalog, PD paid, SG graph, SF safety, SC content);
 * until each lane moves, its rows are in Postgres, so the account lane's DynamoDB code reads them HERE,
 * with the same SQL the Postgres version used — and nowhere else. When a lane converts, it replaces the
 * function(s) below that read its tables with its own repo call (named per function), and CUT deletes this
 * file. Writes to other lanes' tables are not made here (the deletion job's "others" step runs the
 * Postgres cascade as one unit — ddb/deletion.ts).
 */
import type { Db } from '../../../db.ts';
import { plusMembersDue } from '../purchases.ts';
import { notHidden } from '../../studio/hidden-episodes.ts';
import { DIGEST_MAX } from '../digest.ts';
import { attachedOf } from '../../../backend-ddb.ts';
import { statusFollowerIds } from '../../social/graph-ddb/follows.ts';
import { isMuted, isThreadMuted } from '../../social/graph-ddb/mutes.ts';
import { listenedEpisodeCount as graphListenedEpisodeCount } from '../../social/graph-ddb/activity.ts';

/** Lane SG has moved: its items are read through its repo (graph-ddb), with the Store this Db carries. */
const sg = (pg: Db) => ({ store: attachedOf(pg).store, pg });

/** LB: listeners with a live subscription to the feed. */
export async function liveSubscribers(pg: Db, feedUrl: string): Promise<string[]> {
  const rows = await pg.query<{ listener_id: string }>('SELECT listener_id FROM subscriptions WHERE feed_url = $1 AND deleted_at IS NULL', [feedUrl]);
  return rows.map((r) => r.listener_id);
}

/** LB: a listener's live subscriptions, newest first, each with its newest show title. */
export async function liveSubscriptionsWithTitles(pg: Db, listenerId: string): Promise<{ feed_url: string; title: string | null }[]> {
  return pg.query<{ feed_url: string; title: string | null }>(
    `SELECT s.feed_url,
            (SELECT e.show_title FROM episodes e WHERE e.feed_url = s.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS title
     FROM subscriptions s WHERE s.listener_id = $1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
    [listenerId],
  );
}

/**
 * PD (moved, lane PD): everyone with live PLUS (any source), once each — now lane PD's repo (`plusMembersDue`): on
 * DynamoDB only the `Q#plus#<tz>` queues of zones where it is Monday noon at `now` are read (AC-T07).
 */
export async function plusMembers(pg: Db, now: Date): Promise<string[]> {
  return plusMembersDue(pg, now);
}

/** LB/ST: the digest's episodes for one listener's week (same SQL as digest.ts `pick`). */
export async function digestPick(pg: Db, listenerId: string, from: Date, to: Date): Promise<string[]> {
  const rows = await pg.query<{ id: string }>(
    `SELECT e.id FROM episodes e
       JOIN subscriptions s ON s.feed_url = e.feed_url AND s.listener_id = $1 AND s.deleted_at IS NULL
      WHERE e.published_at >= $2 AND e.published_at < $3
        AND NOT EXISTS (SELECT 1 FROM positions p WHERE p.listener_id = $1 AND p.episode_id = e.id)
        AND ${notHidden('e')}
      ORDER BY e.published_at DESC, e.id LIMIT ${DIGEST_MAX}`, [listenerId, from.toISOString(), to.toISOString()]);
  return rows.map((r) => r.id);
}

export type EpisodeCardRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; enclosure_url: string; image_url: string | null; duration_ms: number | null; published_at: Date | string | null };

/** LB: episode cards by id. */
export async function episodesByIds(pg: Db, ids: readonly string[]): Promise<EpisodeCardRow[]> {
  if (ids.length === 0) return [];
  return pg.query<EpisodeCardRow>('SELECT id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at FROM episodes WHERE id = ANY($1::text[])', [[...ids]]);
}

/** SF/SG/SC: what a social push must know about recipient and actor (blocks both ways, mute, muted thread, the comment). Mutes are lane SG's (moved). */
export async function pushRelations(pg: Db, recipientId: string, actorId: string, threadKind: string, threadKey: string, commentId: string): Promise<{ blocked: boolean; muted: boolean; thread_muted: boolean; likes_off: boolean; excerpt: string | null } | undefined> {
  const [rel] = await pg.query<{ blocked: boolean; likes_off: boolean; excerpt: string | null }>(
    `SELECT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS blocked,
            COALESCE((SELECT like_notices_off FROM comments WHERE id::text = $3), false) AS likes_off,
            (SELECT left(body, 120) FROM comments WHERE id::text = $3) AS excerpt`,
    [recipientId, actorId, commentId],
  );
  if (!rel) return undefined;
  const muted = await isMuted(sg(pg), recipientId, actorId);
  const threadMuted = threadKind ? await isThreadMuted(sg(pg), recipientId, threadKind, threadKey) : false;
  return { ...rel, muted, thread_muted: threadMuted };
}

/** SG (moved): followers of an author who neither blocked nor were blocked by them, nor muted them. */
export async function statusFollowers(pg: Db, authorId: string): Promise<string[]> {
  return statusFollowerIds(sg(pg), authorId);
}

/** SG (moved): distinct episodes the listener listened to (the For You interests fade). */
export async function listenedEpisodeCount(pg: Db, listenerId: string): Promise<number> {
  return graphListenedEpisodeCount(sg(pg), listenerId);
}

/** SF: the M18 dashboard still counts app use from Postgres `daily_active` — the first visit of a day is written there too. */
export async function recordDailyActive(pg: Db, day: string, listenerId: string): Promise<void> {
  await pg.query('INSERT INTO daily_active (day, listener_id) VALUES ($1::date, $2) ON CONFLICT DO NOTHING', [day, listenerId]);
}

/** SF: whether a listener is an admin (the `admins` table is lane SF's). */
export async function isAdminPg(pg: Db, listenerId: string): Promise<boolean> {
  const [r] = await pg.query<{ ok: boolean }>('SELECT EXISTS (SELECT 1 FROM admins WHERE listener_id = $1) AS ok', [listenerId]);
  return Boolean(r?.ok);
}

/** The data-export sections other lanes own (data-export.ts SECTIONS minus `queue` and `devices`, which are this lane's). */
export async function exportSection(pg: Db, sql: string, listenerId: string): Promise<Record<string, unknown>[]> {
  return pg.query<Record<string, unknown>>(sql, [listenerId]);
}

// ---- the shadow writes on the Postgres `listeners` row (common.ts explains why) ----

export async function shadowInsertListener(pg: Db, l: { id: string; email: string; passwordHash: string; displayName: string; createdAt: string }): Promise<void> {
  await pg.query(
    'INSERT INTO listeners (id, email, password_hash, display_name, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
    [l.id, l.email, l.passwordHash, l.displayName, l.createdAt],
  );
}

/** One shadow column update; `col` is one of a fixed list (never from input). */
export async function shadowListener(pg: Db, id: string, col: 'hidden_at' | 'email', value: string | null): Promise<void> {
  const sql = col === 'hidden_at' ? 'UPDATE listeners SET hidden_at = $2 WHERE id = $1' : 'UPDATE listeners SET email = $2 WHERE id = $1';
  await pg.query(sql, [id, value]);
}
