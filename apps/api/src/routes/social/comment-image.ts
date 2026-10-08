// Comment image route: the author adds one picture to their comment, kept in the image store.
/**
 * M20 US9 (spec FR-053–FR-055; contracts/api.md "Comment images"; constitution v3.2.0) —
 * POST /v1/comments/:id/image. The body is the raw JPEG (the phone shrinks it to ≤ 1600 px and
 * JPEG 0.8 first), at most 1 000 000 bytes; `x-width` / `x-height` give its size. Only the
 * comment's author, within 10 minutes of posting, once. The server checks the bytes are really a
 * JPEG or PNG, and refuses (507) once the store's ceiling would be passed. Without the store's env
 * it answers 503 `storage_off`, and GET /v1/comments/images says so, so the phone hides the button.
 *
 * M24 fix F-S: the id may also be the author's comment held for review (`held_comments`, US8) —
 * the picture waits with it; Approve moves it into `comments`, Reject deletes it from the store.
 */
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { sniff } from '../../db/repos/account/feedback.ts';
import { getComment, toPublic } from '../../db/repos/social/comments.ts';
import { heldForImage, heldToPublic, setHeldImage } from '../../db/repos/studio/comment-policy.ts';

export const COMMENT_IMAGE_MAX_BYTES = 1_000_000;
const WINDOW_MS = 10 * 60_000;
const UUID = /^[0-9a-f-]{36}$/i;

export const commentImage = new Hono<AuthEnv>();

/** Whether images can be added at all (the phone shows the button only when true). */
commentImage.get('/images', (c) => c.json({ on: c.get('images').ready }));

commentImage.post('/:id/image', requireAuth, async (c) => {
  const store = c.get('images');
  if (!store.ready) throw new ApiError('storage_off', 'Images in comments are not switched on yet.');
  const db = c.get('db');
  const me = c.get('listener')!;
  const id = c.req.param('id');
  if (!UUID.test(id)) throw new ApiError('not_found', 'No such comment.');
  const live = await getComment(db, id);
  // Fix F-S: not in `comments` → maybe the author's comment held for review.
  const held = live ? undefined : await heldForImage(db, id);
  const row = live ?? (held ? { ...held, deleted_at: null, removed_at: null } : undefined);
  if (!row || row.deleted_at !== null || row.removed_at !== null) throw new ApiError('not_found', 'No such comment.');
  if (row.author_id !== me.id) throw new ApiError('forbidden', 'Only the author can add an image.');
  if (Date.now() - new Date(row.created_at).getTime() > WINDOW_MS) throw new ApiError('validation', 'An image can be added only in the first 10 minutes.', { fields: ['id'] });
  if (row.image_path) throw new ApiError('conflict', 'This comment already has an image.');
  const w = Number(c.req.header('x-width'));
  const h = Number(c.req.header('x-height'));
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096) throw new ApiError('validation', 'x-width and x-height must be 1–4096.', { fields: ['x-width', 'x-height'] });

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) throw new ApiError('validation', 'The image is empty.', { fields: ['body'] });
  if (bytes.length > COMMENT_IMAGE_MAX_BYTES) throw new ApiError('too_large', 'An image is at most 1 MB.');
  const type = sniff(bytes);
  if (!type) throw new ApiError('validation', 'Send a JPEG or PNG picture.', { fields: ['body'] });
  const [used] = await db.query<{ n: string | number | null }>(
    'SELECT (SELECT coalesce(sum(image_bytes), 0) FROM comments) + (SELECT coalesce(sum(image_bytes), 0) FROM held_comments) AS n');
  if (Number(used?.n ?? 0) + bytes.length > c.get('imageCeilingBytes')) throw new ApiError('storage_full', 'The image store is full. Try again later.');

  const path = `comments/${me.id}/${randomUUID()}.${type === 'image/png' ? 'png' : 'jpg'}`;
  let stored: { url: string; pathname: string };
  try {
    stored = await store.put(path, bytes, type);
  } catch (e) {
    console.error(c.get('requestId'), 'comment image put', e);
    throw new ApiError('unavailable', "Couldn't save the image. Try again.");
  }
  const image = { url: stored.url, path: stored.pathname, w, h, bytes: bytes.length };
  if (held) {
    const kept = await setHeldImage(db, id, me.id, image);
    if (!kept) {
      // Approved or rejected while the bytes were uploading: the picture has no comment to wait with.
      try { await store.remove(stored.pathname); } catch (e) { console.error(c.get('requestId'), 'comment image remove', e); }
      throw new ApiError('not_found', 'No such comment.');
    }
    return c.json({ comment: heldToPublic(kept), held: true }, 201);
  }
  await db.query('UPDATE comments SET image_url = $2, image_path = $3, image_w = $4, image_h = $5, image_bytes = $6 WHERE id = $1', [id, image.url, image.path, w, h, image.bytes]);
  const fresh = await getComment(db, id);
  return c.json({ comment: toPublic(fresh!, me.id) }, 201);
});
