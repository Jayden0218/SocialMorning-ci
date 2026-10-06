// Purchase route: the phone sends a Google Play purchase; the server checks it with Google, then grants it.
/**
 * M20 US6 (spec FR-020–FR-026; contracts/api.md "Purchases") — POST /v1/me/purchases/google
 * { productId, purchaseToken, feedUrl? }. Nothing is granted on the phone's word: the server asks
 * Google (`grantGoogle`). The phone finishes the transaction only after this answers 200. Teen mode
 * lives on the phone (its passcode never leaves it), so the phone hides every buy button there.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { grantGoogle } from '../../db/repos/account/purchases.ts';
import { GooglePlayError } from '../../billing/google-play.ts';

export const purchasesGoogle = new Hono<AuthEnv>();

const body = z.object({
  productId: z.string().min(1).max(100),
  purchaseToken: z.string().min(1).max(4096),
  feedUrl: z.string().url().max(2048).optional(),
});

purchasesGoogle.post('/purchases/google', requireAuth, json(body), async (c) => {
  const play = c.get('play');
  if (!play.ready) throw new ApiError('storage_off', 'Purchases are not available yet.');
  const b = c.req.valid('json');
  try {
    const g = await grantGoogle(c.get('db'), play, { listenerId: c.get('listener')!.id, productId: b.productId, purchaseToken: b.purchaseToken, ...(b.feedUrl ? { feedUrl: b.feedUrl } : {}) });
    return c.json({ purchase: g });
  } catch (e) {
    if (e instanceof GooglePlayError) {
      // 404/410 from Google: no such purchase. Anything else: Google is not answering now.
      if (e.status === 404 || e.status === 410 || e.status === 400) throw new ApiError('not_paid', 'Google does not know this purchase.');
      console.error(c.get('requestId'), 'google play', e.message);
      throw new ApiError('unavailable', "Couldn't reach Google Play. Try again.");
    }
    throw e;
  }
});
