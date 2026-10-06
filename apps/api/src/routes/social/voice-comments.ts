// Voice comment route: post a recording of up to 60 seconds as a comment at a moment.
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { audioDurationMs, isMp4 } from '../../voice/duration.ts';
import { readTranscript } from '../../voice/transcript.ts';
import { VOICE_MAX_BYTES, VOICE_MAX_MS } from '../../db/repos/social/voice-posts.ts';
import { getEpisode } from '../../db/repos/library/episodes.ts';
import { createComment, getComment, toPublic } from '../../db/repos/social/comments.ts';
import { rebuildEpisodeHeat } from '../../heat/rebuild.ts';
import { isBlockedBy } from '../../db/repos/safety/blocks.ts';
import { isMutedOn } from '../../db/repos/studio/studio-subscribers.ts';

/**
 * M19 US6 (constitution v3.1.0) — mounted at /v1/episodes: POST /:id/comments/voice. The body is
 * the raw recording (`audio/mp4` or `audio/aac`, ≤ 600 000 bytes); `x-duration-ms` declares its
 * length, `x-offset-ms` the moment, `x-parent-id` makes it a reply. The server measures the length
 * itself, exactly as for voice posts, and stores it under `voice-comments/` in the voice store.
 */
export const voiceComments = new Hono<AuthEnv>();

const TYPES: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };
const SLACK_MS = 500;
const RATE_FLOOR_MS = 5_000;
const UUID = /^[0-9a-f-]{36}$/i;

voiceComments.post('/:id/comments/voice', requireAuth, async (c) => {
  const storage = c.get('voice');
  if (!storage.ready) throw new ApiError('storage_off', 'Voice comments are not switched on yet.');
  const db = c.get('db');
  const me = c.get('listener')!;
  const episodeId = c.req.param('id');
  const episode = await getEpisode(db, episodeId);
  if (!episode) throw new ApiError('not_found', 'Register the episode first (PUT /v1/episodes/:id).');
  let type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  let ext = TYPES[type];
  // iPhone walk 2026-10-06: React Native may send a file Blob with no type (or octet-stream) over
  // our header — such a body is accepted when its own bytes say MP4 (checked once read, below).
  const untyped = !ext && (type === '' || type === 'application/octet-stream');
  if (!ext && !untyped) throw new ApiError('validation', 'Send the recording as audio/mp4 or audio/aac.', { fields: ['content-type'] });
  const declared = Number(c.req.header('x-duration-ms'));
  if (!Number.isInteger(declared) || declared < 1 || declared > VOICE_MAX_MS) throw new ApiError('validation', 'x-duration-ms must be 1–60000.', { fields: ['x-duration-ms'] });
  const offsetRaw = c.req.header('x-offset-ms');
  const offsetMs = offsetRaw === undefined ? undefined : Number(offsetRaw);
  if (offsetMs !== undefined && (!Number.isInteger(offsetMs) || offsetMs < 0)) throw new ApiError('validation', 'x-offset-ms must be a whole number ≥ 0.', { fields: ['x-offset-ms'] });
  const transcript = readTranscript(c.req.header('x-transcript'));
  const parentId = c.req.header('x-parent-id');
  if (parentId !== undefined && !UUID.test(parentId)) throw new ApiError('validation', 'x-parent-id must be a comment id.', { fields: ['x-parent-id'] });

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!ext) {
    if (!isMp4(bytes)) throw new ApiError('validation', 'Send the recording as audio/mp4 or audio/aac.', { fields: ['content-type'] });
    type = 'audio/mp4'; ext = 'm4a';
  }
  if (bytes.length === 0) throw new ApiError('validation', 'The recording is empty.', { fields: ['body'] });
  if (bytes.length > VOICE_MAX_BYTES) throw new ApiError('too_large', 'A voice comment is at most 600 000 bytes.');
  const measured = audioDurationMs(bytes);
  if (measured === undefined) throw new ApiError('validation', "We couldn't read the recording's length.", { fields: ['body'] });
  if (measured > VOICE_MAX_MS + SLACK_MS) throw new ApiError('validation', 'A voice comment is at most 60 seconds.', { fields: ['body'] });

  // The same rules as a text comment: the rate floor, blocks, and the host's mute.
  const [recent] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM comments WHERE author_id = $1 AND created_at > now() - ($2 || ' milliseconds')::interval`, [me.id, String(RATE_FLOOR_MS)]);
  if (Number(recent?.n ?? 0) > 0) throw new ApiError('locked', 'One comment every few seconds, please.', { retryAfterSeconds: 5 });
  if (parentId) {
    const parent = await getComment(db, parentId);
    if (parent?.author_id && parent.author_id !== me.id && (await isBlockedBy(db, parent.author_id, me.id))) throw new ApiError('blocked', "You can't interact with this listener.");
  }
  if (await isMutedOn(db, episode.feed_url, me.id)) throw new ApiError('muted_on_show', 'The host has turned off comments for you on this show.');

  const path = `voice-comments/${me.id}/${randomUUID()}.${ext}`;
  let stored: { url: string; pathname: string };
  try {
    stored = await storage.put(path, bytes, type);
  } catch (e) {
    console.error(c.get('requestId'), 'voice comment put', e);
    throw new ApiError('unavailable', "Couldn't save the recording. Try again.");
  }
  const ms = Math.min(VOICE_MAX_MS, Math.max(1, measured));
  try {
    const created = await db.transaction(async (tx) => {
      const row = await createComment(tx, { episodeId, authorId: me.id, body: null, ...(offsetMs !== undefined ? { offsetMs } : {}), ...(parentId ? { parentId } : {}), voice: { url: stored.url, path: stored.pathname, ms, ...(transcript ? { transcript } : {}) } });
      if (offsetMs !== undefined) await rebuildEpisodeHeat(tx, episodeId);
      return row;
    });
    return c.json({ comment: toPublic(created, me.id) }, 201);
  } catch (e) {
    // The row was refused (a reply too deep, a missing parent): the file must not stay behind.
    try { await storage.remove(stored.url); } catch { /* the sweep cannot see it; logged below */ }
    throw e;
  }
});
