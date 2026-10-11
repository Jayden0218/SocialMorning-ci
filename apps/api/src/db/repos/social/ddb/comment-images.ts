// Comment pictures on DynamoDB: the files of removed comments and of a deleted account leave the store, then the item forgets them.
/**
 * M26 lane SC (SC-T08; M20 US9, guard G-M20-8). A comment moderation removed while it held a picture or a recording
 * carries the sparse G4 key `Q#removed-media` (set in the take-down's transaction, comments.ts); the hourly sweep
 * reads that queue, deletes each file from its store, then clears the item's columns — and the queue key once
 * nothing is left. The image-store ceiling counter goes down by the bytes in the same write. A placeholder already
 * dropped its picture; a host-hidden comment keeps its picture (its author still sees it).
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import type { ImageStorage } from '../../../../storage/image-store.ts';
import { IMAGE_SWEEP_BATCH } from '../comment-images.ts';
import * as B from './sc-bridge.ts';
import { commitRetry, keyOf, prefixItems, rawPg } from './sc-common.ts';
import { imageBytesStep } from './comments.ts';
import { forgetHeldImage, heldImagesOf } from './sc-foreign.ts';

/** Removed comments still holding a recording or a picture (the sweep's queue, oldest first). */
export async function removedMedia(store: Store, max: number): Promise<Item[]> {
  return (await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#removed-media' },
  }, { max })).items;
}

/** The comment forgets its picture (the file is already gone); the ceiling counter and, when nothing is left, the queue key go with it. */
export async function forgetImage(store: Store, db: Db, it: Item): Promise<void> {
  const fresh = await get(store, 'main', keyOf(it));
  if (!fresh?.['imagePath']) return;
  const lastMedia = !fresh['voiceUrl'];
  try {
    await commitRetry(store, (t) => {
      t.update('main', keyOf(fresh), {
        update: `REMOVE #u, #p, #w, #h, #b${lastMedia ? ', G4PK, G4SK' : ''}`,
        condition: '#p = :p', names: { '#u': 'imageUrl', '#p': 'imagePath', '#w': 'imageW', '#h': 'imageH', '#b': 'imageBytes' }, values: { ':p': fresh['imagePath'] }, label: 'comment',
      });
      imageBytesStep(t, -Number(fresh['imageBytes'] ?? 0));
    });
  } catch (e) {
    if (!(e instanceof TxCancelled && e.failed('comment'))) throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.setCommentColumns(raw, String(fresh['id']), { image_url: null, image_path: null, image_w: null, image_h: null, image_bytes: null });
}

export async function sweepRemovedImages(store: Store, db: Db, images: ImageStorage): Promise<{ deleted: number; failed: number }> {
  if (!images.ready) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const q of await removedMedia(store, IMAGE_SWEEP_BATCH * 2)) {
    const it = await get(store, 'main', keyOf(q));
    if (!it?.['imagePath'] || !(it['removedAt'] || it['deletedAt'])) continue;
    try {
      await images.remove(String(it['imagePath']));
      await forgetImage(store, db, it);
      deleted++;
    } catch {
      failed++;
    }
    if (deleted + failed >= IMAGE_SWEEP_BATCH) break;
  }
  return { deleted, failed };
}

/** Every picture this listener added (their comments' index, then held comments — lane ST), before their account goes. */
export async function removeImagesFor(store: Store, db: Db, images: ImageStorage, listenerId: string): Promise<{ deleted: number; failed: number }> {
  if (!images.ready) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const p of await prefixItems(store, K.L(listenerId), K.SC_SK.comments)) {
    const it = await get(store, 'main', { PK: K.EP(String(p['episodeId'])), SK: String(p['sk']) });
    if (!it?.['imagePath'] || it['authorId'] !== listenerId) continue;
    try {
      await images.remove(String(it['imagePath']));
      await forgetImage(store, db, it);
      deleted++;
    } catch {
      failed++;
    }
  }
  // Fix F-S: pictures on comments still held for review go too (lane ST's table, on Postgres).
  for (const h of await heldImagesOf(db, listenerId)) {
    try {
      await images.remove(h.image_path);
      await forgetHeldImage(db, h.id);
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}
