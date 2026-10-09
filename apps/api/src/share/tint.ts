// Works out a cover's average colour as #rrggbb, cached by image URL for 30 days.
/**
 * M21 US4/US5 (research R6): the cover tint of the episode and show pages, worked out on the
 * server so the phone needs no native module. The cover is fetched with the share card's
 * fetcher (`fetch-image.ts`: 4 s, 8 MB, PNG/JPEG only), laid into an SVG as a data URI,
 * rasterised by the resvg already installed at a small size, and its opaque pixels averaged.
 *
 * Results are kept in the `cache` table under `tint:<imageUrl>`: a colour for 30 days, "no
 * usable colour" (null) for a day, so a cover that was down is tried again tomorrow.
 *
 * A read never waits on this for more than `waitMs` (1 s): past that it answers null and the
 * work carries on, so the colour is in the cache for the next read (Principle IV — the page
 * draws on paper meanwhile). The phone decides how much of the colour it can use (`tintFor`).
 */
import { Resvg } from '@resvg/resvg-wasm';
import type { Db } from '../db/db.ts';
import { tintCacheRows, writeTintCache } from '../db/repos/tint-cache.ts';
import { assets } from './card.ts';
import { fetchImage, type FetchedImage } from './fetch-image.ts';

export const TINT_TTL_MS = 30 * 86_400_000;
/** A cover with no usable colour (gone, not an image) is asked again after a day. */
export const TINT_MISS_TTL_MS = 86_400_000;
export const TINT_WAIT_MS = 1000;
/** The side of the small render whose pixels are averaged. */
const SAMPLE = 32;

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** The average colour of a PNG or JPEG, or null when it cannot be drawn. */
export async function averageHex(img: FetchedImage): Promise<string | null> {
  await assets(); // starts resvg's WebAssembly once per process (shared with the share card)
  const href = `data:${img.mime};base64,${Buffer.from(img.bytes).toString('base64')}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SAMPLE}" height="${SAMPLE}" viewBox="0 0 ${SAMPLE} ${SAMPLE}">`
    + `<image x="0" y="0" width="${SAMPLE}" height="${SAMPLE}" preserveAspectRatio="none" xlink:href="${href}"/></svg>`;
  try {
    // No background: an image resvg cannot decode is skipped, leaving every pixel clear (→ null).
    // Only fully opaque pixels count — there premultiplied and straight RGBA are the same.
    const out = new Resvg(svg, { fitTo: { mode: 'width', value: SAMPLE } }).render();
    const px = out.pixels;
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let i = 0; i + 3 < px.length; i += 4) {
      if (px[i + 3] !== 255) continue;
      r += px[i]!; g += px[i + 1]!; b += px[i + 2]!; n++;
    }
    if (n === 0) return null;
    return `#${hex2(r / n)}${hex2(g / n)}${hex2(b / n)}`;
  } catch {
    return null;
  }
}

/** Fetch and average; null on any failure. */
export async function computeTint(f: typeof fetch, url: string): Promise<string | null> {
  const img = await fetchImage(f, url);
  return img ? averageHex(img) : null;
}

const inFlight = new Map<string, Promise<string | null>>();

async function readCached(db: Db, key: string, now: number): Promise<{ hex: string | null } | undefined> {
  const [row] = await tintCacheRows(db, key);
  if (!row) return undefined;
  // Either jsonb shape: an object (postgres) or a JSON string (see repos/cache.ts).
  const body = (typeof row.body === 'string' ? JSON.parse(row.body) : row.body) as { hex?: unknown };
  const hex = typeof body?.hex === 'string' && /^#[0-9a-f]{6}$/.test(body.hex) ? body.hex : null;
  const age = now - new Date(row.fetched_at).getTime();
  return age < (hex ? TINT_TTL_MS : TINT_MISS_TTL_MS) ? { hex } : undefined;
}

async function work(db: Db, f: typeof fetch, url: string, key: string, now: () => number): Promise<string | null> {
  let hex: string | null = null;
  try { hex = await computeTint(f, url); } catch { hex = null; }
  try {
    await writeTintCache(db, key, JSON.stringify({ hex }), now());
  } catch { /* the colour is still returned; the next read works it out again */ }
  return hex;
}

/**
 * The cover's tint for a page read: from the cache, or worked out now if that takes at most
 * `waitMs`; otherwise null while the work finishes in the background.
 */
export async function tintOf(db: Db, f: typeof fetch, url: string | null | undefined, opts: { waitMs?: number; now?: () => number } = {}): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url) || url.length > 2048) return null;
  const now = opts.now ?? Date.now;
  const key = `tint:${url}`;
  try {
    const hit = await readCached(db, key, now());
    if (hit) return hit.hex;
  } catch { return null; }
  let job = inFlight.get(key);
  if (!job) {
    job = work(db, f, url, key, now).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), opts.waitMs ?? TINT_WAIT_MS); });
  try {
    return await Promise.race([job, late]);
  } finally {
    clearTimeout(timer);
  }
}
