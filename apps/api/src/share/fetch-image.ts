// Fetches a publisher's cover image with a 4 s timeout and an 8 MB cap; PNG or JPEG only.
/**
 * One way to fetch somebody else's artwork (M12 FR-034's share card, M21 R6's cover tint): the
 * publisher's own image URL, a 4 s timeout, an 8 MB cap read from the header and again from the
 * bytes, and only a PNG or a JPEG as told by its first bytes (`imageKind`). Anything else —
 * a network error, a 404, an SVG, a GIF, a huge file — is `undefined`, never a throw.
 */
import { imageKind } from './card.ts';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TIMEOUT_MS = 4000;

export type FetchedImage = { mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array };

export async function fetchImage(f: typeof fetch, url: string | null | undefined): Promise<FetchedImage | undefined> {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  try {
    const res = await f(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS), headers: { accept: 'image/png, image/jpeg' } });
    if (!res.ok) return undefined;
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_IMAGE_BYTES) return undefined;
    const b = new Uint8Array(await res.arrayBuffer());
    const mime = b.length <= MAX_IMAGE_BYTES ? imageKind(b) : undefined;
    return mime ? { mime, bytes: b } : undefined;
  } catch {
    return undefined;
  }
}
