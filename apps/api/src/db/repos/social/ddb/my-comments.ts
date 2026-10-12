// "My comments" on DynamoDB: the author's comment pointers, newest first, with each comment and its episode.
/**
 * M26 lane LE (gap 4: `myComments` in library/library.ts was a plain SQL function). Lane SC's author index
 * `L#<author>/CMT#<createdAt>#<id>` (top-level ones have no `parentId`), then the comment items (`commentItemById`) and
 * lane LB's episode items — the SQL's JOIN episodes (no episode → no row). A placeholder loses its author (and its
 * pointer), as the SQL's `author_id = NULL` row left this list.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import type { MyComment } from '../../library/library.ts';
import { commentItemById } from './sc-common.ts';

export async function myComments(store: Store, _db: Db, listenerId: string, before?: string): Promise<{ items: MyComment[]; next?: string }> {
  const hi = before ? `CMT#${K.ts(before)}` : 'CMT#~';
  const { items: ptrs } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':lo': 'CMT#', ':hi': hi },
    ConsistentRead: true, ScanIndexForward: false,
  }, { max: 51, keep: (p) => !p['parentId'] && String(p['SK']) !== hi });
  const comments: Item[] = [];
  for (const p of ptrs) { const c = await commentItemById(store, String(p['id'])); if (c) comments.push(c); }
  const eps = new Map((await batchGetAll(store, 'main', [...new Set(comments.map((c) => String(c['episodeId'])))].map((id) => K.episode(id)))).map((e) => [String(e['id']), e]));
  const rows = comments.filter((c) => eps.has(String(c['episodeId'])));
  const page = rows.slice(0, 50);
  const s = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
  const items = page.map((c): MyComment => {
    const e = eps.get(String(c['episodeId']))!;
    const deleted = s(c['deletedAt']) !== null;
    const removed = s(c['removedAt']) !== null;
    const image = s(e['imageUrl']);
    return {
      id: String(c['id']), body: deleted || removed ? null : s(c['body']), deleted, removed, ...(s(c['hostHiddenAt']) !== null ? { hiddenByHost: true as const } : {}),
      offsetMs: c['offsetMs'] === undefined || c['offsetMs'] === null ? null : Number(c['offsetMs']),
      createdAt: new Date(String(c['createdAt'])).toISOString(),
      episode: { id: String(e['id']), feedUrl: String(e['feedUrl']), guid: String(e['guid']), title: String(e['title']), showTitle: s(e['showTitle']) ?? '', enclosureUrl: String(e['enclosureUrl']), ...(image ? { imageUrl: image } : {}) },
    };
  });
  const last = page[page.length - 1];
  return { items, ...(rows.length > 50 && last ? { next: new Date(String(last['createdAt'])).toISOString() } : {}) };
}
