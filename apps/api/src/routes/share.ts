import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { getEpisode } from '../db/repos/episodes.ts';
import { imageKind, renderCard, type CardInput } from '../share/card.ts';

/**
 * M12 FR-034 — mounted at /v1/share. GET /episode/:id.png?t=<ms>: the share card. Public,
 * cached a day by anyone. The artwork is fetched from the publisher's own image URL with a
 * short timeout and a size cap; if it cannot be had, the card is drawn without it.
 */
export const share = new Hono<AuthEnv>();

const MAX_ART_BYTES = 8 * 1024 * 1024;

async function artwork(f: typeof fetch, url: string | null): Promise<CardInput['art']> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  try {
    const res = await f(url, { signal: AbortSignal.timeout(4000), headers: { accept: 'image/png, image/jpeg' } });
    if (!res.ok) return undefined;
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_ART_BYTES) return undefined;
    const b = new Uint8Array(await res.arrayBuffer());
    const mime = b.length <= MAX_ART_BYTES ? imageKind(b) : undefined;
    return mime ? { mime, bytes: b } : undefined;
  } catch {
    return undefined;
  }
}

share.get('/episode/:file', async (c) => {
  const m = /^([\w-]{1,64})\.png$/.exec(c.req.param('file'));
  if (!m) throw new ApiError('not_found', 'No such card.');
  const db = c.get('db');
  const episode = await getEpisode(db, m[1]!);
  if (!episode) throw new ApiError('not_found', 'No such episode here yet.');
  const t = Number(c.req.query('t'));
  const atMs = Number.isInteger(t) && t >= 0 ? t : undefined;
  let imageUrl = episode.image_url;
  if (!imageUrl) {
    const [other] = await db.query<{ image_url: string }>('SELECT image_url FROM episodes WHERE feed_url = $1 AND image_url IS NOT NULL LIMIT 1', [episode.feed_url]);
    imageUrl = other?.image_url ?? null;
  }
  const f = c.get('imageFetch');
  const base: CardInput = { title: episode.title, show: episode.show_title, ...(atMs !== undefined ? { atMs } : {}) };
  const art = await artwork(f, imageUrl);
  let png: Uint8Array;
  try {
    png = await renderCard(art ? { ...base, art } : base, f);
  } catch (e) {
    // An image the renderer cannot decode is not a reason to fail the share: draw the plain card.
    if (!art) throw e;
    console.warn(c.get('requestId'), 'share card: artwork not drawable', e instanceof Error ? e.message : String(e));
    png = await renderCard(base, f);
  }
  return c.body(png as unknown as ArrayBuffer, 200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
});
