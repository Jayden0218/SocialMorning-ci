// Voice status posts up to 60 seconds, fully deleted after 48 hours.
/**
 * M12 FR-104 — voice status posts (constitution 2.2.0: ≤ 60 s, deleted by the server at 48 h).
 * Guard G-V1: expiry DELETES — the blob first, then the row. Reads also never return an
 * expired row, but hiding is not deleting: a post that is only filtered would still sit in
 * the store for ever.
 */
import type { Db } from '../../db.ts';
import type { VoiceStorage } from '../../../storage/voice-blob.ts';
import { initialsOf } from './comment-likes.ts';

export const VOICE_MAX_BYTES = 600_000;
export const VOICE_MAX_MS = 60_000;
/** At most this many live posts per listener at once. */
export const VOICE_LIVE_MAX = 5;

export type VoiceRow = { id: string; listener_id: string; blob_url: string; duration_ms: number; created_at: Date | string; expires_at: Date | string };

export async function liveCount(db: Db, listenerId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM voice_posts WHERE listener_id = $1 AND expires_at > now()', [listenerId]);
  return Number(r?.n ?? 0);
}

export async function insertPost(db: Db, p: { id: string; listenerId: string; url: string; path: string; durationMs: number; bytes: number }): Promise<VoiceRow> {
  const [row] = await db.query<VoiceRow>(
    `INSERT INTO voice_posts (id, listener_id, blob_url, blob_path, duration_ms, bytes) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, listener_id, blob_url, duration_ms, created_at, expires_at`,
    [p.id, p.listenerId, p.url, p.path, p.durationMs, p.bytes],
  );
  return row!;
}

/** The caller's own posts and those of people they follow; never expired, never across a block, never a suspended author. */
export async function fromFollowing(db: Db, viewerId: string) {
  const rows = await db.query<VoiceRow & { display_name: string }>(
    `SELECT v.id, v.listener_id, v.blob_url, v.duration_ms, v.created_at, v.expires_at, l.display_name
     FROM voice_posts v JOIN listeners l ON l.id = v.listener_id
     WHERE v.expires_at > now() AND l.suspended_at IS NULL
       AND (v.listener_id = $1 OR v.listener_id IN (SELECT followed_id FROM follows WHERE follower_id = $1))
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = v.listener_id) OR (b.blocker_id = v.listener_id AND b.blocked_id = $1))
     ORDER BY v.created_at DESC LIMIT 100`,
    [viewerId],
  );
  return rows.map((r) => ({
    id: r.id, author: { id: r.listener_id, name: r.display_name, initials: initialsOf(r.display_name) }, url: r.blob_url,
    durationMs: Number(r.duration_ms), createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), mine: r.listener_id === viewerId,
  }));
}

export async function getPost(db: Db, id: string): Promise<VoiceRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return (await db.query<VoiceRow>('SELECT id, listener_id, blob_url, duration_ms, created_at, expires_at FROM voice_posts WHERE id = $1', [id]))[0];
}

/** Blob first, then the row: a failed blob delete keeps the row, so the next sweep tries again. */
export async function removePost(db: Db, storage: VoiceStorage, row: { id: string; blob_url: string }): Promise<void> {
  await storage.remove(row.blob_url);
  await db.query('DELETE FROM voice_posts WHERE id = $1', [row.id]);
}

/** G-V1: every post past `expires_at` loses its blob and its row. Store not connected → nothing is touched. */
export async function sweepExpired(db: Db, storage: VoiceStorage, limit = 200): Promise<{ deleted: number; failed: number }> {
  if (!storage.ready) return { deleted: 0, failed: 0 };
  const rows = await db.query<{ id: string; blob_url: string }>('SELECT id, blob_url FROM voice_posts WHERE expires_at < now() ORDER BY expires_at LIMIT $1', [limit]);
  let deleted = 0;
  let failed = 0;
  for (const r of rows) {
    try { await removePost(db, storage, r); deleted++; } catch { failed++; }
  }
  return { deleted, failed };
}

/** Account deletion: the listener's blobs go before the rows cascade away with the account. */
export async function removeAllFor(db: Db, storage: VoiceStorage, listenerId: string): Promise<void> {
  if (!storage.ready) return;
  const rows = await db.query<{ id: string; blob_url: string }>('SELECT id, blob_url FROM voice_posts WHERE listener_id = $1', [listenerId]);
  for (const r of rows) await removePost(db, storage, r);
}
