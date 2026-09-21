/**
 * Clips (M4 FR-001..006): a RANGE on an episode, no media. `create` is idempotent on
 * (author, clientId) — a phone that retries after a crash makes one clip (G8) — and
 * writes the `clipped` activity row in the same transaction (research R4).
 */
import type { Db } from '../db.ts';
import type { EpisodeRow } from './episodes.ts';

export type ClipRow = {
  id: string; author_id: string; author_name: string | null; client_id: string; episode_id: string;
  start_ms: number; end_ms: number; caption: string; created_at: string; deleted_at: string | null;
};

export type ClipOut = {
  id: string; author: { id: string; displayName: string | null }; episodeId: string;
  startMs: number; endMs: number; caption: string; createdAt: string; deleted: boolean;
};

export const toClipOut = (r: ClipRow): ClipOut => ({
  id: r.id, author: { id: r.author_id, displayName: r.author_name }, episodeId: r.episode_id,
  startMs: r.start_ms, endMs: r.end_ms, caption: r.caption, createdAt: new Date(r.created_at).toISOString(), deleted: r.deleted_at !== null,
});

const SELECT = `SELECT c.id, c.author_id, l.display_name AS author_name, c.client_id, c.episode_id, c.start_ms, c.end_ms, c.caption, c.created_at, c.deleted_at
                FROM clips c LEFT JOIN listeners l ON l.id = c.author_id`;

export async function createClip(
  db: Db,
  input: { authorId: string; clientId: string; episodeId: string; startMs: number; endMs: number; caption: string },
): Promise<{ clip: ClipRow; created: boolean }> {
  return db.transaction(async (tx) => {
    const existing = await tx.query<ClipRow>(`${SELECT} WHERE c.author_id = $1 AND c.client_id = $2`, [input.authorId, input.clientId]);
    const [inserted] = await tx.query<{ id: string }>(
      `INSERT INTO clips (author_id, client_id, episode_id, start_ms, end_ms, caption) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [input.authorId, input.clientId, input.episodeId, input.startMs, input.endMs, input.caption],
    );
    if (!inserted) {
      // Lost a race with the same phone's retry: the other insert won.
      const again = await tx.query<ClipRow>(`${SELECT} WHERE c.author_id = $1 AND c.client_id = $2`, [input.authorId, input.clientId]);
      return { clip: again[0]!, created: false };
    }
    await tx.query(
      `INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden) VALUES ($1, 'clipped', $2, $3, $4, false)`,
      [input.authorId, input.episodeId, input.startMs, inserted.id],
    );
    const [row] = await tx.query<ClipRow>(`${SELECT} WHERE c.id = $1`, [inserted.id]);
    return { clip: row!, created: true };
  });
}

/** The clip and its episode record — deleted clips included (FR-005: the link still offers the episode). */
export async function getClip(db: Db, id: string): Promise<{ clip: ClipRow; episode: EpisodeRow } | undefined> {
  type Joined = ClipRow & { e_feed_url: string; e_guid: string; e_title: string; e_show_title: string | null; e_enclosure_url: string; e_image_url: string | null; e_duration_ms: number | null };
  const rows = await db.query<Joined>(
    `SELECT c.id, c.author_id, l.display_name AS author_name, c.client_id, c.episode_id, c.start_ms, c.end_ms, c.caption, c.created_at, c.deleted_at,
            e.feed_url AS e_feed_url, e.guid AS e_guid, e.title AS e_title, e.show_title AS e_show_title,
            e.enclosure_url AS e_enclosure_url, e.image_url AS e_image_url, e.duration_ms AS e_duration_ms
     FROM clips c LEFT JOIN listeners l ON l.id = c.author_id JOIN episodes e ON e.id = c.episode_id
     WHERE c.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return undefined;
  const { e_feed_url, e_guid, e_title, e_show_title, e_enclosure_url, e_image_url, e_duration_ms, ...clip } = r;
  return {
    clip,
    episode: { id: clip.episode_id, feed_url: e_feed_url, guid: e_guid, title: e_title, show_title: e_show_title, enclosure_url: e_enclosure_url, image_url: e_image_url, duration_ms: e_duration_ms },
  };
}

export async function listClipsForEpisode(db: Db, episodeId: string, before?: string, limit = 20): Promise<{ clips: ClipRow[]; next?: string }> {
  const rows = await db.query<ClipRow>(
    `${SELECT} WHERE c.episode_id = $1 AND c.deleted_at IS NULL ${before ? 'AND c.created_at < $3' : ''} ORDER BY c.created_at DESC, c.id DESC LIMIT $2`,
    before ? [episodeId, limit + 1, before] : [episodeId, limit + 1],
  );
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? new Date(page[page.length - 1]!.created_at).toISOString() : undefined;
  return { clips: page, ...(next ? { next } : {}) };
}

/** Soft delete by the author. Returns 'gone' when there is no such live clip, 'forbidden' for someone else's. */
export async function deleteClip(db: Db, id: string, authorId: string): Promise<'deleted' | 'gone' | 'forbidden'> {
  const [row] = await db.query<{ author_id: string; deleted_at: string | null }>('SELECT author_id, deleted_at FROM clips WHERE id = $1', [id]);
  if (!row || row.deleted_at !== null) return 'gone';
  if (row.author_id !== authorId) return 'forbidden';
  await db.transaction(async (tx) => {
    await tx.query('UPDATE clips SET deleted_at = now() WHERE id = $1', [id]);
    await tx.query(`DELETE FROM activity WHERE kind = 'clipped' AND ref_id = $1`, [id]);
  });
  return 'deleted';
}
