// Status route writes and checks: a text status with its items in one transaction, a listener check, image bytes used.
import { randomUUID } from 'node:crypto';
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { insertTextPost } from './voice-posts.ts';
import { insertItems, type StatusItemIn } from './status-items.ts';

/** POST /v1/voice-posts (text): the status and its items, one transaction. */
async function insertTextStatusInTxPg(db: Db, listenerId: string, body: string, items: StatusItemIn[]): Promise<Awaited<ReturnType<typeof insertTextPost>>> {
  return db.transaction(async (tx) => {
    const r = await insertTextPost(tx, { id: randomUUID(), listenerId, body });
    await insertItems(tx, r.id, listenerId, items);
    return r;
  });
}

/** One row when the listener exists. */
async function listenerExistsRowsPg(db: Db, id: string): Promise<Record<string, unknown>[]> {
  return db.query('SELECT 1 FROM listeners WHERE id = $1', [id]);
}

/** Bytes held by comment images (live comments only). */
async function liveCommentImageBytesRowsPg(db: Db): Promise<{ n: string | number | null }[]> {
  return db.query<{ n: string | number | null }>('SELECT coalesce(sum(image_bytes), 0) AS n FROM comments');
}

// M26 lane SC: each function runs on Postgres, or on DynamoDB (`ddb/status-writes.ts`) when the Db carries a Store (db/backend.ts).
export const insertTextStatusInTx = dual('sc/status-writes', 'insertTextStatusInTx', insertTextStatusInTxPg);
export const listenerExistsRows = dual('sc/status-writes', 'listenerExistsRows', listenerExistsRowsPg);
export const liveCommentImageBytesRows = dual('sc/status-writes', 'liveCommentImageBytesRows', liveCommentImageBytesRowsPg);
