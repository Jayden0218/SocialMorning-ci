// Builds one listener's own data as JSON: profile, library, comments, clips, statuses, lists, purchases and tips.
/**
 * M25 lane SB (audit #19, PDPA/GDPR access and portability). Everything here is the listener's
 * own rows, read by their id — never another person's. Secrets and internal keys are left out
 * (password and code hashes, session tokens, store purchase tokens, storage paths), and byte
 * columns are dropped. Big integers become strings so the JSON is always valid.
 */
import type { Db } from '../../db.ts';

/** A column whose name matches this is never exported. */
const SECRET = /(password|token|hash|secret|_path$|^failed_attempts$|^locked_until$|^second_factor)/;

function clean(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET.test(k)) continue;
    if (v instanceof Uint8Array) continue; // bytea (Buffer is a Uint8Array)
    out[k] = typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** Each section: its name in the file and the query (`$1` = the listener's id). */
export const SECTIONS: readonly (readonly [string, string])[] = [
  ['subscriptions', 'SELECT * FROM subscriptions WHERE listener_id = $1 ORDER BY 1, 2'],
  ['positions', 'SELECT * FROM positions WHERE listener_id = $1'],
  ['library', 'SELECT * FROM library_items WHERE listener_id = $1'],
  ['listened', 'SELECT * FROM listened_ranges WHERE listener_id = $1'],
  ['likes', 'SELECT * FROM episode_likes WHERE listener_id = $1'],
  ['reactions', 'SELECT * FROM reactions WHERE listener_id = $1'],
  ['following', 'SELECT followed_id, created_at FROM follows WHERE follower_id = $1'],
  ['comments', 'SELECT * FROM comments WHERE author_id = $1 ORDER BY created_at'],
  ['heldComments', 'SELECT * FROM held_comments WHERE author_id = $1 ORDER BY created_at'],
  ['clips', 'SELECT * FROM clips WHERE author_id = $1'],
  ['statuses', 'SELECT * FROM voice_posts WHERE listener_id = $1'],
  ['statusItems', 'SELECT i.* FROM status_items i JOIN voice_posts p ON p.id = i.post_id WHERE p.listener_id = $1'],
  ['playlists', 'SELECT * FROM playlists WHERE owner_id = $1'],
  ['playlistItems', 'SELECT i.* FROM playlist_items i JOIN playlists p ON p.id = i.playlist_id WHERE p.owner_id = $1'],
  ['sharedLists', 'SELECT * FROM shared_lists WHERE owner_id = $1'],
  ['queue', 'SELECT * FROM queues WHERE listener_id = $1'],
  ['purchases', 'SELECT * FROM purchases WHERE listener_id = $1 ORDER BY created_at'],
  ['entitlements', 'SELECT * FROM entitlements WHERE listener_id = $1'],
  ['tips', 'SELECT * FROM tips WHERE from_listener = $1'],
  ['giftsBought', 'SELECT * FROM gifts WHERE buyer_id = $1'],
  ['devices', 'SELECT device_label, country, created_at, last_seen_at FROM sessions WHERE listener_id = $1 AND acting_admin_id IS NULL AND replaced_at IS NULL'],
];

export async function exportData(db: Db, listenerId: string, now = new Date()): Promise<Record<string, unknown>> {
  const [profile] = await db.query<Record<string, unknown>>('SELECT * FROM listeners WHERE id = $1', [listenerId]);
  const out: Record<string, unknown> = { exportedAt: now.toISOString(), format: 'socialnet-export-1', profile: profile ? clean(profile) : null };
  for (const [name, sql] of SECTIONS) out[name] = (await db.query<Record<string, unknown>>(sql, [listenerId])).map(clean);
  return out;
}
