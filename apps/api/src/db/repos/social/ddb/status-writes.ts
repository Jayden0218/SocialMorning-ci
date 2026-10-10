// Status route writes on DynamoDB: a text status with its items (refused whole), the listener check, the comment-image bytes.
/**
 * M26 lane SC (SC-T06, SC-T08). A text status and its items were one SQL transaction; here the status is written,
 * then its items in one TransactWriteItems — a refused item deletes the status again, so the answer is the same
 * all-or-nothing. The Postgres rows go in the bridge's transaction.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { insertItems, type StatusItemIn } from '../status-items.ts';
import { insertTextPost } from '../voice-posts.ts';
import type { VoiceRow } from '../voice-posts.ts';
import { dropPartition } from './voice-posts.ts';
import { imageBytesHeld } from './comments.ts';

export async function insertTextStatusInTx(_store: Store, db: Db, listenerId: string, body: string, items: StatusItemIn[]): Promise<VoiceRow> {
  return db.transaction(async (tx) => {
    const r = await insertTextPost(tx, { id: randomUUID(), listenerId, body });
    try {
      await insertItems(tx, r.id, listenerId, items);
    } catch (e) {
      await dropPartition(_store, r.id);
      throw e;
    }
    return r;
  });
}

/** One row when the listener exists (lane AC's item). */
export async function listenerExistsRows(store: Store, _db: Db, id: string): Promise<Record<string, unknown>[]> {
  return (await get(store, 'main', K.listener(id))) ? [{ '?column?': 1 }] : [];
}

/** Bytes held by comment images (live comments only — the kept counter). */
export async function liveCommentImageBytesRows(store: Store, _db: Db): Promise<{ n: string | number | null }[]> {
  return [{ n: await imageBytesHeld(store) }];
}
