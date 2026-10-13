// "Download my data" sections of lanes LB and SC, read from their DynamoDB items (no SQL).
/**
 * M26 lane LE (gap 4). Each section reads the owner's items: lane LB's in the listener
 * partition (`SUB#`, `POS#`, `LIB#`, `RANGE#`), lane SC's likes and reactions there too (`ELIKE#`, `REACT#`), and the
 * comments, clips and statuses through the author's pointers (`CMT#`, `CLP#`, `VPOST#`) to the items themselves, plus each
 * status's items (`VP#<id>/ITEM#`). account.ts turns every item into the file's shape (cleanItem: snake_case, no keys,
 * no secrets). Returns undefined for a section this file does not serve.
 */
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item, Store } from '../../../ddb/store.ts';

const IN_PARTITION: Readonly<Record<string, string>> = {
  subscriptions: 'SUB#', positions: 'POS#', library: 'LIB#', listened: 'RANGE#', likes: 'ELIKE#', reactions: 'REACT#',
};

async function prefixed(store: Store, pk: string, prefix: string): Promise<Item[]> {
  return (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': pk, ':p': prefix }, ConsistentRead: true,
  })).items;
}

const idOf = (sk: unknown): string => { const s = String(sk); return s.slice(s.lastIndexOf('#') + 1); };

export async function exportItemsSection(store: Store, name: string, listenerId: string): Promise<Item[] | undefined> {
  const own = IN_PARTITION[name];
  if (own) return prefixed(store, K.L(listenerId), own);
  if (name === 'comments') {
    const { commentItemById } = await import('../../social/ddb/sc-common.ts');
    const out: Item[] = [];
    for (const p of await prefixed(store, K.L(listenerId), 'CMT#')) { const c = await commentItemById(store, idOf(p['SK'])); if (c) out.push(c); }
    return out.sort((a, b) => (String(a['createdAt']) < String(b['createdAt']) ? -1 : 1));
  }
  if (name === 'clips') {
    const { clipItemById } = await import('../../social/ddb/clips.ts');
    const out: Item[] = [];
    for (const p of await prefixed(store, K.L(listenerId), 'CLP#')) { const c = await clipItemById(store, idOf(p['SK'])); if (c) out.push(c); }
    return out;
  }
  if (name === 'statuses' || name === 'statusItems') {
    const ids = (await prefixed(store, K.L(listenerId), 'VPOST#')).map((p) => idOf(p['SK']));
    if (name === 'statuses') return batchGetAll(store, 'main', ids.map((id) => K.voicePost(id)));
    const out: Item[] = [];
    for (const id of ids) out.push(...(await prefixed(store, `VP#${id}`, 'ITEM#')));
    return out;
  }
  return undefined;
}
