// The write bridge of the social-content lane: each DynamoDB write also writes its Postgres row, with the same id, while other lanes read Postgres.
/**
 * M26 lane SC (backend.ts "the bridge"). Lanes still on Postgres JOIN comments (Studio, /mod, activity, notices,
 * reports, Discover counts), clips, chat messages, statuses and likes. So while the bridge is on, every write of
 * this lane is mirrored here on the plain Postgres handle (`rawPg(db)`), keeping the ids and times DynamoDB
 * issued. Reads never come from here. CUT deletes this file with the Postgres bodies.
 */
import type { Db } from '../../../db.ts';

type Iso = string;

export async function insertComment(raw: Db, c: {
  id: string; episodeId: string; authorId: string; parentId: string | null; body: string | null; offsetMs: number | null;
  voice?: { url: string; path: string; ms: number; transcript?: string }; country?: string; createdAt: Iso;
}): Promise<void> {
  await raw.query(
    `INSERT INTO comments (id, episode_id, author_id, parent_id, body, offset_ms, voice_url, voice_path, voice_ms, transcript, country, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [c.id, c.episodeId, c.authorId, c.parentId, c.body, c.offsetMs, c.voice?.url ?? null, c.voice?.path ?? null, c.voice?.ms ?? null, c.voice?.transcript ?? null, c.country ?? null, c.createdAt],
  );
}

/** The same columns a placeholder clears in `placeholderComments` (M23 US4). */
export async function placeholderComment(raw: Db, id: string, at: Iso): Promise<void> {
  await raw.query(
    `UPDATE comments SET body = NULL, author_id = NULL, offset_ms = NULL, voice_url = NULL, voice_path = NULL, voice_ms = NULL, transcript = NULL,
       image_url = NULL, image_path = NULL, image_w = NULL, image_h = NULL, image_bytes = NULL, country = NULL, deleted_at = $2 WHERE id = $1`,
    [id, at],
  );
}

export async function deleteCommentRow(raw: Db, id: string): Promise<void> {
  await raw.query('DELETE FROM comments WHERE id = $1', [id]);
}

/** One comment's columns, set as DynamoDB set them (names are from a fixed list in the callers, never from input). */
export async function setCommentColumns(raw: Db, id: string, cols: Record<string, unknown>): Promise<void> {
  const allowed = new Set(['pinned_at', 'pinned_by', 'pinned_bottom_at', 'removed_at', 'host_hidden_at', 'host_hidden_by', 'image_url', 'image_path', 'image_w', 'image_h', 'image_bytes', 'voice_url', 'voice_path', 'like_notices_off']);
  const names = Object.keys(cols);
  if (names.length === 0) return;
  for (const n of names) if (!allowed.has(n)) throw new Error(`bridge: ${n} is not a comment column this lane sets`);
  await raw.query(`UPDATE comments SET ${names.map((n, i) => `${n} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...names.map((n) => cols[n])]);
}

export async function insertReaction(raw: Db, r: { listenerId: string; episodeId: string; bucket: number; offsetMs: number; createdAt: Iso }): Promise<void> {
  await raw.query('INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [r.listenerId, r.episodeId, r.bucket, r.offsetMs, r.createdAt]);
}
export async function deleteReaction(raw: Db, listenerId: string, episodeId: string, bucket: number): Promise<void> {
  await raw.query('DELETE FROM reactions WHERE listener_id = $1 AND episode_id = $2 AND bucket = $3', [listenerId, episodeId, bucket]);
}

export async function insertCommentLike(raw: Db, commentId: string, listenerId: string, createdAt: Iso): Promise<void> {
  await raw.query('INSERT INTO comment_likes (comment_id, listener_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [commentId, listenerId, createdAt]);
}
export async function deleteCommentLike(raw: Db, commentId: string, listenerId: string): Promise<void> {
  await raw.query('DELETE FROM comment_likes WHERE comment_id = $1 AND listener_id = $2', [commentId, listenerId]);
}

export async function insertUnfriendly(raw: Db, commentId: string, listenerId: string): Promise<void> {
  await raw.query('INSERT INTO comment_unfriendly (comment_id, listener_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, listenerId]);
}
export async function deleteUnfriendly(raw: Db, commentId: string, listenerId: string): Promise<void> {
  await raw.query('DELETE FROM comment_unfriendly WHERE comment_id = $1 AND listener_id = $2', [commentId, listenerId]);
}

export async function insertClip(raw: Db, c: { id: string; authorId: string; clientId: string; episodeId: string; startMs: number; endMs: number; caption: string; createdAt: Iso }): Promise<void> {
  await raw.query(
    'INSERT INTO clips (id, author_id, client_id, episode_id, start_ms, end_ms, caption, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING',
    [c.id, c.authorId, c.clientId, c.episodeId, c.startMs, c.endMs, c.caption, c.createdAt],
  );
}
export async function setClipDeleted(raw: Db, id: string, at: Iso): Promise<void> {
  await raw.query('UPDATE clips SET deleted_at = $2 WHERE id = $1', [id, at]);
}
export async function setClipRemoved(raw: Db, id: string, at: Iso | null): Promise<void> {
  await raw.query('UPDATE clips SET removed_at = $2 WHERE id = $1', [id, at]);
}
export async function deleteClipRow(raw: Db, id: string): Promise<void> {
  await raw.query('DELETE FROM clips WHERE id = $1', [id]);
}

export async function insertChatMessage(raw: Db, m: { id: number; senderId: string; recipientId: string; body: string; episodeId: string | null; createdAt: Iso }): Promise<void> {
  await raw.query(
    'INSERT INTO chat_messages (id, sender_id, recipient_id, body, episode_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [m.id, m.senderId, m.recipientId, m.body, m.episodeId, m.createdAt],
  );
}
export async function readChat(raw: Db, me: string, other: string, at: Iso): Promise<void> {
  await raw.query('UPDATE chat_messages SET read_at = $3 WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL', [me, other, at]);
}
export async function setChatRemoved(raw: Db, id: number, at: Iso | null): Promise<void> {
  await raw.query('UPDATE chat_messages SET removed_at = $2 WHERE id = $1', [id, at]);
}

export async function upsertEpisodeLike(raw: Db, l: { listenerId: string; episodeId: string; note: string | null; createdAt: Iso }): Promise<void> {
  await raw.query(
    `INSERT INTO episode_likes (listener_id, episode_id, note, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (listener_id, episode_id) DO UPDATE SET note = EXCLUDED.note`,
    [l.listenerId, l.episodeId, l.note, l.createdAt],
  );
}
export async function deleteEpisodeLike(raw: Db, listenerId: string, episodeId: string): Promise<void> {
  await raw.query('DELETE FROM episode_likes WHERE listener_id = $1 AND episode_id = $2', [listenerId, episodeId]);
}
export async function insertLikeComment(raw: Db, c: { id: string; ownerId: string; episodeId: string; authorId: string; body: string; createdAt: Iso }): Promise<void> {
  await raw.query('INSERT INTO like_comments (id, owner_id, episode_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [c.id, c.ownerId, c.episodeId, c.authorId, c.body, c.createdAt]);
}
export async function deleteLikeCommentRow(raw: Db, id: string, at: Iso): Promise<void> {
  await raw.query('UPDATE like_comments SET deleted_at = $2 WHERE id = $1', [id, at]);
}
export async function upsertLikeReaction(raw: Db, r: { ownerId: string; episodeId: string; listenerId: string; emoji: string; createdAt: Iso }): Promise<void> {
  await raw.query(
    `INSERT INTO like_reactions (owner_id, episode_id, listener_id, emoji, created_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id, episode_id, listener_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at`,
    [r.ownerId, r.episodeId, r.listenerId, r.emoji, r.createdAt],
  );
}
export async function deleteLikeReaction(raw: Db, ownerId: string, episodeId: string, listenerId: string): Promise<void> {
  await raw.query('DELETE FROM like_reactions WHERE owner_id = $1 AND episode_id = $2 AND listener_id = $3', [ownerId, episodeId, listenerId]);
}

export async function insertVoicePost(raw: Db, p: { id: string; listenerId: string; blobUrl: string | null; blobPath: string | null; durationMs: number | null; bytes: number | null; transcript: string | null; body: string | null; createdAt: Iso; expiresAt: Iso }): Promise<void> {
  await raw.query(
    `INSERT INTO voice_posts (id, listener_id, blob_url, blob_path, duration_ms, bytes, transcript, body, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [p.id, p.listenerId, p.blobUrl, p.blobPath, p.durationMs, p.bytes, p.transcript, p.body, p.createdAt, p.expiresAt],
  );
}
export async function deleteVoicePost(raw: Db, id: string): Promise<void> {
  await raw.query('DELETE FROM voice_posts WHERE id = $1', [id]);
}
export async function setVoicePostExpiry(raw: Db, id: string, at: Iso): Promise<void> {
  await raw.query('UPDATE voice_posts SET expires_at = $2 WHERE id = $1', [id, at]);
}
export async function insertStatusReply(raw: Db, r: { id: string; postId: string; authorId: string; body: string | null; audioKey: string | null; audioUrl: string | null; audioMs: number | null; createdAt: Iso }): Promise<void> {
  await raw.query(
    'INSERT INTO status_replies (id, post_id, author_id, body, audio_key, audio_url, audio_ms, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [r.id, r.postId, r.authorId, r.body, r.audioKey, r.audioUrl, r.audioMs, r.createdAt],
  );
}
export async function deleteStatusReply(raw: Db, id: string): Promise<void> {
  await raw.query('DELETE FROM status_replies WHERE id = $1', [id]);
}
export async function upsertStatusReaction(raw: Db, postId: string, listenerId: string, kind: number, at: Iso): Promise<void> {
  await raw.query(
    `INSERT INTO status_reactions (post_id, listener_id, kind, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (post_id, listener_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = EXCLUDED.created_at`,
    [postId, listenerId, kind, at],
  );
}
export async function deleteStatusReaction(raw: Db, postId: string, listenerId: string): Promise<void> {
  await raw.query('DELETE FROM status_reactions WHERE post_id = $1 AND listener_id = $2', [postId, listenerId]);
}
export async function insertStatusItem(raw: Db, i: { postId: string; pos: number; kind: 'episode' | 'photo'; episodeId: string | null; imageKey: string | null; imageUrl: string | null }): Promise<void> {
  await raw.query('INSERT INTO status_items (post_id, pos, kind, episode_id, image_key, image_url) VALUES ($1, $2, $3, $4, $5, $6)', [i.postId, i.pos, i.kind, i.episodeId, i.imageKey, i.imageUrl]);
}
export async function deleteStatusPhotoItems(raw: Db, imageKey: string): Promise<void> {
  await raw.query("DELETE FROM status_items WHERE kind = 'photo' AND image_key = $1", [imageKey]);
}
export async function setSuggestionMute(raw: Db, viewerId: string, mutedId: string, on: boolean): Promise<void> {
  if (on) await raw.query('INSERT INTO status_suggestion_mutes (listener_id, muted_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [viewerId, mutedId]);
  else await raw.query('DELETE FROM status_suggestion_mutes WHERE listener_id = $1 AND muted_id = $2', [viewerId, mutedId]);
}
