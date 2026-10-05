// Listener playlists: make, rename, reorder, share publicly or keep private.
/**
 * M19 US4 (FR-030–FR-032). At most 50 playlists per listener and 300 episodes each. A private
 * playlist answers "not found" to anyone but its owner; a deleted one is kept as a tombstone
 * (`deleted_at`) so a second phone learns it went. Hidden shows' episodes are left out on read.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';

export const PLAYLISTS_MAX = 50;
export const PLAYLIST_ITEMS_MAX = 300;

export type Playlist = {
  id: string; title: string; isPublic: boolean; count: number; updatedAt: string;
  owner?: { id: string; displayName: string; avatarUrl?: string };
  items?: (EpisodeCard & { id: string })[];
  imageUrl?: string;
};

type Row = { id: string; owner_id: string; title: string; is_public: boolean; updated_at: Date | string; n: number; image_url: string | null };

const LIST = `SELECT p.id, p.owner_id, p.title, p.is_public, p.updated_at,
  (SELECT count(*)::int FROM playlist_items i WHERE i.playlist_id = p.id) AS n,
  (SELECT e.image_url FROM playlist_items i JOIN episodes e ON e.id = i.episode_id WHERE i.playlist_id = p.id ORDER BY i.position LIMIT 1) AS image_url
  FROM playlists p`;

const toPlaylist = (r: Row): Playlist => ({
  id: r.id, title: r.title, isPublic: r.is_public, count: Number(r.n), updatedAt: new Date(r.updated_at).toISOString(),
  ...(r.image_url ? { imageUrl: r.image_url } : {}),
});

export async function myPlaylists(db: Db, ownerId: string): Promise<Playlist[]> {
  return (await db.query<Row>(`${LIST} WHERE p.owner_id = $1 AND p.deleted_at IS NULL ORDER BY p.updated_at DESC`, [ownerId])).map(toPlaylist);
}

/** Public playlists of an account; all of them when the viewer is the owner. */
export async function playlistsOf(db: Db, ownerId: string, viewerId: string | undefined): Promise<Playlist[]> {
  return (await db.query<Row>(`${LIST} WHERE p.owner_id = $1 AND p.deleted_at IS NULL AND (p.is_public OR p.owner_id = $2) ORDER BY p.updated_at DESC`, [ownerId, viewerId ?? null])).map(toPlaylist);
}

async function ownRow(db: Db, id: string, ownerId: string): Promise<void> {
  const [r] = await db.query<{ owner_id: string }>('SELECT owner_id FROM playlists WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!r || r.owner_id !== ownerId) throw new ApiError('not_found', 'No such playlist.');
}

export async function createPlaylist(db: Db, ownerId: string, title: string, isPublic: boolean): Promise<Playlist> {
  const [n] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM playlists WHERE owner_id = $1 AND deleted_at IS NULL', [ownerId]);
  if (Number(n?.n ?? 0) >= PLAYLISTS_MAX) throw new ApiError('conflict', `You can keep at most ${PLAYLISTS_MAX} playlists.`);
  const [r] = await db.query<{ id: string }>('INSERT INTO playlists (owner_id, title, is_public) VALUES ($1, $2, $3) RETURNING id', [ownerId, title, isPublic]);
  return (await getPlaylist(db, r!.id, ownerId))!;
}

export async function updatePlaylist(db: Db, id: string, ownerId: string, p: { title?: string; isPublic?: boolean }): Promise<Playlist> {
  await ownRow(db, id, ownerId);
  await db.query('UPDATE playlists SET title = coalesce($2, title), is_public = coalesce($3, is_public), updated_at = now() WHERE id = $1', [id, p.title ?? null, p.isPublic ?? null]);
  return (await getPlaylist(db, id, ownerId))!;
}

export async function deletePlaylist(db: Db, id: string, ownerId: string): Promise<void> {
  await ownRow(db, id, ownerId);
  await db.query('DELETE FROM playlist_items WHERE playlist_id = $1', [id]);
  await db.query('UPDATE playlists SET deleted_at = now(), updated_at = now() WHERE id = $1', [id]);
}

/** Replaces the whole ordered list (reorder and remove in one call). Unknown episodes are refused. */
export async function setItems(db: Db, id: string, ownerId: string, episodeIds: string[]): Promise<Playlist> {
  await ownRow(db, id, ownerId);
  const ids = [...new Set(episodeIds)];
  if (ids.length > PLAYLIST_ITEMS_MAX) throw new ApiError('conflict', `A playlist holds at most ${PLAYLIST_ITEMS_MAX} episodes.`);
  if (ids.length > 0) {
    const known = await db.query<{ id: string }>('SELECT id FROM episodes WHERE id IN (SELECT value FROM jsonb_array_elements_text(($1::text)::jsonb))', [JSON.stringify(ids)]);
    if (known.length !== ids.length) throw new ApiError('not_found', 'One of those episodes is unknown.');
  }
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM playlist_items WHERE playlist_id = $1', [id]);
    for (const [i, e] of ids.entries()) await tx.query('INSERT INTO playlist_items (playlist_id, episode_id, position) VALUES ($1, $2, $3)', [id, e, i]);
    await tx.query('UPDATE playlists SET updated_at = now() WHERE id = $1', [id]);
  });
  return (await getPlaylist(db, id, ownerId))!;
}

export async function addItem(db: Db, id: string, ownerId: string, episodeId: string): Promise<Playlist> {
  await ownRow(db, id, ownerId);
  const [e] = await db.query<{ id: string }>('SELECT id FROM episodes WHERE id = $1', [episodeId]);
  if (!e) throw new ApiError('not_found', 'No such episode.');
  const [n] = await db.query<{ n: number; top: number | null }>('SELECT count(*)::int AS n, max(position) AS top FROM playlist_items WHERE playlist_id = $1', [id]);
  if (Number(n?.n ?? 0) >= PLAYLIST_ITEMS_MAX) throw new ApiError('conflict', `A playlist holds at most ${PLAYLIST_ITEMS_MAX} episodes.`);
  await db.query('INSERT INTO playlist_items (playlist_id, episode_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, episodeId, (n?.top ?? -1) + 1]);
  await db.query('UPDATE playlists SET updated_at = now() WHERE id = $1', [id]);
  return (await getPlaylist(db, id, ownerId))!;
}

/** One playlist with its episodes in order — undefined (404) when private and not the viewer's. */
export async function getPlaylist(db: Db, id: string, viewerId: string | undefined): Promise<Playlist | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<Row & { display_name: string; avatar_url: string | null }>(
    `SELECT x.*, l.display_name, l.avatar_url FROM (${LIST} WHERE p.id = $1 AND p.deleted_at IS NULL) x JOIN listeners l ON l.id = x.owner_id`, [id]);
  if (!r) return undefined;
  const items = await db.query<{ id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at: Date | string | null }>(
    `SELECT e.id, e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url, e.published_at
     FROM playlist_items i JOIN episodes e ON e.id = i.episode_id
     WHERE i.playlist_id = $1 AND NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = e.feed_url)
     ORDER BY i.position`, [id]);
  return {
    ...toPlaylist(r),
    owner: { id: r.owner_id, displayName: r.display_name, ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) },
    items: items.map((e) => ({
      id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url,
      ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: e.duration_ms } : {}),
      ...(e.published_at !== null ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
    })),
  };
}
