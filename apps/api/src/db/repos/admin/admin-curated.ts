// Curated issues and collections stored in the database, with save and retire.
/**
 * M15 T012 — curated issues and collections in the database (FR-010). Same rules as the files
 * (`validateIssues`, `validateCollections`), same version check as picks (FR-012, G-P3).
 * "Retire" keeps the row with `retired_at`, so an id that also lives in a file stays hidden.
 */
import { validateIssues, type IssueIn } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { ApiError } from '../../../errors.ts';
import { validateCollections, type CollectionIn } from '../../../catalog/collections.ts';

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

export async function getIssueRow(db: Db, id: string): Promise<IssueRow | undefined> {
  return (await listIssueRows(db)).find((r) => r.id === id);
}

// DynamoDB bodies: discover/ddb/admin-curated.ts (db/backend.ts).
export const listIssueRows = viaStore<typeof import('../discover/ddb/admin-curated.ts').listIssueRows>('dv/admin-curated', 'listIssueRows');
export const putIssue = viaStore<typeof import('../discover/ddb/admin-curated.ts').putIssue>('dv/admin-curated', 'putIssue');
export const retireIssue = viaStore<typeof import('../discover/ddb/admin-curated.ts').retireIssue>('dv/admin-curated', 'retireIssue');
export const listCollectionRows = viaStore<typeof import('../discover/ddb/admin-curated.ts').listCollectionRows>('dv/admin-curated', 'listCollectionRows');
export const putCollection = viaStore<typeof import('../discover/ddb/admin-curated.ts').putCollection>('dv/admin-curated', 'putCollection');
export const retireCollection = viaStore<typeof import('../discover/ddb/admin-curated.ts').retireCollection>('dv/admin-curated', 'retireCollection');
