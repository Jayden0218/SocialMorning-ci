// Curated issues and collections stored in the database, with save and retire.
/**
 * M15 T012 — curated issues and collections in the database (FR-010). Same rules as the files
 * (`validateIssues`, `validateCollections`), same version check as picks (FR-012, G-P3).
 * "Retire" keeps the row with `retired_at`, so an id that also lives in a file stays hidden.
 */
import { validateIssues, type IssueIn } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { ApiError } from '../../../errors.ts';
import { MAX_COLLECTIONS, validateCollections, type CollectionIn } from '../../../catalog/collections.ts';

export type IssueInput = { day: string; title: string; intro: string; items: { feedUrl: string; guid?: string; note: string }[] };
export type IssueRow = { id: string; day: string; title: string; intro: string; items: { feedUrl: string; guid?: string; note: string }[]; version: number; retired: boolean };
export type CollectionInput = { title: string; subtitle?: string; position: number; items: { feedUrl: string; guid?: string; why?: string }[] };
export type CollectionRow = CollectionInput & { id: string; version: number; retired: boolean };

const ISSUE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const COLLECTION_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function checkIssue(id: string, b: IssueInput): IssueIn {
  if (!ISSUE_ID.test(id)) throw new ApiError('validation', 'The id must be 1–64 lower-case letters, digits or dashes.', { fields: ['id'] });
  const { issues, warnings } = validateIssues({ issues: [{ id, date: b.day, title: b.title, intro: b.intro, items: b.items.map((x, i) => ({ order: i + 1, ...x })) }] });
  if (warnings.length > 0 || issues.length !== 1) throw new ApiError('validation', warnings.join('; ') || 'Check the issue.', { fields: ['items'] });
  return issues[0]!;
}

export function checkCollection(id: string, b: CollectionInput): CollectionIn {
  if (!COLLECTION_ID.test(id)) throw new ApiError('validation', 'The id must be 1–40 lower-case letters, digits or dashes.', { fields: ['id'] });
  const { collections, warnings } = validateCollections([{ id, title: b.title, ...(b.subtitle ? { subtitle: b.subtitle } : {}), items: b.items }]);
  if (warnings.length > 0 || collections.length !== 1) throw new ApiError('validation', warnings.join('; ') || 'Check the collection.', { fields: ['items'] });
  return collections[0]!;
}

const versionGuard = (current: number, sent: number) => {
  if (current !== sent) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
};

// ---- Issues ----

async function listIssueRowsPg(db: Db): Promise<IssueRow[]> {
  const rows = await db.query<{ id: string; day: string; title: string; intro: string; version: number; retired_at: string | null }>(
    "SELECT id, to_char(day, 'YYYY-MM-DD') AS day, title, intro, version, retired_at FROM curated_issues ORDER BY day DESC, id");
  const items = await db.query<{ issue_id: string; feed_url: string; guid: string | null; note: string }>(
    'SELECT issue_id, feed_url, guid, note FROM curated_issue_items ORDER BY issue_id, position');
  return rows.map((r) => ({
    id: r.id, day: r.day, title: r.title, intro: r.intro, version: Number(r.version), retired: r.retired_at !== null,
    items: items.filter((x) => x.issue_id === r.id).map((x) => ({ feedUrl: x.feed_url, ...(x.guid ? { guid: x.guid } : {}), note: x.note })),
  }));
}

export async function getIssueRow(db: Db, id: string): Promise<IssueRow | undefined> {
  return (await listIssueRows(db)).find((r) => r.id === id);
}

async function putIssuePg(tx: Db, id: string, version: number, issue: IssueIn): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM curated_issues WHERE id = $1 FOR UPDATE', [id]);
  const current = cur ? Number(cur.version) : 0;
  versionGuard(current, version);
  const next = current + 1;
  await tx.query(
    `INSERT INTO curated_issues (id, day, title, intro, retired_at, version, updated_at) VALUES ($1, $2::date, $3, $4, NULL, $5, now())
     ON CONFLICT (id) DO UPDATE SET day = EXCLUDED.day, title = EXCLUDED.title, intro = EXCLUDED.intro, retired_at = NULL, version = EXCLUDED.version, updated_at = now()`,
    [id, issue.date, issue.title, issue.intro, next],
  );
  await tx.query('DELETE FROM curated_issue_items WHERE issue_id = $1', [id]);
  for (const [i, it] of issue.items.entries()) {
    await tx.query('INSERT INTO curated_issue_items (issue_id, position, feed_url, guid, note) VALUES ($1, $2, $3, $4, $5)', [id, i + 1, it.feedUrl, it.guid ?? null, it.note]);
  }
  return next;
}

/** Retire. An issue that lives only in the file gets a retired row (`file` is its content), so it stays hidden. */
async function retireIssuePg(tx: Db, id: string, version: number, file: IssueIn | undefined): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM curated_issues WHERE id = $1 FOR UPDATE', [id]);
  const current = cur ? Number(cur.version) : 0;
  versionGuard(current, version);
  if (!cur) {
    if (!file) throw new ApiError('not_found', 'No such issue.');
    await putIssuePg(tx, id, 0, file);
  }
  await tx.query('UPDATE curated_issues SET retired_at = now(), version = $2, updated_at = now() WHERE id = $1', [id, current + (cur ? 1 : 2)]);
  return current + (cur ? 1 : 2);
}

// ---- Collections ----

async function listCollectionRowsPg(db: Db): Promise<CollectionRow[]> {
  const rows = await db.query<{ id: string; title: string; subtitle: string | null; position: number; version: number; retired_at: string | null }>(
    'SELECT id, title, subtitle, position, version, retired_at FROM collections ORDER BY position, id');
  const items = await db.query<{ collection_id: string; feed_url: string; guid: string | null; why: string | null }>(
    'SELECT collection_id, feed_url, guid, why FROM collection_items ORDER BY collection_id, position');
  return rows.map((r) => ({
    id: r.id, title: r.title, ...(r.subtitle ? { subtitle: r.subtitle } : {}), position: Number(r.position), version: Number(r.version), retired: r.retired_at !== null,
    items: items.filter((x) => x.collection_id === r.id).map((x) => ({ feedUrl: x.feed_url, ...(x.guid ? { guid: x.guid } : {}), ...(x.why ? { why: x.why } : {}) })),
  }));
}

async function putCollectionPg(tx: Db, id: string, version: number, col: CollectionIn, position: number): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM collections WHERE id = $1 FOR UPDATE', [id]);
  const current = cur ? Number(cur.version) : 0;
  versionGuard(current, version);
  const [live] = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM collections WHERE retired_at IS NULL AND id <> $1', [id]);
  if (Number(live?.n ?? 0) >= MAX_COLLECTIONS) throw new ApiError('validation', `At most ${MAX_COLLECTIONS} live collections — retire one first.`, { fields: ['id'] });
  const next = current + 1;
  await tx.query(
    `INSERT INTO collections (id, title, subtitle, position, retired_at, version, updated_at) VALUES ($1, $2, $3, $4, NULL, $5, now())
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, position = EXCLUDED.position, retired_at = NULL, version = EXCLUDED.version, updated_at = now()`,
    [id, col.title, col.subtitle ?? null, position, next],
  );
  await tx.query('DELETE FROM collection_items WHERE collection_id = $1', [id]);
  for (const [i, it] of col.items.entries()) {
    await tx.query('INSERT INTO collection_items (collection_id, position, feed_url, guid, why) VALUES ($1, $2, $3, $4, $5)', [id, i + 1, it.feedUrl, it.guid ?? null, it.why ?? null]);
  }
  return next;
}

async function retireCollectionPg(tx: Db, id: string, version: number, file: CollectionIn | undefined): Promise<number> {
  const [cur] = await tx.query<{ version: number }>('SELECT version FROM collections WHERE id = $1 FOR UPDATE', [id]);
  const current = cur ? Number(cur.version) : 0;
  versionGuard(current, version);
  if (!cur) {
    if (!file) throw new ApiError('not_found', 'No such collection.');
    // A file-only collection gets a retired row, so the file's copy stays hidden.
    await tx.query('INSERT INTO collections (id, title, subtitle, position, retired_at, version) VALUES ($1, $2, $3, 0, now(), 1)', [id, file.title, file.subtitle ?? null]);
    return 1;
  }
  await tx.query('UPDATE collections SET retired_at = now(), version = version + 1, updated_at = now() WHERE id = $1', [id]);
  return current + 1;
}

// M26 lane DV: each runs on Postgres, or on DynamoDB (discover/ddb/admin-curated.ts) when the Db carries a Store (db/backend.ts).
export const listIssueRows = dual('dv/admin-curated', 'listIssueRows', listIssueRowsPg);
export const putIssue = dual('dv/admin-curated', 'putIssue', putIssuePg);
export const retireIssue = dual('dv/admin-curated', 'retireIssue', retireIssuePg);
export const listCollectionRows = dual('dv/admin-curated', 'listCollectionRows', listCollectionRowsPg);
export const putCollection = dual('dv/admin-curated', 'putCollection', putCollectionPg);
export const retireCollection = dual('dv/admin-curated', 'retireCollection', retireCollectionPg);
