// The owner's pins and hides on DynamoDB: one document item per list, written with a version condition.
/**
 * M26 lane DV, DV-T05 (patterns DV-45…DV-54), data-model.md "Lane DV changes".
 *
 * `LIST#<listId> / V` (type `listDoc`): `rows` = every pin and hide of the list (≤ 200 — MAX_OVERRIDES_PER_LIST),
 * `v` = version, `defaultTab` = the category page's default chip (was `list_settings`). Row ids stay numbers
 * (`SEQ#list_overrides`, data-model.md §2) because Admin addresses a row by id (`DELETE …/:id`).
 *
 * A write reads the document (strongly), changes its rows in code — the SQL's "delete the same item, insert the
 * new row" — and writes `rows` back with `v = :seen`. A save that raced another save fails that condition: inside
 * adminWrite the change and its audit record are one transaction (lane SF's `commitOrDefer`), so the loser gets
 * 409 `changed` and nothing of it is kept (guard G-M26-DV1). `defaultTab` is its own attribute (SET without the
 * version), so a chip change never clobbers rows or the other way round.
 *
 * Reads: `activeFor` = one BatchGet for the lists of a page; live rows by the store clock (the SQL's `now()`).
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { tx, type Tx } from '../../../ddb/tx.ts';
import { readEntry } from '../../library/ddb/cache.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import { MAX_OVERRIDES_PER_LIST, pinOrder, tooManyRows, type Active, type DefaultTab, type Override, type OverrideRow, type ShowSources } from '../lists.ts';
import { nowIso, pgOf } from './common.ts';

/** One stored row (camelCase; `id` a number). */
export type DocRow = OverrideRow & { id: number; createdAt: string; createdBy: string | null };
export type ListDocState = { rows: DocRow[]; v: number; exists: boolean };

export const changed = () => new ApiError('changed', 'Changed elsewhere — reload.');

export async function readDoc(store: Store, listId: string): Promise<ListDocState> {
  const it = await get(store, 'main', K.listDoc(listId));
  return { rows: ((it?.['rows'] as DocRow[] | undefined) ?? []).map(normRow), v: Number(it?.['v'] ?? 0), exists: it !== undefined };
}

const normRow = (r: DocRow): DocRow => ({
  id: Number(r.id), kind: r.kind, feedUrl: r.feedUrl ?? null, guid: r.guid ?? null, commentId: r.commentId ?? null, position: r.position ?? null,
  startsAt: r.startsAt ?? null, endsAt: r.endsAt ?? null, note: r.note ?? null, createdAt: String(r.createdAt), createdBy: r.createdBy ?? null,
});

const isLive = (r: DocRow, nowIsoStr: string) => (r.startsAt === null || r.startsAt <= nowIsoStr) && (r.endsAt === null || r.endsAt > nowIsoStr);

export function toOverride(listId: string, r: DocRow, nowIsoStr: string): Override {
  return {
    id: String(r.id), listId, kind: r.kind,
    ...(r.feedUrl !== null ? { feedUrl: r.feedUrl } : {}), ...(r.guid !== null ? { guid: r.guid } : {}), ...(r.commentId !== null ? { commentId: r.commentId } : {}),
    position: r.position, startsAt: r.startsAt, endsAt: r.endsAt, note: r.note, createdAt: r.createdAt, live: isLive(r, nowIsoStr),
  };
}

/** The SQL's `ORDER BY kind DESC, position NULLS LAST, created_at, id`. */
const adminOrder = (a: Override, b: Override) =>
  (a.kind === b.kind ? 0 : a.kind === 'pin' ? -1 : 1)
  || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
  || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
  || Number(a.id) - Number(b.id);

/** Writes `rows` back: one UpdateItem conditioned on the version read (or on no document yet). */
export function docWrite(t: Tx, store: Store, listId: string, seen: ListDocState, rows: readonly DocRow[]): Tx {
  return t.update('main', K.listDoc(listId), {
    update: 'SET #t = :t, #l = :l, #r = :r, #v = :nv, #u = :u',
    condition: seen.exists ? '#v = :seen' : 'attribute_not_exists(#v)',
    names: { '#t': 't', '#l': 'listId', '#r': 'rows', '#v': 'v', '#u': 'updatedAt' },
    values: { ':t': 'listDoc', ':l': listId, ':r': rows.map((r) => ({ ...r })), ':nv': seen.v + 1, ':u': nowIso(store), ...(seen.exists ? { ':seen': seen.v } : {}) },
    label: `list:${listId}`,
  });
}

const sameItem = (a: { feedUrl: string | null; guid: string | null; commentId: string | null }, b: { feedUrl: string | null; guid: string | null; commentId: string | null }) =>
  (a.feedUrl ?? '') === (b.feedUrl ?? '') && (a.guid ?? '') === (b.guid ?? '') && (a.commentId ?? '') === (b.commentId ?? '');

export async function listOverrides(store: Store, _db: Db, listId: string): Promise<Override[]> {
  const now = nowIso(store);
  return (await readDoc(store, listId)).rows.map((r) => toOverride(listId, r, now)).sort(adminOrder);
}

export async function activeFor(store: Store, _db: Db, listIds: readonly string[]): Promise<Map<string, Active>> {
  const out = new Map<string, Active>();
  for (const id of listIds) out.set(id, { pins: [], hides: [] });
  if (listIds.length === 0) return out;
  const now = nowIso(store);
  const docs = await batchGetAll(store, 'main', [...new Set(listIds)].map((id) => K.listDoc(id)));
  for (const d of docs) {
    const listId = String(d['listId']);
    const a = out.get(listId);
    if (!a) continue;
    for (const raw of (d['rows'] as DocRow[] | undefined) ?? []) {
      const r = normRow(raw);
      if (!isLive(r, now)) continue;
      const o = toOverride(listId, r, now);
      (o.kind === 'pin' ? a.pins : a.hides).push(o);
    }
  }
  for (const a of out.values()) a.pins.sort(pinOrder);
  return out;
}

export async function storeOverride(store: Store, _db: Db, listId: string, r: OverrideRow, by: string): Promise<Override> {
  const seen = await readDoc(store, listId);
  if (seen.rows.length >= MAX_OVERRIDES_PER_LIST) throw tooManyRows();
  const row: DocRow = { ...r, id: await nextSeq(store, 'list_overrides'), createdAt: nowIso(store), createdBy: by };
  const rows = [...seen.rows.filter((x) => !sameItem(x, r)), row];
  await commitOrDefer(store, docWrite(tx(store), store, listId, seen, rows), { [`list:${listId}`]: changed });
  return toOverride(listId, row, nowIso(store));
}

export async function deleteOverrideRow(store: Store, _db: Db, listId: string, id: string): Promise<boolean> {
  const seen = await readDoc(store, listId);
  if (!seen.rows.some((r) => String(r.id) === id)) return false;
  await commitOrDefer(store, docWrite(tx(store), store, listId, seen, seen.rows.filter((r) => String(r.id) !== id)), { [`list:${listId}`]: changed });
  return true;
}

/** The rows after the M15 replace: every row of `kind` out, then each item's row (any kind) replaced by a new one. */
export async function replacedRows(store: Store, rows: readonly DocRow[], kind: 'pin' | 'hide', items: readonly { feedUrl: string; guid?: string }[], by: string | null): Promise<DocRow[]> {
  let out = rows.filter((r) => r.kind !== kind);
  if (items.length === 0) return out;
  const first = await nextSeq(store, 'list_overrides', items.length);
  const at = nowIso(store);
  for (const [i, it] of items.entries()) {
    const ref = { feedUrl: it.feedUrl, guid: it.guid ?? null, commentId: null };
    out = out.filter((r) => !(r.feedUrl === it.feedUrl && (r.guid ?? '') === (it.guid ?? '')));
    out.push({ ...ref, kind, position: kind === 'pin' ? i + 1 : null, startsAt: null, endsAt: null, note: null, id: first + i, createdAt: at, createdBy: by });
  }
  return out;
}

export async function replaceKind(store: Store, _db: Db, listId: string, kind: 'pin' | 'hide', items: readonly { feedUrl: string; guid?: string }[], by: string | null): Promise<void> {
  const seen = await readDoc(store, listId);
  const rows = await replacedRows(store, seen.rows, kind, items, by);
  await commitOrDefer(store, docWrite(tx(store), store, listId, seen, rows), { [`list:${listId}`]: changed });
}

export async function defaultTab(store: Store, _db: Db, listId: string): Promise<DefaultTab | undefined> {
  const it = await get(store, 'main', K.listDoc(listId));
  return (it?.['defaultTab'] as DefaultTab | null | undefined) ?? undefined;
}

export async function setDefaultTab(store: Store, _db: Db, listId: string, tab: DefaultTab | null): Promise<void> {
  const t = tx(store).update('main', K.listDoc(listId), tab === null
    ? { update: 'SET #t = :t, #l = :l, #u = :u REMOVE #d', names: { '#t': 't', '#l': 'listId', '#u': 'updatedAt', '#d': 'defaultTab' }, values: { ':t': 'listDoc', ':l': listId, ':u': nowIso(store) } }
    : { update: 'SET #t = :t, #l = :l, #u = :u, #d = :d', names: { '#t': 't', '#l': 'listId', '#u': 'updatedAt', '#d': 'defaultTab' }, values: { ':t': 'listDoc', ':l': listId, ':u': nowIso(store), ':d': tab } });
  await commitOrDefer(store, t);
}

/** The parsed feed lane LB cached (`feed:<url>`), and a live Studio show (lane ST's `hosted_shows`, still read in Postgres — listed for CUT). */
export async function showSources(store: Store, db: Db, feedUrl: string): Promise<ShowSources> {
  const out: ShowSources = {};
  const row = await readEntry<{ show?: { title?: string; author?: string; imageUrl?: string } }>(store, `feed:${feedUrl}`);
  if (row?.body && typeof row.body === 'object' && row.body.show) out.feed = row.body.show;
  const [hs] = await pgOf(db).query<{ title: string; author: string; cover_url: string | null }>('SELECT title, author, cover_url FROM hosted_shows WHERE feed_url = $1 AND deleted_at IS NULL', [feedUrl]);
  if (hs) out.hosted = hs;
  return out;
}
