// Feedback route: text signed in or not; up to three images, signed in only and limited.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { createFeedback, feedbackImageBytes, imagesSentToday, IMAGE_MAX_BYTES, IMAGES_MAX, sniff, type ImageIn } from '../../db/repos/account/feedback.ts';
import { ApiError } from '../../errors.ts';
import { clientAddress, DAY_MS, HOUR_MS, limit } from '../../auth/rate.ts';

/**
 * Mounted at /v1/feedback (M10b US6). Signed in or not. The only route allowed a body
 * larger than 16 KB (3 images × ≤ 250 000 bytes, base64) — see the body limit in app.ts.
 *
 * M23 US3 (FR-005, G-M23-4): pictures only from a signed-in listener, at most 5 feedback
 * messages with pictures a day each, and all feedback pictures together stay under a ceiling
 * (`FEEDBACK_IMAGE_CEILING_BYTES`, default 200 MB). Text alone is still taken from anyone.
 * M23 US8: `errors` — the phone's last 20 error lines, sent only when the listener agrees.
 */
export const IMAGE_MESSAGES_PER_DAY = 5;
export const DEFAULT_FEEDBACK_IMAGE_CEILING = 200_000_000;
export const ERROR_LINES_MAX = 20;
/** M25 S6 (audit #9): signed-out feedback per network address an hour, and for the whole server a day. */
export const SIGNED_OUT_FEEDBACK_PER_ADDRESS_HOUR = 10;
export const SIGNED_OUT_FEEDBACK_PER_DAY = 500;
/** M25 S6: feedback from one account a day. */
export const FEEDBACK_PER_ACCOUNT_DAY = 30;

function imageCeiling(): number {
  const n = Number(process.env['FEEDBACK_IMAGE_CEILING_BYTES']);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FEEDBACK_IMAGE_CEILING;
}
const body = z.object({
  kind: z.string().min(1).max(60),
  body: z.string().min(1).max(2000),
  appVersion: z.string().max(40).optional(),
  images: z.array(z.object({ mime: z.enum(['image/jpeg', 'image/png']), base64: z.string().max(400_000) })).max(IMAGES_MAX).optional(),
  errors: z.array(z.string().max(300)).max(ERROR_LINES_MAX).optional(),
});

export const feedback = new Hono<AuthEnv>();

feedback.post('/', optionalAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  const listener = c.get('listener');
  if (listener) {
    await limit(db, `feedback:l:${listener.id}`, DAY_MS, FEEDBACK_PER_ACCOUNT_DAY, 'You have sent a lot of feedback today. Try again tomorrow.');
  } else {
    const addr = clientAddress(c);
    if (addr) await limit(db, `feedback:ip:${addr}`, HOUR_MS, SIGNED_OUT_FEEDBACK_PER_ADDRESS_HOUR, 'Too much feedback from this network. Try again in an hour, or sign in.');
    await limit(db, 'feedback:anon:global', DAY_MS, SIGNED_OUT_FEEDBACK_PER_DAY, 'We cannot take more feedback from signed-out phones today. Sign in, or try tomorrow.');
  }
  const images: ImageIn[] = [];
  if ((b.images ?? []).length > 0) {
    if (!listener) throw new ApiError('unauthenticated', 'Sign in to send pictures. Text alone can be sent signed out.');
    if ((await imagesSentToday(db, listener.id)) >= IMAGE_MESSAGES_PER_DAY) {
      throw new ApiError('locked', `At most ${IMAGE_MESSAGES_PER_DAY} messages with pictures a day. Send text, or try tomorrow.`);
    }
  }
  for (const img of b.images ?? []) {
    const bytes = Uint8Array.from(Buffer.from(img.base64, 'base64'));
    if (bytes.length > IMAGE_MAX_BYTES) throw new ApiError('too_large', `Each image must be at most ${IMAGE_MAX_BYTES} bytes.`);
    const real = sniff(bytes);
    if (real === undefined || real !== img.mime) throw new ApiError('validation', 'Only JPEG or PNG images.');
    images.push({ mime: real, bytes });
  }
  if (images.length > 0) {
    const adding = images.reduce((n, i) => n + i.bytes.length, 0);
    if ((await feedbackImageBytes(db)) + adding > imageCeiling()) {
      throw new ApiError('storage_full', 'Feedback pictures are full for now. Send text instead.');
    }
  }
  // US8: the error lines go after the listener's words, inside the 2000-character body.
  const text = b.errors && b.errors.length > 0 ? `${b.body}\n\n--- Last errors ---\n${b.errors.join('\n')}`.slice(0, 2000) : b.body;
  const id = await createFeedback(db, { listenerId: listener?.id ?? null, kind: b.kind, body: text, ...(b.appVersion ? { appVersion: b.appVersion } : {}), images });
  return c.json({ id });
});
