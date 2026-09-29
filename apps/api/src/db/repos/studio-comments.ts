/**
 * M11 US3 — a show's comments, as its creator sees them in the Studio (FR-013..FR-016).
 *
 * A reply goes through the app's own `createComment`, so it gets the same depth and parent
 * rules; the route adds the same rate floor and block check the app's POST applies. A hide is
 * reversible (`host_hidden_at`), unlike /mod's remove, and each hide/un-hide is written to
 * `moderation_actions` so the owner's /mod page sees it and can undo it (research R6).
 */
import type { Db } from '../db.ts';
import { ApiError } from '../../errors.ts';
import { rebuildEpisodeHeat } from '../../heat/rebuild.ts';

export type StudioComment = {
  id: string;
  episodeId: string;
  episodeTitle: string;
  author: { id: string; displayName: string } | null;
  body: string | null;
  state: 'visible' | 'host_hidden' | 'removed' | 'deleted';
  offsetMs: number | null;
  createdAt: string;
  parentId: string | null;
  replies: number;
  /** Written by the show's owner or a helper — they cannot be muted on their own show. */
  byTeam: boolean;
};

type Row = {
  id: string; episode_id: string; title: string; author_id: string | null; display_name: string | null; body: string | null;
  offset_ms: number | null; created_at: Date | string; parent_id: string | null;
  deleted_at: Date | string | null; removed_at: Date | string | null; host_hidden_at: Date | string | null; replies: number | string; by_team: boolean;
};

const PAGE = 30;

const toStudio = (r: Row): StudioComment => {
  const state: StudioComment['state'] = r.removed_at ? 'removed' : r.deleted_at ? 'deleted' : r.host_hidden_at ? 'host_hidden' : 'visible';
  const shown = state === 'visible' || state === 'host_hidden';
  return {
    id: r.id, episodeId: r.episode_id, episodeTitle: r.title,
    author: shown && r.author_id ? { id: r.author_id, displayName: r.display_name ?? '' } : null,
    body: shown ? r.body : null,
    state, offsetMs: shown ? r.offset_ms : null, createdAt: new Date(r.created_at).toISOString(),
    parentId: r.parent_id, replies: Number(r.replies), byTeam: r.by_team === true,
  };
};

/** Newest first; search matches the body (case-insensitive), `episodeId` narrows to one episode. */
export async function listShowComments(
  db: Db, feedUrl: string, opts: { q?: string; episodeId?: string; before?: string } = {},
): Promise<{ items: StudioComment[]; next?: string }> {
  const rows = await db.query<Row>(
    `SELECT c.id, c.episode_id, e.title, c.author_id, l.display_name, c.body, c.offset_ms, c.created_at, c.parent_id,
            c.deleted_at, c.removed_at, c.host_hidden_at,
            (SELECT count(*) FROM comments r WHERE r.parent_id = c.id) AS replies,
            (EXISTS (SELECT 1 FROM creator_claims cl WHERE cl.feed_url = e.feed_url AND cl.status = 'proven' AND cl.listener_id = c.author_id)
              OR EXISTS (SELECT 1 FROM show_members m WHERE m.feed_url = e.feed_url AND m.listener_id = c.author_id)) AS by_team
       FROM comments c JOIN episodes e ON e.id = c.episode_id LEFT JOIN listeners l ON l.id = c.author_id
      WHERE e.feed_url = $1
        AND ($2::text IS NULL OR c.body ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR c.episode_id = $3)
        AND ($4::timestamptz IS NULL OR c.created_at < $4::timestamptz)
      ORDER BY c.created_at DESC, c.id DESC LIMIT ${PAGE + 1}`,
    [feedUrl, opts.q?.trim() ? opts.q.trim().replace(/[\\%_]/g, (m) => '\\' + m) : null, opts.episodeId ?? null, opts.before ?? null],
  );
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  return { items: page.map(toStudio), ...(rows.length > PAGE && last ? { next: new Date(last.created_at).toISOString() } : {}) };
}

/** The comment, only if it belongs to this feed — every write below starts here. */
export async function commentOnFeed(db: Db, feedUrl: string, id: string): Promise<{ id: string; episode_id: string; parent_id: string | null; author_id: string | null; offset_ms: number | null } | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<{ id: string; episode_id: string; parent_id: string | null; author_id: string | null; offset_ms: number | null }>(
    'SELECT c.id, c.episode_id, c.parent_id, c.author_id, c.offset_ms FROM comments c JOIN episodes e ON e.id = c.episode_id WHERE c.id = $1 AND e.feed_url = $2',
    [id, feedUrl],
  );
  return r;
}

/** Hide (or un-hide) a comment on this show; logged; the heat curve and the feed item follow. */
export async function setHostHidden(db: Db, feedUrl: string, id: string, actorId: string, hidden: boolean): Promise<void> {
  const c = await commentOnFeed(db, feedUrl, id);
  if (!c) throw new ApiError('not_found', 'No such comment on this show.');
  await db.transaction(async (tx) => {
    const changed = await tx.query<{ id: string }>(
      hidden
        ? 'UPDATE comments SET host_hidden_at = now(), host_hidden_by = $2 WHERE id = $1 AND host_hidden_at IS NULL RETURNING id'
        : 'UPDATE comments SET host_hidden_at = NULL, host_hidden_by = NULL WHERE id = $1 AND host_hidden_at IS NOT NULL RETURNING id',
      [id, ...(hidden ? [actorId] : [])],
    );
    if (changed.length === 0) return; // already in that state: nothing to log
    await tx.query(
      "INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, $2, 'comment', $3)",
      [actorId, hidden ? 'host_hide' : 'host_unhide', id],
    );
    // A top-level comment is a feed item (M4): it leaves the feeds while hidden and comes back after.
    if (c.parent_id === null && c.author_id) {
      if (hidden) await tx.query("DELETE FROM activity WHERE kind = 'commented' AND ref_id = $1", [id]);
      else {
        await tx.query(
          `INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden, created_at)
           SELECT author_id, 'commented', episode_id, offset_ms, id, false, created_at FROM comments WHERE id = $1
           ON CONFLICT DO NOTHING`,
          [id],
        );
      }
    }
    if (c.offset_ms !== null) await rebuildEpisodeHeat(tx, c.episode_id);
  });
}

/** For /mod: the latest host hides still in force, with enough to judge them. */
export async function recentHostHides(db: Db, limit = 50): Promise<{ id: string; body: string | null; title: string; feedUrl: string; by: string | null; at: string }[]> {
  const rows = await db.query<{ id: string; body: string | null; title: string; feed_url: string; by: string | null; at: Date | string }>(
    `SELECT c.id, c.body, e.title, e.feed_url, l.display_name AS by, c.host_hidden_at AS at
       FROM comments c JOIN episodes e ON e.id = c.episode_id LEFT JOIN listeners l ON l.id = c.host_hidden_by
      WHERE c.host_hidden_at IS NOT NULL ORDER BY c.host_hidden_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ id: r.id, body: r.body, title: r.title, feedUrl: r.feed_url, by: r.by, at: new Date(r.at).toISOString() }));
}
