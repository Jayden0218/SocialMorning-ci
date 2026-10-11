// Reads the admin catalogue tables: pick days and items, curated issues and their items, collections and their items.
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

async function listPickDaysPg(db: Db): Promise<{ day: Date | string }[]> {
  return db.query<{ day: Date | string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM pick_days");
}

async function listPickItemsPg(db: Db): Promise<{ day: Date | string; position: number; feed_url: string; guid: string | null; why: string }[]> {
  return db.query<{ day: Date | string; position: number; feed_url: string; guid: string | null; why: string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, position, feed_url, guid, why FROM pick_items ORDER BY day, position");
}

async function listCuratedIssuesPg(db: Db): Promise<{ id: string; day: Date | string; title: string; intro: string; retired_at: string | null }[]> {
  return db.query<{ id: string; day: Date | string; title: string; intro: string; retired_at: string | null }>("SELECT id, to_char(day, 'YYYY-MM-DD') AS day, title, intro, retired_at FROM curated_issues");
}

async function listCuratedIssueItemsPg(db: Db): Promise<{ issue_id: string; position: number; feed_url: string; guid: string | null; note: string }[]> {
  return db.query<{ issue_id: string; position: number; feed_url: string; guid: string | null; note: string }>('SELECT issue_id, position, feed_url, guid, note FROM curated_issue_items ORDER BY issue_id, position');
}

async function listCollectionRowsPg(db: Db): Promise<{ id: string; title: string; subtitle: string | null; position: number; retired_at: string | null }[]> {
  return db.query<{ id: string; title: string; subtitle: string | null; position: number; retired_at: string | null }>('SELECT id, title, subtitle, position, retired_at FROM collections ORDER BY position, id');
}

async function listCollectionItemRowsPg(db: Db): Promise<{ collection_id: string; position: number; feed_url: string; guid: string | null; why: string | null }[]> {
  return db.query<{ collection_id: string; position: number; feed_url: string; guid: string | null; why: string | null }>('SELECT collection_id, position, feed_url, guid, why FROM collection_items ORDER BY collection_id, position');
}

// M26 lane DV: lane DV's tables (picks, issues, collections) — on DynamoDB read from their documents (discover/ddb/catalog.ts).
export const listPickDays = dual('dv/catalog', 'listPickDays', listPickDaysPg);
export const listPickItems = dual('dv/catalog', 'listPickItems', listPickItemsPg);
export const listCuratedIssues = dual('dv/catalog', 'listCuratedIssues', listCuratedIssuesPg);
export const listCuratedIssueItems = dual('dv/catalog', 'listCuratedIssueItems', listCuratedIssueItemsPg);
export const listCollectionRows = dual('dv/catalog', 'listCollectionRows', listCollectionRowsPg);
export const listCollectionItemRows = dual('dv/catalog', 'listCollectionItemRows', listCollectionItemRowsPg);
