// Voice post routes: upload a short recording or post a text status, list, and delete posts.
import { Hono, type Context } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { audioDurationMs, isMp4 } from '../../voice/duration.ts';
import { readTranscript } from '../../voice/transcript.ts';
import { fromFollowing, getPost, insertPost, insertTextPost, liveCount, removePost, setSuggestionMute, suggestedFor, TEXT_STATUS_MAX, visiblePost, VOICE_LIVE_MAX, VOICE_MAX_BYTES, VOICE_MAX_MS, type PublicPost } from '../../db/repos/social/voice-posts.ts';
import { sniff } from '../../db/repos/account/feedback.ts';
import { stripImageMetadata } from '@socialmorning/social-core';
import { pushNewStatus } from '../../db/repos/account/push.ts';
import { addAudioReply, addTextReply, clearReaction, deleteReply, listReplies, REACTION_KINDS, REPLY_TEXT_MAX, setReaction, summaries, visibleStatus } from '../../db/repos/social/status-replies.ts';
import { insertItems, itemsFor, itemsFromHeader, ItemsError, parseItems, recordUpload, STATUS_PHOTO_MAX_BYTES, statusPhotoBytes, type StatusItemIn } from '../../db/repos/social/status-items.ts';
import { insertTextStatusInTx, listenerExistsRows, liveCommentImageBytesRows } from '../../db/repos/social/status-writes.ts';

/**
 * M12 FR-104 — mounted at /v1/voice-posts. The body is the raw recording (`audio/mp4` or
 * `audio/aac`, ≤ 600 000 bytes) and `x-duration-ms` declares its length (≤ 60 000). The
 * server measures the length too and refuses what it cannot measure or what runs over. No
 * other audio is ever stored (constitution: we never host audio — this is the one exception;
 * since 3.3.0 voice replies on a status use the same store, rules and 24 h life).
 *
 * M22 (specs/023 contracts/api.md "Statuses"):
 *   GET    /?suggested=1               → items add `items`, `reactions`, `myReaction`, `replyCount` (owner), `suggested`
 *   GET    /:id                         → one status
 *   POST   /  …                         → `items` ≤ 10 (JSON `items`, or the `x-items` header on a recording); 400 too_many_items
 *   POST   /images                      → raw JPEG/PNG ≤ 1 000 000 bytes → { imageKey, url }
 *   GET    /:id/replies                 → the owner sees all; others their own
 *   POST   /:id/replies                 → JSON { body ≤ 140 } or a raw recording (same rules as a voice status)
 *   DELETE /:id/replies/:replyId        → 204 (owner or author; the recording goes too)
 *   PUT    /:id/reaction { kind 1..6 }  → 204 · DELETE → 204
 *   PUT    /suggestions/muted/:listenerId → 204 (M24 US17: stop suggesting this person) · DELETE → 204 (undo)
 * A recording is sent raw (like a voice status), not as multipart: the phone already uploads that way.
 */
export const voice = new Hono<AuthEnv>();

const TYPES: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };
/** Encoders pad the last frame; half a second over the limit is still a 60-second post. */
const SLACK_MS = 500;
const isJson = (c: Context<AuthEnv>) => (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase() === 'application/json';

/** M22: the checks a recording passes, shared by voice statuses and voice replies. */
async function readRecording(c: Context<AuthEnv>): Promise<{ bytes: Uint8Array; type: string; ext: string; measured: number }> {
  let type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  let ext = TYPES[type];
  // iPhone walk 2026-10-06: React Native may send a file Blob with no type (or octet-stream) over
  // our header — such a body is accepted when its own bytes say MP4 (checked once read, below).
  const untyped = !ext && (type === '' || type === 'application/octet-stream');
  if (!ext && !untyped) throw new ApiError('validation', 'Send the recording as audio/mp4 or audio/aac.', { fields: ['content-type'] });
  const declared = Number(c.req.header('x-duration-ms'));
  if (!Number.isInteger(declared) || declared < 1 || declared > VOICE_MAX_MS) {
    throw new ApiError('validation', 'x-duration-ms must be 1–60000.', { fields: ['x-duration-ms'] });
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!ext) {
    if (!isMp4(bytes)) throw new ApiError('validation', 'Send the recording as audio/mp4 or audio/aac.', { fields: ['content-type'] });
    type = 'audio/mp4'; ext = 'm4a';
  }
  if (bytes.length === 0) throw new ApiError('validation', 'The recording is empty.', { fields: ['body'] });
  if (bytes.length > VOICE_MAX_BYTES) throw new ApiError('too_large', 'A voice post is at most 600 000 bytes.');
  const measured = audioDurationMs(bytes);
  if (measured === undefined) throw new ApiError('validation', "We couldn't read the recording's length.", { fields: ['body'] });
  if (measured > VOICE_MAX_MS + SLACK_MS) throw new ApiError('validation', 'A voice post is at most 60 seconds.', { fields: ['body'] });
  return { bytes, type, ext, measured };
}

// M23 US6 (FR-011): the shared error shape — bad input is 422 `validation`; the old code is `reason`.
const itemsError = (e: ItemsError) =>
  new ApiError('validation', e.code === 'too_many_items' ? 'Up to 10 items.' : e.message, { reason: e.code, fields: ['items'] });

voice.post('/', requireAuth, async (c) => {
  // M21 US8 (FR-071, G-M21-8): `application/json` { body } is a text status — 1–140 characters, no
  // audio, so the store need not be connected. Every other type is the recording path below, unchanged.
  if (isJson(c)) return postText(c);
  const storage = c.get('voice');
  if (!storage.ready) throw new ApiError('storage_off', 'Voice posts are not switched on yet.');
  let items: StatusItemIn[];
  try { items = itemsFromHeader(c.req.header('x-items')); } catch (e) { if (e instanceof ItemsError) throw itemsError(e); throw e; }
  const transcript = readTranscript(c.req.header('x-transcript'));
  const { bytes, type, ext, measured } = await readRecording(c);
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
  const row = await insertPost(db, { id, listenerId: me.id, url: stored.url, path: stored.pathname, durationMs: Math.min(VOICE_MAX_MS, Math.max(1, measured)), bytes: bytes.length, ...(transcript ? { transcript } : {}) });
  if (items.length > 0) {
    try { await insertItems(db, row.id, me.id, items); } catch (e) {
      // The status is refused whole: its recording and row go again.
      await removePost(db, storage, row, c.get('images')).catch(() => undefined);
      if (e instanceof ItemsError) throw itemsError(e);
      throw e;
    }
  }
  await pushNewStatus(db, me.id, row.id, true); // M22 US6 (FR-022)
  return c.json({ id: row.id, url: row.blob_url, expiresAt: new Date(row.expires_at).toISOString(), ...(row.transcript ? { text: row.transcript } : {}) }, 201);
});

/** Characters as a person counts them (an emoji is one), the same count the phone's counter shows. */
const chars = (s: string) => [...s].length;

async function postText(c: Context<AuthEnv>) {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = undefined; }
  const body = raw && typeof raw === 'object' && typeof (raw as { body?: unknown }).body === 'string' ? (raw as { body: string }).body.trim() : undefined;
  if (body === undefined || body.length === 0) throw new ApiError('validation', 'Write something first.', { reason: 'empty', fields: ['body'] });
  // The column counts code points (char_length); so does `chars`, so the two never disagree.
  if (chars(body) > TEXT_STATUS_MAX) throw new ApiError('validation', `A text status is at most ${TEXT_STATUS_MAX} characters.`, { reason: 'too_long', fields: ['body'] });
  let items: StatusItemIn[];
  try { items = parseItems((raw as { items?: unknown }).items); } catch (e) { if (e instanceof ItemsError) throw itemsError(e); throw e; }
  const me = c.get('listener')!;
  const db = c.get('db');
  if ((await liveCount(db, me.id)) >= VOICE_LIVE_MAX) throw new ApiError('locked', `At most ${VOICE_LIVE_MAX} status posts at a time.`);
  let row: Awaited<ReturnType<typeof insertTextPost>>;
  try {
    row = await insertTextStatusInTx(db, me.id, body, items);
  } catch (e) {
    if (e instanceof ItemsError) throw itemsError(e);
    throw e;
  }
  await pushNewStatus(db, me.id, row.id, false); // M22 US6 (FR-022)
  return c.json({ id: row.id, body: row.body, expiresAt: new Date(row.expires_at).toISOString() }, 201);
}

/** M22: what a list or a single read adds to each post — its items, reactions and (owner) reply count. */
async function enrich(c: Context<AuthEnv>, posts: readonly PublicPost[], suggested: ReadonlySet<string>) {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const items = await itemsFor(db, posts.map((p) => p.id));
  const sums = await summaries(db, posts.map((p) => ({ id: p.id, listenerId: p.author.id })), me);
  return posts.map((p) => {
    const s = sums.get(p.id);
    return {
      ...p, items: items.get(p.id) ?? [], reactions: s?.reactions ?? [], myReaction: s?.myReaction ?? null,
      ...(s?.replyCount !== undefined ? { replyCount: s.replyCount, reactedBy: s.reactedBy ?? [] } : {}),
      suggested: suggested.has(p.id),
    };
  });
}

// M24 US17: "stop suggesting this person's statuses". Registered before the `/:id` routes.
const suggestionMute = (on: boolean) => async (c: Context<AuthEnv>) => {
  const other = c.req.param('listenerId') ?? '';
  const me = c.get('listener')!.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(other) || other === me) throw new ApiError('not_found', 'No such listener.');
  if ((await listenerExistsRows(c.get('db'), other)).length === 0) throw new ApiError('not_found', 'No such listener.');
  await setSuggestionMute(c.get('db'), me, other, on);
  return c.body(null, 204);
};
voice.put('/suggestions/muted/:listenerId', requireAuth, suggestionMute(true));
voice.delete('/suggestions/muted/:listenerId', requireAuth, suggestionMute(false));

voice.get('/', requireAuth, async (c) => {
  const from = c.req.query('from') ?? 'following';
  if (from !== 'following') throw new ApiError('validation', 'from must be "following".', { fields: ['from'] });
  c.header('cache-control', 'private, no-store');
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const own = await fromFollowing(db, me);
  // M22 US2 (FR-010): after the people I follow, up to 5 from public accounts I don't follow.
  const extra = c.req.query('suggested') === '1' ? await suggestedFor(db, me) : [];
  return c.json({ items: await enrich(c, [...own, ...extra], new Set(extra.map((p) => p.id))) });
});

/** M22 US6: a status photo — raw JPEG/PNG (the phone shrinks it to ≤ 1600 px first), comment-image rules. */
voice.post('/images', requireAuth, async (c) => {
  const store = c.get('images');
  if (!store.ready) throw new ApiError('storage_off', 'Photos are not switched on yet.');
  const db = c.get('db');
  const me = c.get('listener')!;
  const raw = new Uint8Array(await c.req.arrayBuffer());
  if (raw.length === 0) throw new ApiError('validation', 'The image is empty.', { fields: ['body'] });
  if (raw.length > STATUS_PHOTO_MAX_BYTES) throw new ApiError('too_large', 'An image is at most 1 MB.');
  const type = sniff(raw);
  // M25 SB (G-SB3): no EXIF/GPS, XMP or text reaches the store.
  const bytes = type ? stripImageMetadata(raw) : undefined;
  if (!type || !bytes) throw new ApiError('validation', 'Send a JPEG or PNG picture.', { fields: ['body'] });
  const [used] = await liveCommentImageBytesRows(db);
  if (Number(used?.n ?? 0) + (await statusPhotoBytes(db)) + bytes.length > c.get('imageCeilingBytes')) throw new ApiError('storage_full', 'The image store is full. Try again later.');
  const path = `statuses/${me.id}/${randomUUID()}.${type === 'image/png' ? 'png' : 'jpg'}`;
  let stored: { url: string; pathname: string };
  try {
    stored = await store.put(path, bytes, type);
  } catch (e) {
    console.error(c.get('requestId'), 'status photo put', e);
    throw new ApiError('unavailable', "Couldn't save the image. Try again.");
  }
  await recordUpload(db, { pathname: stored.pathname, url: stored.url, bytes: bytes.length, listenerId: me.id });
  return c.json({ imageKey: stored.pathname, url: stored.url }, 201);
});

voice.get('/:id', requireAuth, async (c) => {
  c.header('cache-control', 'private, no-store');
  const post = await visiblePost(c.get('db'), c.req.param('id'), c.get('listener')!.id);
  if (!post) throw new ApiError('not_found', 'No such status.');
  const [one] = await enrich(c, [post], new Set());
  return c.json(one);
});

voice.delete('/:id', requireAuth, async (c) => {
  const db = c.get('db');
  const row = await getPost(db, c.req.param('id'));
  if (!row) throw new ApiError('not_found', 'No such voice post.');
  if (row.listener_id !== c.get('listener')!.id) throw new ApiError('forbidden', 'Only the author can delete a voice post.');
  try {
    await removePost(db, c.get('voice'), row, c.get('images'));
  } catch (e) {
    console.error(c.get('requestId'), 'voice delete', e);
    throw new ApiError('unavailable', "Couldn't delete the recording just now. Try again.");
  }
  return c.body(null, 204);
});

// ---- M22 US2: replies and reactions ----

async function mustSee(c: Context<AuthEnv>) {
  const post = await visibleStatus(c.get('db'), c.req.param('id') ?? '', c.get('listener')!.id);
  if (!post) throw new ApiError('not_found', 'No such status.');
  return post;
}

voice.get('/:id/replies', requireAuth, async (c) => {
  const post = await mustSee(c);
  c.header('cache-control', 'private, no-store');
  return c.json({ items: await listReplies(c.get('db'), post, c.get('listener')!.id) });
});

voice.post('/:id/replies', requireAuth, async (c) => {
  const post = await mustSee(c);
  const db = c.get('db');
  const me = c.get('listener')!.id;
  if (isJson(c)) {
    let raw: unknown;
    try { raw = await c.req.json(); } catch { raw = undefined; }
    const body = raw && typeof raw === 'object' && typeof (raw as { body?: unknown }).body === 'string' ? (raw as { body: string }).body.trim() : '';
    if (body.length === 0) throw new ApiError('validation', 'Write something first.', { reason: 'empty', fields: ['body'] });
    if (chars(body) > REPLY_TEXT_MAX) throw new ApiError('validation', `A reply is at most ${REPLY_TEXT_MAX} characters.`, { reason: 'too_long', fields: ['body'] });
    return c.json({ id: await addTextReply(db, post, me, body) }, 201);
  }
  const storage = c.get('voice');
  if (!storage.ready) throw new ApiError('storage_off', 'Voice replies are not switched on yet.');
  const { bytes, type, ext, measured } = await readRecording(c);
  const path = `voice/${me}/replies/${randomUUID()}.${ext}`;
  let stored: { url: string; pathname: string };
  try {
    stored = await storage.put(path, bytes, type);
  } catch (e) {
    console.error(c.get('requestId'), 'voice reply put', e);
    throw new ApiError('unavailable', "Couldn't save the recording. Try again.");
  }
  const id = await addAudioReply(db, post, me, { key: stored.pathname, url: stored.url, durationMs: Math.min(VOICE_MAX_MS, Math.max(1, measured)) });
  return c.json({ id, url: stored.url }, 201);
});

voice.delete('/:id/replies/:replyId', requireAuth, async (c) => {
  const post = await mustSee(c);
  let r: 'ok' | 'not_found';
  try {
    r = await deleteReply(c.get('db'), c.get('voice'), post, c.req.param('replyId'), c.get('listener')!.id);
  } catch (e) {
    console.error(c.get('requestId'), 'voice reply delete', e);
    throw new ApiError('unavailable', "Couldn't delete the recording just now. Try again.");
  }
  if (r === 'not_found') throw new ApiError('not_found', 'No such reply.');
  return c.body(null, 204);
});

voice.put('/:id/reaction', requireAuth, async (c) => {
  const post = await mustSee(c);
  let raw: unknown;
  try { raw = await c.req.json(); } catch { raw = undefined; }
  const kind = raw && typeof raw === 'object' ? (raw as { kind?: unknown }).kind : undefined;
  if (typeof kind !== 'number' || !Number.isInteger(kind) || kind < 1 || kind > REACTION_KINDS) throw new ApiError('validation', 'kind must be 1–6.', { fields: ['kind'] });
  await setReaction(c.get('db'), post, c.get('listener')!.id, kind);
  return c.body(null, 204);
});

voice.delete('/:id/reaction', requireAuth, async (c) => {
  const post = await mustSee(c);
  await clearReaction(c.get('db'), post.id, c.get('listener')!.id);
  return c.body(null, 204);
});
