import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { createFeedback, IMAGE_MAX_BYTES, IMAGES_MAX, sniff, type ImageIn } from '../../db/repos/account/feedback.ts';

/**
 * Mounted at /v1/feedback (M10b US6). Signed in or not. The only route allowed a body
 * larger than 16 KB (3 images × ≤ 250 000 bytes, base64) — see the body limit in app.ts.
 */
const body = z.object({
  kind: z.string().min(1).max(60),
  body: z.string().min(1).max(2000),
  appVersion: z.string().max(40).optional(),
  images: z.array(z.object({ mime: z.enum(['image/jpeg', 'image/png']), base64: z.string().max(400_000) })).max(IMAGES_MAX).optional(),
});

export const feedback = new Hono<AuthEnv>();

feedback.post('/', optionalAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  const images: ImageIn[] = [];
  for (const img of b.images ?? []) {
    const bytes = Uint8Array.from(Buffer.from(img.base64, 'base64'));
    if (bytes.length > IMAGE_MAX_BYTES) return c.json({ error: 'validation', message: `Each image must be at most ${IMAGE_MAX_BYTES} bytes.` }, 413);
    const real = sniff(bytes);
    if (real === undefined || real !== img.mime) return c.json({ error: 'validation', message: 'Only JPEG or PNG images.' }, 422);
    images.push({ mime: real, bytes });
  }
  const id = await createFeedback(c.get('db'), { listenerId: c.get('listener')?.id ?? null, kind: b.kind, body: b.body, ...(b.appVersion ? { appVersion: b.appVersion } : {}), images });
  return c.json({ id });
});
