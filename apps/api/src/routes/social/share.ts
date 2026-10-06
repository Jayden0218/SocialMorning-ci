// Share card routes: draw a PNG for sharing an episode moment, or lines from its transcript as a quote.
import { Hono, type Context } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { getEpisode } from '../../db/repos/library/episodes.ts';
import { QUOTE_MAX, renderCard, type CardInput } from '../../share/card.ts';
import { fetchImage } from '../../share/fetch-image.ts';

/**
 * M12 FR-034 — mounted at /v1/share. GET /episode/:id.png?t=<ms>: the share card. Public,
 * cached a day by anyone. The artwork is fetched from the publisher's own image URL with a
 * short timeout and a size cap (`share/fetch-image.ts`); if it cannot be had, the card is drawn without it.
 */
export const share = new Hono<AuthEnv>();

share.get('/episode/:file', (c) => drawCard(c));

/**
 * M20 US1 (FR-001): GET /quote/:id.png?t=<ms>&q=<text> — the same card with lines from the
 * transcript as a quote. `q` is at most 280 characters (a longer one is refused, not cut, so a
 * sender never shares words the reader does not see). Public and cached like the moment card.
 */
share.get('/quote/:file', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length === 0 || q.length > QUOTE_MAX) throw new ApiError('validation', `A quote is 1 to ${QUOTE_MAX} characters.`, { fields: ['q'] });
  return drawCard(c, q);
});

async function drawCard(c: Context<AuthEnv>, quote?: string): Promise<Response> {
  const m = /^([\w-]{1,64})\.png$/.exec(c.req.param('file') ?? '');
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
  const base: CardInput = { title: episode.title, show: episode.show_title, ...(atMs !== undefined ? { atMs } : {}), ...(quote ? { quote } : {}) };
  const art: CardInput['art'] = await fetchImage(f, imageUrl);
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
}
