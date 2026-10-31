// "My comments" on DynamoDB: the author's comment pointers, newest first, with each comment and its episode.
/**
 * M26 lane LE (gap 4: `myComments` in library/library.ts was a plain SQL function). Lane SC's author index
 * `L#<author>/CMT#<createdAt>#<id>` (top-level ones have no `parentId`), then the comment items (`commentItemById`) and
 * lane LB's episode items — the SQL's JOIN episodes (no episode → no row). A placeholder loses its author (and its
 * pointer), as the SQL's `author_id = NULL` row left this list.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { str, optStr, optNum } from '../../../ddb/codec.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import type { MyComment } from '../../library/library.ts';
import { UUID } from './sc-common.ts';

/** Many comments by id in two batch reads (the CREF pointers, then the items), strongly; ids with no comment are left out, order kept. */
export async function commentItemsByIds(store: Store, ids: readonly string[]): Promise<Item[]> {
  const valid = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (valid.length === 0) return [];
  const refs = new Map((await batchGetAll(store, 'main', valid.map((id) => K.commentRef(id)))).map((r) => [str(r, 'PK'), r]));
  const keys = valid.flatMap((id) => { const r = refs.get(K.commentRef(id).PK); return r ? [{ PK: K.EP(str(r, 'episodeId')), SK: str(r, 'sk') }] : []; });
  const found = new Map((await batchGetAll(store, 'main', keys)).map((c) => [str(c, 'id'), c]));
  return ids.flatMap((id) => { const c = found.get(id); return c ? [c] : []; });
}

export async function myComments(store: Store, _db: Db, listenerId: string, before?: string): Promise<{ items: MyComment[]; next?: string }> {
  const hi = before ? `CMT#${K.ts(before)}` : 'CMT#~';
  const { items: ptrs } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':lo': 'CMT#', ':hi': hi },
    ConsistentRead: true, ScanIndexForward: false,
  }, { max: 51, keep: (p) => !p['parentId'] && str(p, 'SK') !== hi });
  const comments = await commentItemsByIds(store, ptrs.map((p) => str(p, 'id')));
  const eps = new Map((await batchGetAll(store, 'main', [...new Set(comments.map((c) => str(c, 'episodeId')))].map((id) => K.episode(id)))).map((e) => [str(e, 'id'), e]));
  const rows = comments.filter((c) => eps.has(str(c, 'episodeId')));
  const page = rows.slice(0, 50);
  const items = page.map((c): MyComment => {
    const e = eps.get(str(c, 'episodeId'))!;
    const deleted = optStr(c, 'deletedAt') !== null;
    const removed = optStr(c, 'removedAt') !== null;
    // An episode item can lack title / feedUrl / enclosureUrl (a partial write); one such row must not fail the whole list (M32 FB2).
    const image = optStr(e, 'imageUrl');
    return {
      id: str(c, 'id'), body: deleted || removed ? null : optStr(c, 'body'), deleted, removed, ...(optStr(c, 'hostHiddenAt') !== null ? { hiddenByHost: true as const } : {}),
      offsetMs: optNum(c, 'offsetMs'),
      createdAt: new Date(str(c, 'createdAt')).toISOString(),
      episode: { id: str(e, 'id'), feedUrl: optStr(e, 'feedUrl') ?? '', guid: optStr(e, 'guid') ?? '', title: optStr(e, 'title') ?? '', showTitle: optStr(e, 'showTitle') ?? '', enclosureUrl: optStr(e, 'enclosureUrl') ?? '', ...(image ? { imageUrl: image } : {}) },
    };
  });
  const last = page[page.length - 1];
  return { items, ...(rows.length > 50 && last ? { next: new Date(str(last, 'createdAt')).toISOString() } : {}) };
}
