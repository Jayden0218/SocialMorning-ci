// The admin catalogue (picks, issues, collections) read from lane DV's documents, in the row shapes catalog/live.ts merges.
/**
 * M26 lane DV. `src/db/repos/library/catalog.ts` (lane LB's file) reads lane DV's tables for `catalog/live.ts`; on
 * DynamoDB its six functions read the three partitions (`PICKS`, `CUR#issues`, `CUR#collections`) and flatten the
 * documents back into the old rows (items carry their 1-based position).
 */
import type { Db } from '../../../db.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import { partitionItems } from './common.ts';

type Pick = { feedUrl: string; guid?: string; why: string };
type IssueIt = { feedUrl: string; guid?: string; note: string };
type ColIt = { feedUrl: string; guid?: string; why?: string };
const itemsOf = <T>(d: Item): T[] => (d['items'] as T[] | undefined) ?? [];

export async function listPickDays(store: Store, _db: Db): Promise<{ day: Date | string }[]> {
  return (await partitionItems(store, 'PICKS')).map((d) => ({ day: String(d['day']) }));
}

export async function listPickItems(store: Store, _db: Db): Promise<{ day: Date | string; position: number; feed_url: string; guid: string | null; why: string }[]> {
  return (await partitionItems(store, 'PICKS')).flatMap((d) => itemsOf<Pick>(d).map((p, i) => ({ day: String(d['day']), position: i + 1, feed_url: p.feedUrl, guid: p.guid ?? null, why: p.why })));
}

export async function listCuratedIssues(store: Store, _db: Db): Promise<{ id: string; day: Date | string; title: string; intro: string; retired_at: string | null }[]> {
  return (await partitionItems(store, 'CUR#issues')).map((d) => ({ id: String(d['id']), day: String(d['day']), title: String(d['title']), intro: String(d['intro']), retired_at: (d['retiredAt'] as string | null | undefined) ?? null }));
}

export async function listCuratedIssueItems(store: Store, _db: Db): Promise<{ issue_id: string; position: number; feed_url: string; guid: string | null; note: string }[]> {
  return (await partitionItems(store, 'CUR#issues')).flatMap((d) => itemsOf<IssueIt>(d).map((x, i) => ({ issue_id: String(d['id']), position: i + 1, feed_url: x.feedUrl, guid: x.guid ?? null, note: x.note })));
}

export async function listCollectionRows(store: Store, _db: Db): Promise<{ id: string; title: string; subtitle: string | null; position: number; retired_at: string | null }[]> {
  return (await partitionItems(store, 'CUR#collections'))
    .map((d) => ({ id: String(d['id']), title: String(d['title']), subtitle: (d['subtitle'] as string | null | undefined) ?? null, position: Number(d['position']), retired_at: (d['retiredAt'] as string | null | undefined) ?? null }))
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function listCollectionItemRows(store: Store, _db: Db): Promise<{ collection_id: string; position: number; feed_url: string; guid: string | null; why: string | null }[]> {
  return (await partitionItems(store, 'CUR#collections')).flatMap((d) => itemsOf<ColIt>(d).map((x, i) => ({ collection_id: String(d['id']), position: i + 1, feed_url: x.feedUrl, guid: x.guid ?? null, why: x.why ?? null })));
}
