// Items on a status: up to 10 episode cards and photos; photos live in the image store until the status goes.
/**
 * M22 US6 (spec FR-020, FR-021; contracts/api.md "Statuses"; guard G-M22-12). A status carries at
 * most 10 items, in order: an episode card (`episodeId`) or a photo (`imageKey`, from
 * POST /v1/voice-posts/images). Photos follow the comment-image rules (JPEG/PNG by their bytes,
 * ≤ 1 000 000 bytes, the store's ceiling) and are kept in the same store, at
 * `statuses/<uid>/<uuid>.jpg`.
 *
 * An uploaded photo is recorded in the `cache` table under `status-photo:<path>` with its url,
 * size and owner — that row is the proof a photo key was uploaded by this listener, counts toward
 * the store's ceiling, and lets the sweep find a photo that was never posted (an orphan, deleted
 * after 2 hours). Attaching it to a status sets `postId` on the row; the sweep deletes the file
 * before the status (G-M22-2) and then the row.
 */
import type { Db } from '../../db.ts';
import type { ImageStorage } from '../../../storage/image-store.ts';

export const STATUS_ITEMS_MAX = 10;
export const STATUS_PHOTO_MAX_BYTES = 1_000_000;
/** A photo uploaded but never posted is deleted after this long. */
export const ORPHAN_PHOTO_MS = 2 * 3_600_000;
const PREFIX = 'status-photo:';

export type StatusItemIn = { kind: 'episode'; episodeId: string } | { kind: 'photo'; imageKey: string };
export type StatusItem =
  | { kind: 'episode'; episodeId: string; title?: string; showTitle?: string; imageUrl?: string; feedUrl?: string; enclosureUrl?: string; durationMs?: number }
  | { kind: 'photo'; url: string };

export class ItemsError extends Error {
  constructor(readonly code: 'too_many_items' | 'bad_item', message: string) { super(message); }
}

/** Reads `items` from a request: undefined → none; anything else must be a list of ≤ 10 valid items. */
export function parseItems(raw: unknown): StatusItemIn[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ItemsError('bad_item', 'items must be a list.');
  if (raw.length > STATUS_ITEMS_MAX) throw new ItemsError('too_many_items', `Up to ${STATUS_ITEMS_MAX} items.`);
  return raw.map((x): StatusItemIn => {
    const o = (x ?? {}) as { kind?: unknown; episodeId?: unknown; imageKey?: unknown };
    if (o.kind === 'episode' && typeof o.episodeId === 'string' && o.episodeId.length > 0 && o.episodeId.length <= 200) return { kind: 'episode', episodeId: o.episodeId };
    if (o.kind === 'photo' && typeof o.imageKey === 'string' && o.imageKey.length > 0 && o.imageKey.length <= 300) return { kind: 'photo', imageKey: o.imageKey };
    throw new ItemsError('bad_item', 'Each item is an episode or a photo.');
  });
}

/** The `x-items` header of a voice upload: URI-encoded JSON (the body is the recording). */
export function itemsFromHeader(header: string | undefined): StatusItemIn[] {
  if (header === undefined || header.trim() === '') return [];
  let raw: unknown;
  try { raw = JSON.parse(decodeURIComponent(header)); } catch { throw new ItemsError('bad_item', 'x-items must be URI-encoded JSON.'); }
  return parseItems(raw);
}

/** Bytes the image store holds for status photos (added to comment images for the ceiling). */
export async function statusPhotoBytes(db: Db): Promise<number> {
  const [r] = await db.query<{ n: string | number | null }>(`SELECT coalesce(sum((body->>'bytes')::bigint), 0) AS n FROM cache WHERE key LIKE '${PREFIX}%'`);
  return Number(r?.n ?? 0);
}

export async function recordUpload(db: Db, p: { pathname: string; url: string; bytes: number; listenerId: string }): Promise<void> {
  await db.query(
    'INSERT INTO cache (key, body, fetched_at) VALUES ($1, $2::text::jsonb, now()) ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = now()',
    [PREFIX + p.pathname, JSON.stringify({ url: p.url, bytes: p.bytes, listenerId: p.listenerId })],
  );
}

/**
 * Checks every item and writes them for a new status, in order. An episode must be known; a photo
 * must be this listener's own upload, not yet on another status.
 */
export async function insertItems(db: Db, postId: string, listenerId: string, items: readonly StatusItemIn[]): Promise<void> {
  if (items.length > STATUS_ITEMS_MAX) throw new ItemsError('too_many_items', `Up to ${STATUS_ITEMS_MAX} items.`);
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.kind === 'episode') {
      const [e] = await db.query<{ id: string }>('SELECT id FROM episodes WHERE id = $1', [it.episodeId]);
      if (!e) throw new ItemsError('bad_item', 'No such episode.');
      await db.query("INSERT INTO status_items (post_id, pos, kind, episode_id) VALUES ($1, $2, 'episode', $3)", [postId, i + 1, it.episodeId]);
    } else {
      const [u] = await db.query<{ body: { url?: string; listenerId?: string; postId?: string } | string }>('SELECT body FROM cache WHERE key = $1', [PREFIX + it.imageKey]);
      const body = u ? (typeof u.body === 'string' ? JSON.parse(u.body) as { url?: string; listenerId?: string; postId?: string } : u.body) : undefined;
      if (!body || body.listenerId !== listenerId || body.postId || !body.url) throw new ItemsError('bad_item', 'Upload the photo first.');
      await db.query("INSERT INTO status_items (post_id, pos, kind, image_key, image_url) VALUES ($1, $2, 'photo', $3, $4)", [postId, i + 1, it.imageKey, body.url]);
      await db.query(`UPDATE cache SET body = body || jsonb_build_object('postId', $2::text) WHERE key = $1`, [PREFIX + it.imageKey, postId]);
    }
  }
}

/** Items per post, in order; an episode card carries what the phone needs to show and play it. */
export async function itemsFor(db: Db, postIds: readonly string[]): Promise<Map<string, StatusItem[]>> {
  const out = new Map<string, StatusItem[]>();
  if (postIds.length === 0) return out;
  const rows = await db.query<{ post_id: string; kind: 'episode' | 'photo'; episode_id: string | null; image_url: string | null; title: string | null; show_title: string | null; e_image: string | null; feed_url: string | null; enclosure_url: string | null; duration_ms: number | null }>(
    `SELECT i.post_id, i.kind, i.episode_id, i.image_url, e.title, e.show_title, e.image_url AS e_image, e.feed_url, e.enclosure_url, e.duration_ms
       FROM status_items i LEFT JOIN episodes e ON e.id = i.episode_id
      WHERE i.post_id = ANY($1::uuid[]) ORDER BY i.post_id, i.pos`,
    [postIds],
  );
  for (const r of rows) {
    const list = out.get(r.post_id) ?? [];
    if (r.kind === 'photo' && r.image_url) list.push({ kind: 'photo', url: r.image_url });
    else if (r.kind === 'episode' && r.episode_id) {
      list.push({
        kind: 'episode', episodeId: r.episode_id,
        ...(r.title ? { title: r.title } : {}), ...(r.show_title ? { showTitle: r.show_title } : {}), ...(r.e_image ? { imageUrl: r.e_image } : {}),
        ...(r.feed_url ? { feedUrl: r.feed_url } : {}), ...(r.enclosure_url ? { enclosureUrl: r.enclosure_url } : {}),
        ...(r.duration_ms !== null ? { durationMs: Number(r.duration_ms) } : {}),
      });
    }
    out.set(r.post_id, list);
  }
  return out;
}

/** The photo files on these posts (image store pathnames). */
export async function photosOf(db: Db, postIds: readonly string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const rows = await db.query<{ image_key: string }>("SELECT image_key FROM status_items WHERE post_id = ANY($1::uuid[]) AND kind = 'photo' AND image_key IS NOT NULL", [postIds]);
  return rows.map((r) => r.image_key);
}

/** One photo leaves the store, then its rows. Throws when the store is not connected or the delete fails. */
export async function removePhoto(db: Db, images: ImageStorage | undefined, pathname: string): Promise<void> {
  if (!images?.ready) throw new Error('image store not connected');
  await images.remove(pathname);
  await db.query("DELETE FROM status_items WHERE kind = 'photo' AND image_key = $1", [pathname]);
  await db.query('DELETE FROM cache WHERE key = $1', [PREFIX + pathname]);
}

/** Photos uploaded more than 2 hours ago and never posted. */
export async function sweepOrphanPhotos(db: Db, images: ImageStorage | undefined, limit = 100): Promise<{ deleted: number; failed: number }> {
  if (!images?.ready) return { deleted: 0, failed: 0 };
  const rows = await db.query<{ key: string }>(
    `SELECT key FROM cache WHERE key LIKE '${PREFIX}%' AND NOT (body ? 'postId') AND fetched_at < now() - ($1::int * interval '1 millisecond') LIMIT $2`,
    [ORPHAN_PHOTO_MS, limit],
  );
  let deleted = 0;
  let failed = 0;
  for (const r of rows) {
    try { await removePhoto(db, images, r.key.slice(PREFIX.length)); deleted++; } catch { failed++; }
  }
  return { deleted, failed };
}
