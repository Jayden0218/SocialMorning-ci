// Gift routes: see what a gift link offers, claim it once, list the gifts I bought, and the link's web page.
/**
 * M22 US14 (FR-042–FR-044; contracts/api.md "Gift"). The gift itself is bought through
 * POST /v1/me/purchases/google with a `gift_tier_n` product; that answer carries `gift: {code, url}`.
 *  - GET  /v1/gifts/:code        → { show: {feedUrl, title, artworkUrl}, claimed, cancelled, buyerName }
 *  - POST /v1/gifts/:code/claim  → 204 · 409 already_claimed · 409 already_owned · 410 cancelled
 *  - GET  /v1/me/gifts           → the buyer's gifts with their claimed state
 *  - GET  /gift/:code            → a web page with "Open in SocialNet" (claiming needs the app and sign-in)
 * Claiming is not a purchase, so it works on both phones; buying is Android-only for now (R12).
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { claimGift, giftByCode, myGifts } from '../../db/repos/account/gifts.ts';
import { ApiError } from '../../errors.ts';
import { esc, page } from '../../pages/clip.ts';

export const gifts = new Hono<AuthEnv>();

gifts.get('/:code', optionalAuth, async (c) => c.json(await giftByCode(c.get('db'), c.req.param('code'))));

gifts.post('/:code/claim', requireAuth, async (c) => {
  await claimGift(c.get('db'), c.req.param('code'), c.get('listener')!.id);
  return c.body(null, 204);
});

export const myGiftsRoute = new Hono<AuthEnv>();

myGiftsRoute.get('/', requireAuth, async (c) => c.json(await myGifts(c.get('db'), c.get('listener')!.id, c.get('publicBase'))));

export const giftPages = new Hono<AuthEnv>();

giftPages.get('/gift/:code', async (c) => {
  const code = c.req.param('code');
  let g: Awaited<ReturnType<typeof giftByCode>>;
  try { g = await giftByCode(c.get('db'), code); } catch (e) {
    if (e instanceof ApiError && e.code === 'not_found') return c.html(page('Gift not found', '<h1>No such gift</h1><p class="muted">The link may be wrong.</p>'), 404);
    throw e;
  }
  const state = g.cancelled ? 'This gift was refunded.' : g.claimed ? 'Already claimed.' : `${g.buyerName ? esc(g.buyerName) : 'Someone'} gave you a paid series.`;
  const body = [
    g.show.artworkUrl && /^https:\/\/[^\s"'<>]+$/i.test(g.show.artworkUrl) ? `<img src="${esc(g.show.artworkUrl)}" alt="" width="240" height="240" style="border-radius:12px;display:block;max-width:100%;height:auto;object-fit:cover">` : '',
    `<h1>${esc(g.show.title)}</h1>`,
    `<p class="muted">${state}</p>`,
    !g.claimed && !g.cancelled ? `<a class="btn" href="socialmorning://gift/${encodeURIComponent(code)}">Open in SocialNet to claim it</a>` : '',
    '<p class="muted">The first person to open this in the app and sign in gets the series.</p>',
  ].join('');
  return c.html(page(g.show.title, body));
});
