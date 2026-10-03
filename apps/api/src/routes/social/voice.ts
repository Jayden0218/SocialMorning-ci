// Voice post routes: upload a short recording, list, and delete posts.
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { audioDurationMs } from '../../voice/duration.ts';
import { fromFollowing, getPost, insertPost, liveCount, removePost, VOICE_LIVE_MAX, VOICE_MAX_BYTES, VOICE_MAX_MS } from '../../db/repos/social/voice-posts.ts';

/**
 * M12 FR-104 — mounted at /v1/voice-posts. The body is the raw recording (`audio/mp4` or
 * `audio/aac`, ≤ 600 000 bytes) and `x-duration-ms` declares its length (≤ 60 000). The
 * server measures the length too and refuses what it cannot measure or what runs over. No
 * other audio is ever stored (constitution: we never host audio — this is the one exception).
 */
export const voice = new Hono<AuthEnv>();

const TYPES: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };
/** Encoders pad the last frame; half a second over the limit is still a 60-second post. */
const SLACK_MS = 500;

voice.post('/', requireAuth, async (c) => {
  const storage = c.get('voice');
  if (!storage.ready) throw new ApiError('storage_off', 'Voice posts are not switched on yet.');
  const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new ApiError('validation', 'Send the recording as audio/mp4 or audio/aac.', { fields: ['content-type'] });
  const declared = Number(c.req.header('x-duration-ms'));
  if (!Number.isInteger(declared) || declared < 1 || declared > VOICE_MAX_MS) {
    throw new ApiError('validation', 'x-duration-ms must be 1–60000.', { fields: ['x-duration-ms'] });
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) throw new ApiError('validation', 'The recording is empty.', { fields: ['body'] });
  if (bytes.length > VOICE_MAX_BYTES) throw new ApiError('too_large', 'A voice post is at most 600 000 bytes.');
  const measured = audioDurationMs(bytes);
  if (measured === undefined) throw new ApiError('validation', "We couldn't read the recording's length.", { fields: ['body'] });
  if (measured > VOICE_MAX_MS + SLACK_MS) throw new ApiError('validation', 'A voice post is at most 60 seconds.', { fields: ['body'] });
  const me = c.get('listener')!;
  const db = c.get('db');
  if ((await liveCount(db, me.id)) >= VOICE_LIVE_MAX) throw new ApiError('locked', `At most ${VOICE_LIVE_MAX} voice posts at a time.`);
  const id = randomUUID();
  const path = `voice/${me.id}/${id}.${ext}`;
  let stored: { url: string; pathname: string };
  try {
    stored = await storage.put(path, bytes, type);
  } catch (e) {
    console.error(c.get('requestId'), 'voice put', e);
    throw new ApiError('unavailable', "Couldn't save the recording. Try again.");
  }
  const row = await insertPost(db, { id, listenerId: me.id, url: stored.url, path: stored.pathname, durationMs: Math.min(VOICE_MAX_MS, Math.max(1, measured)), bytes: bytes.length });
  return c.json({ id: row.id, url: row.blob_url, expiresAt: new Date(row.expires_at).toISOString() }, 201);
});

voice.get('/', requireAuth, async (c) => {
  const from = c.req.query('from') ?? 'following';
  if (from !== 'following') throw new ApiError('validation', 'from must be "following".', { fields: ['from'] });
  c.header('cache-control', 'private, no-store');
  return c.json({ items: await fromFollowing(c.get('db'), c.get('listener')!.id) });
});

voice.delete('/:id', requireAuth, async (c) => {
  const db = c.get('db');
  const row = await getPost(db, c.req.param('id'));
  if (!row) throw new ApiError('not_found', 'No such voice post.');
  if (row.listener_id !== c.get('listener')!.id) throw new ApiError('forbidden', 'Only the author can delete a voice post.');
  try {
    await removePost(db, c.get('voice'), row);
  } catch (e) {
    console.error(c.get('requestId'), 'voice delete', e);
    throw new ApiError('unavailable', "Couldn't delete the recording just now. Try again.");
  }
  return c.body(null, 204);
});
