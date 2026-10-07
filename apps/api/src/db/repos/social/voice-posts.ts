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
import type { ImageStorage } from '../../../storage/image-store.ts';
import { initialsOf } from './comment-likes.ts';
import { replyAudioOf } from './status-replies.ts';
import { photosOf, removePhoto, sweepOrphanPhotos } from './status-items.ts';

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
     WHERE v.expires_at > now() AND l.suspended_at IS NULL AND l.hidden_at IS NULL
       AND (v.listener_id = $1 OR v.listener_id IN (SELECT followed_id FROM follows WHERE follower_id = $1))
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = v.listener_id) OR (b.blocker_id = v.listener_id AND b.blocked_id = $1))
       AND NOT EXISTS (SELECT 1 FROM listener_mutes m WHERE m.muter_id = $1 AND m.muted_id = v.listener_id) -- M21 US6 (G-M21-6)
     ORDER BY v.created_at DESC LIMIT 100`,
    [viewerId],
  );
  return rows.map((r) => toPublicPost(r, viewerId));
}

type PostRow = VoiceRow & { display_name: string; avatar_url: string | null };

function toPublicPost(r: PostRow, viewerId: string) {
  return {
    id: r.id, author: { id: r.listener_id, name: r.display_name, initials: initialsOf(r.display_name), ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) },
    // M21 US8: a text status has `body` and no `url` (durationMs 0).
    ...(r.body ? { body: r.body } : { url: r.blob_url }),
    durationMs: Number(r.duration_ms ?? 0), createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), mine: r.listener_id === viewerId,
    ...(r.transcript ? { text: r.transcript } : {}),
  };
}

export type PublicPost = ReturnType<typeof toPublicPost>;

/** M22 US2 (FR-010): at most this many suggested statuses after the people the viewer follows. */
export const SUGGESTED_MAX = 5;

/**
 * Suggested statuses: live posts by accounts the viewer does not follow — never their own, never a
 * blocked (either way), muted, suspended or hidden account. One per author (the newest), newest first.
 */
export async function suggestedFor(db: Db, viewerId: string, limit = SUGGESTED_MAX): Promise<PublicPost[]> {
  const rows = await db.query<PostRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (v.listener_id) v.id, v.listener_id, v.blob_url, v.duration_ms, v.created_at, v.expires_at, v.transcript, v.body, l.display_name, l.avatar_url
         FROM voice_posts v JOIN listeners l ON l.id = v.listener_id
        WHERE v.expires_at > now() AND l.suspended_at IS NULL AND l.hidden_at IS NULL
          AND v.listener_id <> $1
          AND v.listener_id NOT IN (SELECT followed_id FROM follows WHERE follower_id = $1)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = v.listener_id) OR (b.blocker_id = v.listener_id AND b.blocked_id = $1))
          AND NOT EXISTS (SELECT 1 FROM listener_mutes m WHERE m.muter_id = $1 AND m.muted_id = v.listener_id)
        ORDER BY v.listener_id, v.created_at DESC) s
     ORDER BY s.created_at DESC LIMIT $2`,
    [viewerId, limit],
  );
  return rows.map((r) => toPublicPost(r, viewerId));
}

/** One live status the viewer may see: their own, a followed account's, or any public one (as a suggestion would show it). */
export async function visiblePost(db: Db, id: string, viewerId: string): Promise<PublicPost | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<PostRow>(
    `SELECT v.id, v.listener_id, v.blob_url, v.duration_ms, v.created_at, v.expires_at, v.transcript, v.body, l.display_name, l.avatar_url
       FROM voice_posts v JOIN listeners l ON l.id = v.listener_id
      WHERE v.id = $2 AND v.expires_at > now() AND l.suspended_at IS NULL AND (l.hidden_at IS NULL OR v.listener_id = $1)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = v.listener_id) OR (b.blocker_id = v.listener_id AND b.blocked_id = $1))`,
    [viewerId, id],
  );
  return r ? toPublicPost(r, viewerId) : undefined;
}

export async function getPost(db: Db, id: string): Promise<VoiceRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return (await db.query<VoiceRow>('SELECT id, listener_id, blob_url, duration_ms, created_at, expires_at, body FROM voice_posts WHERE id = $1', [id]))[0];
}

/**
 * Blob first, then the row: a failed blob delete keeps the row, so the next sweep tries again. A text status has no blob.
 * M22 (G-M22-2): its voice replies' files and its photos go before it — those rows would cascade
 * away with the status and leave the files in the store for ever. Any failure keeps the status.
 */
export async function removePost(db: Db, storage: VoiceStorage, row: { id: string; blob_url: string | null }, images?: ImageStorage): Promise<void> {
  await removeAttachments(db, storage, images, row.id);
  if (row.blob_url) await storage.remove(row.blob_url);
  await db.query('DELETE FROM voice_posts WHERE id = $1', [row.id]);
}

/** M22 US2/US6: a status's voice-reply files (voice store) and photos (image store), each file before its row. */
export async function removeAttachments(db: Db, storage: VoiceStorage, images: ImageStorage | undefined, postId: string): Promise<void> {
  for (const r of await replyAudioOf(db, [postId])) {
    if (!storage.ready) throw new Error('voice store not connected');
    await db.query('DELETE FROM status_replies WHERE id = $1', [r.id]);
  }
  for (const key of await photosOf(db, [postId])) await removePhoto(db, images, key);
}

/**
 * G-V1: every post past `expires_at` loses its blob and its row. M21 US8 (G-M21-8): an expired text
 * status has no blob, so its row goes first, whether or not the store is connected. Store not
 * connected → no audio post is touched.
 * M22 (G-M22-2): first, every expired status that carries files (voice replies, photos) loses them,
 * then itself; one whose files could not all be deleted stays for the next cycle. Photos uploaded
 * but never posted go too (after 2 hours).
 */
export async function sweepExpired(db: Db, storage: VoiceStorage, limit = 200, images?: ImageStorage): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const carriers = await db.query<{ id: string; blob_url: string | null }>(
    `SELECT v.id, v.blob_url FROM voice_posts v WHERE v.expires_at < now()
        AND (EXISTS (SELECT 1 FROM status_replies r WHERE r.post_id = v.id AND r.audio_url IS NOT NULL)
          OR EXISTS (SELECT 1 FROM status_items i WHERE i.post_id = v.id AND i.kind = 'photo'))
      ORDER BY v.expires_at LIMIT $1`,
    [limit],
  );
  for (const r of carriers) {
    try { await removePost(db, storage, r, images); deleted++; } catch { failed++; }
  }
  failed += (await sweepOrphanPhotos(db, images)).failed;
  // A carrier whose files could not all be deleted is still here: leave it for the next cycle.
  const kept = carriers.map((r) => r.id);
  const [t] = await db.query<{ n: number }>(
    'WITH d AS (DELETE FROM voice_posts WHERE body IS NOT NULL AND expires_at < now() AND NOT (id = ANY($1::uuid[])) RETURNING 1) SELECT count(*)::int AS n FROM d',
    [kept],
  );
  deleted += Number(t?.n ?? 0);
  if (!storage.ready) return { deleted, failed };
  const rows = await db.query<{ id: string; blob_url: string }>(
    'SELECT id, blob_url FROM voice_posts WHERE body IS NULL AND expires_at < now() AND NOT (id = ANY($2::uuid[])) ORDER BY expires_at LIMIT $1',
    [limit, kept],
  );
  for (const r of rows) {
    try { await removePost(db, storage, r, images); deleted++; } catch { failed++; }
  }
  return { deleted, failed };
}

/** Account deletion: the listener's blobs go before the rows cascade away with the account. */
export async function removeAllFor(db: Db, storage: VoiceStorage, listenerId: string, images?: ImageStorage): Promise<void> {
  if (!storage.ready) return;
  const rows = await db.query<{ id: string; blob_url: string | null }>('SELECT id, blob_url FROM voice_posts WHERE listener_id = $1 AND (body IS NULL OR id IN (SELECT post_id FROM status_replies WHERE audio_url IS NOT NULL) OR id IN (SELECT post_id FROM status_items WHERE kind = \'photo\'))', [listenerId]);
  for (const r of rows) await removePost(db, storage, r, images);
  // M22: their voice replies on other people's statuses.
  for (const r of await db.query<{ id: string; audio_url: string }>('SELECT id, audio_url FROM status_replies WHERE author_id = $1 AND audio_url IS NOT NULL', [listenerId])) {
    await storage.remove(r.audio_url);
    await db.query('DELETE FROM status_replies WHERE id = $1', [r.id]);
  }
}
