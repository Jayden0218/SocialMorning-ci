// Mutes: hide a listener's comments, voice posts and likes from me only; they are never told.
/**
 * M21 US6 (G-M21-6). A mute is one-way and private: `listener_mutes(muter_id, muted_id)`. Only the
 * muter's reads change (comments and replies, voice posts, the likes timeline); the muted listener
 * sees nothing different and no notice is sent. Self-mutes are refused (the table CHECKs it too).
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

async function mutePg(db: Db, muterId: string, mutedId: string): Promise<'muted' | 'no_such_listener'> {
  const exists = await db.query<{ id: string }>('SELECT id FROM listeners WHERE id = $1', [mutedId]);
  if (exists.length === 0) return 'no_such_listener';
  await db.query('INSERT INTO listener_mutes (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [muterId, mutedId]);
  return 'muted';
}

async function unmutePg(db: Db, muterId: string, mutedId: string): Promise<void> {
  await db.query('DELETE FROM listener_mutes WHERE muter_id = $1 AND muted_id = $2', [muterId, mutedId]);
}

async function mutedIdsForPg(db: Db, muterId: string): Promise<Set<string>> {
  const rows = await db.query<{ muted_id: string }>('SELECT muted_id FROM listener_mutes WHERE muter_id = $1', [muterId]);
  return new Set(rows.map((r) => r.muted_id));
}

async function listMutesPg(db: Db, muterId: string): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  const rows = await db.query<{ id: string; display_name: string; avatar_url: string | null }>(
    'SELECT l.id, l.display_name, l.avatar_url FROM listener_mutes m JOIN listeners l ON l.id = m.muted_id WHERE m.muter_id = $1 ORDER BY m.created_at DESC',
    [muterId],
  );
  return rows.map((r) => ({ id: r.id, name: r.display_name, avatarUrl: r.avatar_url ?? null }));
}

/** Part of the social poll's ETag: a mute or an unmute changes the muter's answer (count + newest). */
async function muteStampPg(db: Db, muterId: string): Promise<string> {
  const [r] = await db.query<{ n: number; v: string | null }>(
    'SELECT count(*)::int AS n, max(created_at)::text AS v FROM listener_mutes WHERE muter_id = $1',
    [muterId],
  );
  return `${Number(r?.n ?? 0)}:${r?.v ?? '-'}`;
}

// M26 lane SG: each runs on DynamoDB when the Db carries a Store (src/db/backend.ts; bodies in graph-ddb/).
export const mute = dual('sg/index', 'mute', mutePg);
export const unmute = dual('sg/index', 'unmute', unmutePg);
export const mutedIdsFor = dual('sg/index', 'mutedIdsFor', mutedIdsForPg);
export const listMutes = dual('sg/index', 'listMutes', listMutesPg);
export const muteStamp = dual('sg/index', 'muteStamp', muteStampPg);
