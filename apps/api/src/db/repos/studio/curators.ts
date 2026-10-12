// Finds the curator who shared an outside show, hiding suspended accounts.
/**
 * M15 T029 (D3) — a curator shares an external show: the app says "Shared by <name>", never
 * "Host" (FR-023). One curator per show. A suspended account is not shown (FR-025).
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type Curator = { id: string; displayName: string };

async function curatorForPg(db: Db, feedUrl: string): Promise<Curator | null> {
  const [r] = await db.query<{ id: string; display_name: string }>(
    `SELECT l.id, l.display_name FROM show_curators c JOIN listeners l ON l.id = c.listener_id
      WHERE c.feed_url = $1 AND l.suspended_at IS NULL AND l.hidden_at IS NULL`, [feedUrl]);
  return r ? { id: r.id, displayName: r.display_name } : null;
}

async function listCuratorsPg(db: Db): Promise<{ feedUrl: string; curator: Curator; createdAt: string }[]> {
  const rows = await db.query<{ feed_url: string; id: string; display_name: string; created_at: Date | string }>(
    'SELECT c.feed_url, l.id, l.display_name, c.created_at FROM show_curators c JOIN listeners l ON l.id = c.listener_id ORDER BY c.created_at DESC');
  return rows.map((r) => ({ feedUrl: r.feed_url, curator: { id: r.id, displayName: r.display_name }, createdAt: new Date(r.created_at).toISOString() }));
}

/** Sets (or, with `null`, removes) the show's curator. */
async function setCuratorPg(tx: Db, feedUrl: string, listenerId: string | null, by: string): Promise<void> {
  if (listenerId === null) {
    await tx.query('DELETE FROM show_curators WHERE feed_url = $1', [feedUrl]);
    return;
  }
  await tx.query(
    `INSERT INTO show_curators (feed_url, listener_id, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (feed_url) DO UPDATE SET listener_id = EXCLUDED.listener_id, created_by = EXCLUDED.created_by, created_at = now()`,
    [feedUrl, listenerId, by],
  );
}

// M26 lane ST: each runs on Postgres, or on DynamoDB (ddb/team.ts, `CFG#curators`) when the Db carries a Store (db/backend.ts).
export const curatorFor = dual('st/team', 'curatorFor', curatorForPg);
export const listCurators = dual('st/team', 'listCurators', listCuratorsPg);
export const setCurator = dual('st/team', 'setCurator', setCuratorPg);
