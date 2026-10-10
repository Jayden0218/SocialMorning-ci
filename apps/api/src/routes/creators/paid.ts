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
 *  - M24 US13: GET /episodes/:id/preview — anyone, signed in or not: when the creator set a free
 *    preview, a 1-hour link and the [startMs, endMs) range. The phone plays only that range
 *    (`apps/mobile/src/playback/preview.ts`).
 *  - M25 S1 (audit #1, guard G-M25-S1): that link used to be the SAME signed /audio link a buyer
 *    gets — which redirects to the whole file. Now a preview link is its own kind
 *    (`paid-preview:` in the signature, a different path, `/preview-audio`), so neither the buyer
 *    link nor the file's address can be had from it. `/preview-audio` never redirects: it reads
 *    the stored file with a Range request and answers 206 with only bytes inside the preview's
 *    window — the bytes covering [startMs, endMs] (mapped by the file's size and length, with a
 *    margin for variable bit rates), the first 256 KB (file headers), and for MP4/M4A the last
 *    512 KB (where an unoptimised file keeps its index) — at most 1 MB a request (Vercel answers
 *    ≤ 4.5 MB). A range outside the window is 416. Nothing is cut or copied: the file is the one
 *    already stored for the paid episode (constitution: no new hosted audio).
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
/** `kind` scopes the signature: a `paid-preview` link never passes as a `paid-audio` one, and back. */
const sign = (pepper: string, id: string, exp: number, kind: 'paid-audio' | 'paid-preview' = 'paid-audio') => createHmac('sha256', pepper).update(`${kind}:${id}:${exp}`).digest('hex');

function signatureOk(pepper: string, id: string, exp: number, sig: string, kind: 'paid-audio' | 'paid-preview', /** M25 SB: rotation */ next?: string): boolean {
  const got = Buffer.from(sig);
  return [pepper, ...(next ? [next] : [])].some((p) => {
    const want = Buffer.from(sign(p, id, exp, kind));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

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
    items: eps.map((e) => ({ id: e.id, episodeId: e.episodeId, title: e.title, description: e.description, durationMs: e.durationMs, publishedAt: e.publishedAt, coverUrl: e.coverUrl ?? show.coverUrl, ...(e.preview ? { preview: e.preview } : {}) })),
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

const PREVIEW_LINK_MS = 3_600_000;

paid.get('/episodes/:id/preview', async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) throw new ApiError('not_found', 'No such episode.');
  const [ep] = await c.get('db').query<{ preview_start_ms: number | null; preview_end_ms: number | null }>(
    `SELECT e.preview_start_ms, e.preview_end_ms FROM hosted_episodes e JOIN hosted_shows s ON s.id = e.show_id
      WHERE e.id = $1 AND e.paid AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND e.status = 'published' AND e.published_at <= now()`, [id]);
  if (!ep) throw new ApiError('not_found', 'No such episode.');
  if (ep.preview_start_ms === null || ep.preview_end_ms === null) throw new ApiError('needs_purchase', 'This episode has no free preview.');
  const exp = Date.now() + PREVIEW_LINK_MS;
  return c.json({
    url: `${c.get('publicBase')}/v1/hosted/episodes/${id}/preview-audio?exp=${exp}&sig=${sign(c.get('pepper'), id, exp, 'paid-preview')}`,
    expiresAt: new Date(exp).toISOString(), startMs: Number(ep.preview_start_ms), endMs: Number(ep.preview_end_ms),
  });
});

paid.get('/episodes/:id/audio', async (c) => {
  const id = c.req.param('id');
  const exp = Number(c.req.query('exp'));
  const sig = c.req.query('sig') ?? '';
  if (!UUID.test(id) || !Number.isFinite(exp) || exp < Date.now()) throw new ApiError('needs_purchase', 'This link has expired.');
  if (!signatureOk(c.get('pepper'), id, exp, sig, 'paid-audio', c.get('pepperNext'))) throw new ApiError('needs_purchase', 'This link is not valid.');
  const [ep] = await c.get('db').query<{ audio_url: string }>('SELECT audio_url FROM hosted_episodes WHERE id = $1 AND paid AND deleted_at IS NULL', [id]);
  if (!ep) throw new ApiError('not_found', 'No such episode.');
  c.header('cache-control', 'private, no-store');
  return c.redirect(ep.audio_url, 302);
});

/** M25 S1: the preview proxy's limits. */
export const PREVIEW_HEAD_BYTES = 256 * 1024;
export const PREVIEW_TAIL_BYTES = 512 * 1024;
export const PREVIEW_MARGIN_MIN_BYTES = 256 * 1024;
export const PREVIEW_CHUNK_BYTES = 1024 * 1024;

type Span = { from: number; to: number }; // inclusive byte offsets

/** The byte spans a preview may read: the file's start, the preview's window (with a margin), and an MP4's end. */
export function previewSpans(total: number, durationMs: number, startMs: number, endMs: number, type: string): Span[] {
  const at = (ms: number) => Math.floor((total * Math.min(Math.max(ms, 0), durationMs)) / durationMs);
  const a = at(startMs);
  const b = at(endMs);
  const margin = Math.max(PREVIEW_MARGIN_MIN_BYTES, Math.ceil((b - a) / 10));
  const spans: Span[] = [
    { from: 0, to: Math.min(total, PREVIEW_HEAD_BYTES) - 1 },
    { from: Math.max(0, a - margin), to: Math.min(total - 1, b + margin) },
  ];
  if (/mp4|m4a|aac/i.test(type) && total > PREVIEW_TAIL_BYTES) spans.push({ from: total - PREVIEW_TAIL_BYTES, to: total - 1 });
  return spans;
}

/** `bytes=a-b` / `bytes=a-` / none → the range to serve inside the spans (≤ one chunk), or undefined (416). */
export function previewRange(header: string | undefined, total: number, spans: readonly Span[]): Span | undefined {
  let from = 0;
  let to = total - 1;
  if (header) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
    if (!m) return undefined;
    from = Number(m[1]);
    if (m[2]) to = Math.min(Number(m[2]), total - 1);
  }
  if (from > to || from >= total) return undefined;
  const span = spans.find((s) => from >= s.from && from <= s.to);
  if (!span) return undefined;
  return { from, to: Math.min(to, span.to, from + PREVIEW_CHUNK_BYTES - 1) };
}

paid.get('/episodes/:id/preview-audio', async (c) => {
  const id = c.req.param('id');
  const exp = Number(c.req.query('exp'));
  const sig = c.req.query('sig') ?? '';
  if (!UUID.test(id) || !Number.isFinite(exp) || exp < Date.now()) throw new ApiError('needs_purchase', 'This link has expired.');
  if (!signatureOk(c.get('pepper'), id, exp, sig, 'paid-preview', c.get('pepperNext'))) throw new ApiError('needs_purchase', 'This link is not valid.');
  const [ep] = await c.get('db').query<{ audio_url: string; audio_bytes: string | number; audio_type: string; duration_ms: number | null; preview_start_ms: number | null; preview_end_ms: number | null }>(
    `SELECT e.audio_url, e.audio_bytes, e.audio_type, e.duration_ms, e.preview_start_ms, e.preview_end_ms FROM hosted_episodes e JOIN hosted_shows s ON s.id = e.show_id
      WHERE e.id = $1 AND e.paid AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND e.status = 'published' AND e.published_at <= now()`, [id]);
  if (!ep) throw new ApiError('not_found', 'No such episode.');
  if (ep.preview_start_ms === null || ep.preview_end_ms === null) throw new ApiError('needs_purchase', 'This episode has no free preview.');
  if (ep.duration_ms === null) throw new ApiError('duration_unknown', 'This preview is not ready yet.');
  const total = Number(ep.audio_bytes);
  const spans = previewSpans(total, Number(ep.duration_ms), Number(ep.preview_start_ms), Number(ep.preview_end_ms), ep.audio_type);
  const want = previewRange(c.req.header('range'), total, spans);
  c.header('cache-control', 'private, no-store');
  c.header('accept-ranges', 'bytes');
  if (!want) {
    c.header('content-range', `bytes */${total}`);
    return c.body(null, 416);
  }
  const res = await c.get('audioFetch')(ep.audio_url, { headers: { range: `bytes=${want.from}-${want.to}` } });
  if (res.status !== 206) {
    // A store that ignores Range would send the whole file: never pass that on.
    try { await res.body?.cancel(); } catch { /* nothing to drain */ }
    throw new ApiError('unavailable', 'The preview cannot be played right now.');
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const len = Math.min(bytes.length, want.to - want.from + 1);
  return new Response(bytes.slice(0, len), {
    status: 206,
    headers: {
      'content-type': ep.audio_type, 'content-length': String(len), 'content-range': `bytes ${want.from}-${want.from + len - 1}/${total}`,
      'accept-ranges': 'bytes', 'cache-control': 'private, no-store',
    },
  });
});
