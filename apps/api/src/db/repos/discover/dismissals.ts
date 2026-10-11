// "Not interested" choices: episodes and shows a listener asked For You to stop showing.
/**
 * M19 US2 (FR-010–FR-012). An episode or a whole show the listener turned down. For You leaves
 * them out from the next request (filtered after its cache, and the cache key changes so the list
 * refills); charts, search and show pages are not affected.
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type DismissalKind = 'episode' | 'show';
export type Dismissal = { kind: DismissalKind; itemKey: string; title?: string; createdAt: string };
export type Dismissed = { episodes: Set<string>; shows: Set<string> };

async function dismissedForPg(db: Db, listenerId: string): Promise<Dismissed> {
  const rows = await db.query<{ kind: DismissalKind; item_key: string }>('SELECT kind, item_key FROM rec_dismissals WHERE listener_id = $1', [listenerId]);
  const out: Dismissed = { episodes: new Set(), shows: new Set() };
  for (const r of rows) (r.kind === 'episode' ? out.episodes : out.shows).add(r.item_key);
  return out;
}

/** The listener's list for Settings, newest first, with a title when the server knows one. */
async function listDismissalsPg(db: Db, listenerId: string): Promise<Dismissal[]> {
  const rows = await db.query<{ kind: DismissalKind; item_key: string; created_at: Date | string; ep_title: string | null; show_title: string | null }>(
    `SELECT d.kind, d.item_key, d.created_at,
            (SELECT e.title FROM episodes e WHERE d.kind = 'episode' AND e.id = d.item_key) AS ep_title,
            (SELECT e.show_title FROM episodes e WHERE d.kind = 'show' AND e.feed_url = d.item_key AND e.show_title IS NOT NULL ORDER BY e.updated_at DESC LIMIT 1) AS show_title
     FROM rec_dismissals d WHERE d.listener_id = $1 ORDER BY d.created_at DESC LIMIT 500`,
    [listenerId],
  );
  return rows.map((r) => {
    const title = r.kind === 'episode' ? r.ep_title : r.show_title;
    return { kind: r.kind, itemKey: r.item_key, ...(title ? { title } : {}), createdAt: new Date(r.created_at).toISOString() };
  });
}

async function addDismissalPg(db: Db, listenerId: string, kind: DismissalKind, itemKey: string): Promise<void> {
  await db.query('INSERT INTO rec_dismissals (listener_id, kind, item_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [listenerId, kind, itemKey]);
}

async function removeDismissalPg(db: Db, listenerId: string, kind: DismissalKind, itemKey: string): Promise<void> {
  await db.query('DELETE FROM rec_dismissals WHERE listener_id = $1 AND kind = $2 AND item_key = $3', [listenerId, kind, itemKey]);
}

/** Part of For You's cache key: any change to the list (add or restore) is a new key. */
async function dismissalStampPg(db: Db, listenerId: string): Promise<string> {
  const [r] = await db.query<{ n: number; v: string | null }>('SELECT count(*)::int AS n, max(created_at)::text AS v FROM rec_dismissals WHERE listener_id = $1', [listenerId]);
  return `${r?.n ?? 0}.${r?.v ?? '-'}`;
}

/** True when this episode, or its show, was turned down. */
export const isDismissed = (d: Dismissed, episodeId: string, feedUrl: string): boolean => d.episodes.has(episodeId) || d.shows.has(feedUrl);

// M26 lane DV: each runs on Postgres, or on DynamoDB (ddb/dismissals.ts) when the Db carries a Store (db/backend.ts).
export const dismissedFor = dual('dv/dismissals', 'dismissedFor', dismissedForPg);
export const listDismissals = dual('dv/dismissals', 'listDismissals', listDismissalsPg);
export const addDismissal = dual('dv/dismissals', 'addDismissal', addDismissalPg);
export const removeDismissal = dual('dv/dismissals', 'removeDismissal', removeDismissalPg);
export const dismissalStamp = dual('dv/dismissals', 'dismissalStamp', dismissalStampPg);
