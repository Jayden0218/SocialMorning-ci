// Paid episode routes: a show's paid episodes, and a short-lived audio link for a listener who bought them.
/**
 * M20 US6 (spec FR-024; contracts/api.md; research R6). Mounted at /v1/hosted.
 *  - GET /paid?feedUrl= — the show's price, its paid episodes (live ones), whether you bought them,
 *    and what the phone passes to Google: the product id and `profileId` = fnv1a64(feed URL).
 *  - GET /episodes/:id/access — for a listener who bought the show: an audio link good for 6 hours.
 *  - GET /episodes/:id/audio?exp=&sig= — checks the link's signature, then redirects to the file.
 * A paid episode is not in the public feed and not in the app's episode table. Stated plainly
 * (research R6/T061): the file itself is in the PUBLIC episodes store under an unguessable name —
 * a Vercel function cannot stream it privately (responses are capped at 4.5 MB), so whoever is
 * given the final address can still fetch it. NOT a DRM guarantee.
 */
import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fnv1a64 } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { hostedByFeed, listHostedEpisodes } from '../../db/repos/studio/hosted.ts';
import { tierProduct } from '../../billing/products.ts';

export const paid = new Hono<AuthEnv>();

const LINK_MS = 6 * 3_600_000;
const UUID = /^[0-9a-f-]{36}$/i;
const sign = (pepper: string, id: string, exp: number) => createHmac('sha256', pepper).update(`paid-audio:${id}:${exp}`).digest('hex');

async function bought(db: import('../../db/db.ts').Db, listenerId: string | undefined, feedUrl: string): Promise<boolean> {
  if (!listenerId) return false;
  const [r] = await db.query("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show' AND ref = $2", [listenerId, feedUrl]);
  return Boolean(r);
}

paid.get('/paid', optionalAuth, async (c) => {
  const feedUrl = c.req.query('feedUrl') ?? '';
  const show = feedUrl ? await hostedByFeed(c.get('db'), feedUrl) : undefined;
  if (!show || show.priceTier === null) return c.json({ forSale: false, items: [] });
  const eps = await listHostedEpisodes(c.get('db'), show.id, { liveOnly: true, paidOnly: true });
  return c.json({
    forSale: true,
    productId: tierProduct(show.priceTier),
    profileId: fnv1a64(show.feedUrl),
    bought: await bought(c.get('db'), c.get('listener')?.id, show.feedUrl),
    items: eps.map((e) => ({ id: e.id, episodeId: e.episodeId, title: e.title, description: e.description, durationMs: e.durationMs, publishedAt: e.publishedAt, coverUrl: e.coverUrl ?? show.coverUrl })),
  });
});

paid.get('/episodes/:id/access', requireAuth, async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) throw new ApiError('not_found', 'No such episode.');
  const db = c.get('db');
  const [ep] = await db.query<{ feed_url: string }>(
    `SELECT s.feed_url FROM hosted_episodes e JOIN hosted_shows s ON s.id = e.show_id
      WHERE e.id = $1 AND e.paid AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND e.status = 'published' AND e.published_at <= now()`, [id]);
  if (!ep) throw new ApiError('not_found', 'No such episode.');
  if (!(await bought(db, c.get('listener')!.id, ep.feed_url))) throw new ApiError('needs_purchase', 'Buy this show to play its paid episodes.');
  const exp = Date.now() + LINK_MS;
  return c.json({ url: `${c.get('publicBase')}/v1/hosted/episodes/${id}/audio?exp=${exp}&sig=${sign(c.get('pepper'), id, exp)}`, expiresAt: new Date(exp).toISOString() });
});

paid.get('/episodes/:id/audio', async (c) => {
  const id = c.req.param('id');
  const exp = Number(c.req.query('exp'));
  const sig = c.req.query('sig') ?? '';
  if (!UUID.test(id) || !Number.isFinite(exp) || exp < Date.now()) throw new ApiError('needs_purchase', 'This link has expired.');
  const want = Buffer.from(sign(c.get('pepper'), id, exp));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw new ApiError('needs_purchase', 'This link is not valid.');
  const [ep] = await c.get('db').query<{ audio_url: string }>('SELECT audio_url FROM hosted_episodes WHERE id = $1 AND paid AND deleted_at IS NULL', [id]);
  if (!ep) throw new ApiError('not_found', 'No such episode.');
  c.header('cache-control', 'private, no-store');
  return c.redirect(ep.audio_url, 302);
});
