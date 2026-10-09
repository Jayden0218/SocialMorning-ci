// Reads the admin catalogue tables: pick days and items, curated issues and their items, collections and their items.
import type { Db } from '../../db.ts';

export async function listPickDays(db: Db): Promise<{ day: Date | string }[]> {
  return db.query<{ day: Date | string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM pick_days");
}

export async function listPickItems(db: Db): Promise<{ day: Date | string; position: number; feed_url: string; guid: string | null; why: string }[]> {
  return db.query<{ day: Date | string; position: number; feed_url: string; guid: string | null; why: string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, position, feed_url, guid, why FROM pick_items ORDER BY day, position");
}

export async function listCuratedIssues(db: Db): Promise<{ id: string; day: Date | string; title: string; intro: string; retired_at: string | null }[]> {
  return db.query<{ id: string; day: Date | string; title: string; intro: string; retired_at: string | null }>("SELECT id, to_char(day, 'YYYY-MM-DD') AS day, title, intro, retired_at FROM curated_issues");
}

export async function listCuratedIssueItems(db: Db): Promise<{ issue_id: string; position: number; feed_url: string; guid: string | null; note: string }[]> {
  return db.query<{ issue_id: string; position: number; feed_url: string; guid: string | null; note: string }>('SELECT issue_id, position, feed_url, guid, note FROM curated_issue_items ORDER BY issue_id, position');
}

export async function listCollectionRows(db: Db): Promise<{ id: string; title: string; subtitle: string | null; position: number; retired_at: string | null }[]> {
  return db.query<{ id: string; title: string; subtitle: string | null; position: number; retired_at: string | null }>('SELECT id, title, subtitle, position, retired_at FROM collections ORDER BY position, id');
}

export async function listCollectionItemRows(db: Db): Promise<{ collection_id: string; position: number; feed_url: string; guid: string | null; why: string | null }[]> {
  return db.query<{ collection_id: string; position: number; feed_url: string; guid: string | null; why: string | null }>('SELECT collection_id, position, feed_url, guid, why FROM collection_items ORDER BY collection_id, position');
}
