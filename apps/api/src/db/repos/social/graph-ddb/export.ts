// The social-graph sections of "Download my data" on DynamoDB: who I follow and my playlists, as the old rows.
/**
 * M26 lane SG. Lane AC's export (account/ddb/account.ts `exportData`) asks this file for the sections whose rows
 * moved with lane SG — the same column names the SQL `SELECT … FROM follows / playlists / playlist_items` gave.
 */
import { edges } from './follows.ts';
import { exportPlaylists } from './playlists.ts';
import type { Hybrid } from './common.ts';

export const GRAPH_SECTIONS: ReadonlySet<string> = new Set(['following', 'playlists', 'playlistItems']);

export async function graphExportSection(h: Hybrid, name: string, listenerId: string): Promise<Record<string, unknown>[]> {
  if (name === 'following') return (await edges(h, listenerId, 'following')).map((e) => ({ followed_id: e.id, created_at: e.createdAt }));
  const p = await exportPlaylists(h, listenerId);
  return name === 'playlists' ? p.playlists : p.items;
}
