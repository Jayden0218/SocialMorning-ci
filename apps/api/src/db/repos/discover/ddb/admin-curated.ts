// Curated issues and collections on DynamoDB: one document item each, saved with a version condition.
/**
 * M26 lane DV (DV-75…DV-83). `CUR#issues / <id>` (type `curatedIssue`: day, title, intro, `items` in order, version,
 * retiredAt) and `CUR#collections / <id>` (type `curatedCollection`: title, subtitle, position, `items`, version,
 * retiredAt). The old delete-then-insert of child rows (up to ≈ 62 statements) is one Put of the document conditioned
 * on the version the editor loaded — the old `FOR UPDATE` + compare; inside adminWrite it joins the admin record's
 * transaction (lane SF's `commitOrDefer`), so a racing save is 409 `changed`.
 */
import type { IssueIn } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { MAX_COLLECTIONS, type CollectionIn } from '../../../../catalog/collections.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import type { CollectionRow, IssueRow } from '../../admin/admin-curated.ts';
import { nowIso, partitionItems } from './common.ts';

const versionGuard = (current: number, sent: number) => {
  if (current !== sent) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
};
const cond = (cur: Item | undefined, label: string) => (cur
  ? { condition: '#v = :cur', names: { '#v': 'version' }, values: { ':cur': Number(cur['version']) }, label }
  : { condition: 'attribute_not_exists(PK)', label });
const raced = (current: number) => () => new ApiError('changed', 'Changed elsewhere — reload.', { version: current + 1 });

type IssueItem = { feedUrl: string; guid?: string; note: string };
type ColItem = { feedUrl: string; guid?: string; why?: string };

const toIssue = (r: Item): IssueRow => ({
  id: String(r['id']), day: String(r['day']), title: String(r['title']), intro: String(r['intro']), version: Number(r['version']), retired: Boolean(r['retiredAt']),
  items: ((r['items'] as IssueItem[] | undefined) ?? []).map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), note: x.note })),
});

export async function listIssueRows(store: Store, _db: Db): Promise<IssueRow[]> {
  return (await partitionItems(store, 'CUR#issues')).map(toIssue)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function issueItem(store: Store, id: string, issue: IssueIn, version: number, retiredAt: string | null): Item {
  return encode('curatedIssue', K.curatedIssue(id), {
    id, day: issue.date, title: issue.title, intro: issue.intro, version, retiredAt, updatedAt: nowIso(store),
    items: issue.items.map((it) => ({ feedUrl: it.feedUrl, ...(it.guid ? { guid: it.guid } : {}), note: it.note })),
  });
}

export async function putIssue(store: Store, _db: Db, id: string, version: number, issue: IssueIn): Promise<number> {
  const cur = await get(store, 'main', K.curatedIssue(id));
  const current = cur ? Number(cur['version']) : 0;
  versionGuard(current, version);
  await commitOrDefer(store, tx(store).put('main', issueItem(store, id, issue, current + 1, null), cond(cur, 'issue')), { issue: raced(current) });
  return current + 1;
}

/** Retire. An issue that lives only in the file gets a retired document (`file` is its content), so it stays hidden. */
export async function retireIssue(store: Store, _db: Db, id: string, version: number, file: IssueIn | undefined): Promise<number> {
  const cur = await get(store, 'main', K.curatedIssue(id));
  const current = cur ? Number(cur['version']) : 0;
  versionGuard(current, version);
  if (!cur) {
    if (!file) throw new ApiError('not_found', 'No such issue.');
    // The SQL wrote the file's issue (version 1), then retired it (version 2) in one transaction: one Put here.
    await commitOrDefer(store, tx(store).put('main', issueItem(store, id, file, 2, nowIso(store)), cond(undefined, 'issue')), { issue: raced(current) });
    return 2;
  }
  await commitOrDefer(store, tx(store).update('main', K.curatedIssue(id), {
    update: 'SET #r = :at, #v = :next, #u = :at', condition: '#v = :cur', names: { '#r': 'retiredAt', '#v': 'version', '#u': 'updatedAt' },
    values: { ':at': nowIso(store), ':next': current + 1, ':cur': current }, label: 'issue',
  }), { issue: raced(current) });
  return current + 1;
}

const toCollection = (r: Item): CollectionRow => ({
  id: String(r['id']), title: String(r['title']), ...(r['subtitle'] ? { subtitle: String(r['subtitle']) } : {}), position: Number(r['position']),
  version: Number(r['version']), retired: Boolean(r['retiredAt']),
  items: ((r['items'] as ColItem[] | undefined) ?? []).map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), ...(x.why ? { why: x.why } : {}) })),
});

export async function listCollectionRows(store: Store, _db: Db): Promise<CollectionRow[]> {
  return (await partitionItems(store, 'CUR#collections')).map(toCollection)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function putCollection(store: Store, _db: Db, id: string, version: number, col: CollectionIn, position: number): Promise<number> {
  const cur = await get(store, 'main', K.curatedCollection(id));
  const current = cur ? Number(cur['version']) : 0;
  versionGuard(current, version);
  const live = (await partitionItems(store, 'CUR#collections')).filter((r) => !r['retiredAt'] && r['id'] !== id).length;
  if (live >= MAX_COLLECTIONS) throw new ApiError('validation', `At most ${MAX_COLLECTIONS} live collections — retire one first.`, { fields: ['id'] });
  const item = encode('curatedCollection', K.curatedCollection(id), {
    id, title: col.title, subtitle: col.subtitle ?? null, position, version: current + 1, retiredAt: null, updatedAt: nowIso(store),
    items: col.items.map((it) => ({ feedUrl: it.feedUrl, ...(it.guid ? { guid: it.guid } : {}), ...(it.why ? { why: it.why } : {}) })),
  });
  await commitOrDefer(store, tx(store).put('main', item, cond(cur, 'collection')), { collection: raced(current) });
  return current + 1;
}

export async function retireCollection(store: Store, _db: Db, id: string, version: number, file: CollectionIn | undefined): Promise<number> {
  const cur = await get(store, 'main', K.curatedCollection(id));
  const current = cur ? Number(cur['version']) : 0;
  versionGuard(current, version);
  if (!cur) {
    if (!file) throw new ApiError('not_found', 'No such collection.');
    // A file-only collection gets a retired document (no items, as the SQL's row), so the file's copy stays hidden.
    await commitOrDefer(store, tx(store).put('main', encode('curatedCollection', K.curatedCollection(id), {
      id, title: file.title, subtitle: file.subtitle ?? null, position: 0, version: 1, retiredAt: nowIso(store), updatedAt: nowIso(store), items: [],
    }), cond(undefined, 'collection')), { collection: raced(current) });
    return 1;
  }
  await commitOrDefer(store, tx(store).update('main', K.curatedCollection(id), {
    update: 'SET #r = :at, #v = :next, #u = :at', condition: '#v = :cur', names: { '#r': 'retiredAt', '#v': 'version', '#u': 'updatedAt' },
    values: { ':at': nowIso(store), ':next': current + 1, ':cur': current }, label: 'collection',
  }), { collection: raced(current) });
  return current + 1;
}
