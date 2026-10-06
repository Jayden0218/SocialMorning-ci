// Voice status posts up to 60 seconds, fully deleted after 24 hours.
/**
 * M12 FR-104 — voice status posts (constitution 3.0.1: ≤ 60 s, deleted by the server at 24 h;
 * owner, 2026-10-05 — was 48 h; the column's default still says 48, so the insert sets it).
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

export type VoiceRow = { id: string; listener_id: string; blob_url: string | null; duration_ms: number | null; created_at: Date | string; expires_at: Date | string; /** M20 US3 */ transcript?: string | null; /** M21 US8: a text status has a body and no audio. */ body?: string | null };

/** M21 US8 (G-M21-8): a text status is 1–140 characters (the column CHECKs it too). */
export const TEXT_STATUS_MAX = 140;

export async function liveCount(db: Db, listenerId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM voice_posts WHERE listener_id = $1 AND expires_at > now()', [listenerId]);
  return Number(r?.n ?? 0);
}

export async function insertPost(db: Db, p: { id: string; listenerId: string; url: string; path: string; durationMs: number; bytes: number; /** M20 US3 */ transcript?: string }): Promise<VoiceRow> {
  const [row] = await db.query<VoiceRow>(
    `INSERT INTO voice_posts (id, listener_id, blob_url, blob_path, duration_ms, bytes, transcript, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '24 hours')
     RETURNING id, listener_id, blob_url, duration_ms, created_at, expires_at, transcript`,
    [p.id, p.listenerId, p.url, p.path, p.durationMs, p.bytes, p.transcript ?? null],
  );
  return row!;
}

/** M21 US8: a text status — no audio, the same 24 h expiry and the same live cap as a voice post. */
export async function insertTextPost(db: Db, p: { id: string; listenerId: string; body: string }): Promise<VoiceRow> {
  const [row] = await db.query<VoiceRow>(
    `INSERT INTO voice_posts (id, listener_id, body, expires_at) VALUES ($1, $2, $3, now() + interval '24 hours')
     RETURNING id, listener_id, blob_url, duration_ms, created_at, expires_at, body`,
    [p.id, p.listenerId, p.body],
  );
  return row!;
}

/** The caller's own posts and those of people they follow; never expired, never across a block, never a suspended author. */
export async function fromFollowing(db: Db, viewerId: string) {
  const rows = await db.query<VoiceRow & { display_name: string; avatar_url: string | null }>(
    `SELECT v.id, v.listener_id, v.blob_url, v.duration_ms, v.created_at, v.expires_at, v.transcript, v.body, l.display_name, l.avatar_url
     FROM voice_posts v JOIN listeners l ON l.id = v.listener_id
     WHERE v.expires_at > now() AND l.suspended_at IS NULL
       AND (v.listener_id = $1 OR v.listener_id IN (SELECT followed_id FROM follows WHERE follower_id = $1))
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = v.listener_id) OR (b.blocker_id = v.listener_id AND b.blocked_id = $1))
       AND NOT EXISTS (SELECT 1 FROM listener_mutes m WHERE m.muter_id = $1 AND m.muted_id = v.listener_id) -- M21 US6 (G-M21-6)
     ORDER BY v.created_at DESC LIMIT 100`,
    [viewerId],
  );
  return rows.map((r) => ({
    id: r.id, author: { id: r.listener_id, name: r.display_name, initials: initialsOf(r.display_name), ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) },
    // M21 US8: a text status has `body` and no `url` (durationMs 0).
    ...(r.body ? { body: r.body } : { url: r.blob_url }),
    durationMs: Number(r.duration_ms ?? 0), createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), mine: r.listener_id === viewerId,
    ...(r.transcript ? { text: r.transcript } : {}),
  }));
}

export async function getPost(db: Db, id: string): Promise<VoiceRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return (await db.query<VoiceRow>('SELECT id, listener_id, blob_url, duration_ms, created_at, expires_at, body FROM voice_posts WHERE id = $1', [id]))[0];
}

/** Blob first, then the row: a failed blob delete keeps the row, so the next sweep tries again. A text status has no blob. */
export async function removePost(db: Db, storage: VoiceStorage, row: { id: string; blob_url: string | null }): Promise<void> {
  if (row.blob_url) await storage.remove(row.blob_url);
  await db.query('DELETE FROM voice_posts WHERE id = $1', [row.id]);
}

/**
 * G-V1: every post past `expires_at` loses its blob and its row. M21 US8 (G-M21-8): an expired text
 * status has no blob, so its row goes first, whether or not the store is connected. Store not
 * connected → no audio post is touched.
 */
export async function sweepExpired(db: Db, storage: VoiceStorage, limit = 200): Promise<{ deleted: number; failed: number }> {
  const [t] = await db.query<{ n: number }>('WITH d AS (DELETE FROM voice_posts WHERE body IS NOT NULL AND expires_at < now() RETURNING 1) SELECT count(*)::int AS n FROM d');
  const texts = Number(t?.n ?? 0);
  if (!storage.ready) return { deleted: texts, failed: 0 };
  const rows = await db.query<{ id: string; blob_url: string }>('SELECT id, blob_url FROM voice_posts WHERE body IS NULL AND expires_at < now() ORDER BY expires_at LIMIT $1', [limit]);
  let deleted = texts;
  let failed = 0;
  for (const r of rows) {
    try { await removePost(db, storage, r); deleted++; } catch { failed++; }
  }
  return { deleted, failed };
}

/** Account deletion: the listener's blobs go before the rows cascade away with the account. */
export async function removeAllFor(db: Db, storage: VoiceStorage, listenerId: string): Promise<void> {
  if (!storage.ready) return;
  const rows = await db.query<{ id: string; blob_url: string | null }>('SELECT id, blob_url FROM voice_posts WHERE listener_id = $1 AND body IS NULL', [listenerId]);
  for (const r of rows) await removePost(db, storage, r);
}
