// Academy and Help pages on DynamoDB: one partition per kind, saved and deleted with a version condition.
/**
 * M26 lane SF (data-model.md "Lane SF changes"). `K.contentPage(kind, slug)` = `CONTENT#<kind>` / `<slug>`,
 * type `contentPage`. A list is one strongly consistent Query of the kind's partition (≤ a few dozen pages),
 * filtered to published unless `all`, ordered by position then slug in code (the SQL's ORDER BY).
 * A save or delete reads the item strongly, checks in code (404 / 409 as on Postgres), then writes ONE Tx
 * with the version as a condition (label `content`) through `commitOrDefer` (joins the audit transaction).
 */
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item } from '../../../ddb/store.ts';
import { versionGuard, type ContentInput, type ContentKind, type ContentPage } from '../../config/content.ts';
import { commitOrDefer } from './admin-scope.ts';
import { nowIso, partition, txa, type Db, type Store } from './common.ts';

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export const toPage = (i: Item): ContentPage => ({
  kind: String(i['kind']) as ContentKind, slug: String(i['slug']), title: String(i['title']), summary: str(i['summary']), tag: str(i['tag']),
  body: String(i['body']), position: Number(i['position']), published: Boolean(i['published']), version: Number(i['version']),
  updatedAt: new Date(String(i['updatedAt'])).toISOString(),
});

const changed = (current: number) => () => new ApiError('changed', 'Changed elsewhere — reload.', { version: current });

export async function listPages(store: Store, _db: Db, kind: ContentKind, opts: { all: boolean }): Promise<ContentPage[]> {
  const items = await partition(store, 'main', K.contentPage(kind, 'x').PK);
  return items.map(toPage)
    .filter((p) => opts.all || p.published)
    .sort((a, b) => a.position - b.position || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

export async function getPage(store: Store, _db: Db, kind: ContentKind, slug: string): Promise<ContentPage | null> {
  const i = await get(store, 'main', K.contentPage(kind, slug));
  return i ? toPage(i) : null;
}

/** The page item, as the Tx puts it (also used by the copy of the seeded rows, content-seed.ts). */
export const pageItem = (kind: ContentKind, slug: string, p: ContentInput, version: number, updatedAt: string): Item =>
  encode('contentPage', K.contentPage(kind, slug), {
    kind, slug, title: p.title, summary: p.summary, tag: p.tag, body: p.body, position: p.position, published: p.published, version, updatedAt,
  });

export async function putPage(store: Store, _db: Db, kind: ContentKind, slug: string, version: number, p: ContentInput): Promise<number> {
  const cur = await get(store, 'main', K.contentPage(kind, slug));
  const current = cur ? Number(cur['version']) : 0;
  versionGuard(current, version);
  const next = current + 1;
  const cond = current === 0 ? { condition: 'attribute_not_exists(PK)' } : { condition: 'version = :cur', values: { ':cur': current } };
  const t = txa(store).put('main', pageItem(kind, slug, p, next, nowIso(store)), { ...cond, label: 'content' });
  await commitOrDefer(store, t.raw, { content: changed(current) });
  return next;
}

export async function deletePage(store: Store, _db: Db, kind: ContentKind, slug: string, version: number): Promise<void> {
  const cur = await get(store, 'main', K.contentPage(kind, slug));
  if (!cur) throw new ApiError('not_found', 'No such page.');
  const current = Number(cur['version']);
  versionGuard(current, version);
  const t = txa(store).delete('main', K.contentPage(kind, slug), { condition: 'version = :cur', values: { ':cur': current }, label: 'content' });
  await commitOrDefer(store, t.raw, { content: changed(current) });
}
