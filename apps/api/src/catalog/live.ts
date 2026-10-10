// Merges picks, issues and collections from the database over the built-in files.
/**
 * M15 T013 — picks, issues and collections: the DATABASE first, the files second
 * (specs/015-m15-admin/research.md R3, FR-008, FR-009).
 *
 *  - a pick DAY in `pick_days` replaces the file's picks for that day; every other day is the file's;
 *  - an issue or collection ID in the tables replaces the file's (a retired one hides it);
 *  - `picksForDay` then does what it always did: today's, else the latest earlier day — so a day
 *    with no rows is never empty while any earlier day exists (guard G-P2).
 *
 * The rows are read through a 60 s in-process memo per database, dropped by every admin save
 * (`dropCatalogMemo`). If the tables cannot be read, the files serve alone (Principle IV).
 */
import type { IssueIn, PickIn } from '@socialmorning/social-core';
import type { Catalog } from '../auth/session.ts';
import type { Db } from '../db/db.ts';
import { MAX_COLLECTIONS, type CollectionIn } from './collections.ts';

export const CATALOG_MEMO_MS = 60_000;

export type DbCatalog = {
  pickDays: Set<string>;
  picks: PickIn[];
  issues: Map<string, IssueIn | null>;
  collections: { id: string; live: CollectionIn | null; position: number }[];
};

const memo = new WeakMap<Db, { at: number; rows: DbCatalog }>();

export function dropCatalogMemo(db: Db): void {
  memo.delete(db);
}

const ymd = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export async function readDbCatalog(db: Db): Promise<DbCatalog> {
  const [days, picks, issues, issueItems, cols, colItems] = await Promise.all([
    db.query<{ day: Date | string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM pick_days"),
    db.query<{ day: Date | string; position: number; feed_url: string; guid: string | null; why: string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, position, feed_url, guid, why FROM pick_items ORDER BY day, position"),
    db.query<{ id: string; day: Date | string; title: string; intro: string; retired_at: string | null }>("SELECT id, to_char(day, 'YYYY-MM-DD') AS day, title, intro, retired_at FROM curated_issues"),
    db.query<{ issue_id: string; position: number; feed_url: string; guid: string | null; note: string }>('SELECT issue_id, position, feed_url, guid, note FROM curated_issue_items ORDER BY issue_id, position'),
    db.query<{ id: string; title: string; subtitle: string | null; position: number; retired_at: string | null }>('SELECT id, title, subtitle, position, retired_at FROM collections ORDER BY position, id'),
    db.query<{ collection_id: string; position: number; feed_url: string; guid: string | null; why: string | null }>('SELECT collection_id, position, feed_url, guid, why FROM collection_items ORDER BY collection_id, position'),
  ]);
  const issueMap = new Map<string, IssueIn | null>();
  for (const i of issues) {
    issueMap.set(i.id, i.retired_at !== null ? null : {
      id: i.id, date: ymd(i.day), title: i.title, intro: i.intro,
      items: issueItems.filter((x) => x.issue_id === i.id).map((x) => ({ order: Number(x.position), feedUrl: x.feed_url, ...(x.guid ? { guid: x.guid } : {}), note: x.note })),
    });
  }
  return {
    pickDays: new Set(days.map((d) => ymd(d.day))),
    picks: picks.map((p) => ({ date: ymd(p.day), feedUrl: p.feed_url, ...(p.guid ? { guid: p.guid } : {}), why: p.why, order: Number(p.position) })),
    issues: issueMap,
    collections: cols.map((c) => ({
      id: c.id, position: Number(c.position),
      live: c.retired_at !== null ? null : {
        id: c.id, title: c.title, ...(c.subtitle ? { subtitle: c.subtitle } : {}),
        items: colItems.filter((x) => x.collection_id === c.id).map((x) => ({ feedUrl: x.feed_url, ...(x.guid ? { guid: x.guid } : {}), ...(x.why ? { why: x.why } : {}) })),
      },
    })),
  };
}

/** The files' catalogue with the tables laid over it. Pure. */
export function mergeCatalog(file: Catalog, rows: DbCatalog): Catalog {
  const picks = [...file.picks.filter((p) => !rows.pickDays.has(p.date)), ...rows.picks];
  const issues = [
    ...file.issues.filter((i) => !rows.issues.has(i.id)),
    ...[...rows.issues.values()].filter((i): i is IssueIn => i !== null),
  ];
  const dbCols = rows.collections.filter((c) => c.live !== null && c.live.items.length > 0).map((c) => c.live!);
  const taken = new Set(rows.collections.map((c) => c.id));
  const collections = [...dbCols, ...file.collections.filter((c) => !taken.has(c.id))].slice(0, MAX_COLLECTIONS);
  return { ...file, picks, issues, collections };
}

export async function liveCatalog(db: Db, file: Catalog, now: () => number = Date.now): Promise<Catalog> {
  const hit = memo.get(db);
  if (hit && now() - hit.at < CATALOG_MEMO_MS) return mergeCatalog(file, hit.rows);
  try {
    const rows = await readDbCatalog(db);
    memo.set(db, { at: now(), rows });
    return mergeCatalog(file, rows);
  } catch (e) {
    console.warn(`[catalog] the admin tables could not be read; the files serve: ${e instanceof Error ? e.message : String(e)}`);
    return file;
  }
}
