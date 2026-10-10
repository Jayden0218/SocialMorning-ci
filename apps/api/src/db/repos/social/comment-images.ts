// Comment images: deleting them from the store when their comment or their author goes.
/**
 * M20 US9 (spec FR-055; constitution v3.2.0, G-M20-8). An image is deleted from storage — not
 * merely hidden — when its author deletes the comment (the route does it at once), when moderation
 * removes it (the internal cycle's sweep, which also retries a failed delete), and, for every image
 * of an account, before the account is deleted. A comment its host hid keeps its image: its author
 * still sees it.
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import type { ImageStorage } from '../../../storage/image-store.ts';

export const IMAGE_SWEEP_BATCH = 100;

/** Removed or deleted comments still holding an image: delete each file, then forget it. */
async function sweepRemovedImagesPg(db: Db, store: ImageStorage): Promise<{ deleted: number; failed: number }> {
  if (!store.ready) return { deleted: 0, failed: 0 };
  const rows = await db.query<{ id: string; image_path: string }>(
    `SELECT id, image_path FROM comments WHERE image_path IS NOT NULL AND (removed_at IS NOT NULL OR deleted_at IS NOT NULL) LIMIT ${IMAGE_SWEEP_BATCH}`,
  );
  return forget(db, store, rows);
}

/** Every image this listener added, before their account is deleted. */
async function removeImagesForPg(db: Db, store: ImageStorage, listenerId: string): Promise<{ deleted: number; failed: number }> {
  if (!store.ready) return { deleted: 0, failed: 0 };
  const rows = await db.query<{ id: string; image_path: string }>('SELECT id, image_path FROM comments WHERE author_id = $1 AND image_path IS NOT NULL', [listenerId]);
  const done = await forget(db, store, rows);
  // Fix F-S: pictures on comments still held for review go too.
  const held = await db.query<{ id: string; image_path: string }>('SELECT id, image_path FROM held_comments WHERE author_id = $1 AND image_path IS NOT NULL', [listenerId]);
  const more = await forget(db, store, held, 'held_comments');
  return { deleted: done.deleted + more.deleted, failed: done.failed + more.failed };
}

async function forget(db: Db, store: ImageStorage, rows: { id: string; image_path: string }[], table: 'comments' | 'held_comments' = 'comments'): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await store.remove(r.image_path);
      await db.query(`UPDATE ${table} SET image_url = NULL, image_path = NULL, image_w = NULL, image_h = NULL, image_bytes = NULL WHERE id = $1`, [r.id]);
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}

// M26 lane SC: each function runs on Postgres, or on DynamoDB (`ddb/comment-images.ts`) when the Db carries a Store (db/backend.ts).
export const sweepRemovedImages = dual('sc/comment-images', 'sweepRemovedImages', sweepRemovedImagesPg);
export const removeImagesFor = dual('sc/comment-images', 'removeImagesFor', removeImagesForPg);
