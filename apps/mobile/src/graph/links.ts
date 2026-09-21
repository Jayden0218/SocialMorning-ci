/**
 * Clip links (research R1). Two forms for one clip:
 *   https://<api host>/c/<id>   — shareable; an Android App Link when the domain verifies,
 *                                 otherwise the page's "Open in app" button
 *   socialmorning://clip/<id>   — the app's own scheme; what the page's button opens
 * `parseClipLink` accepts both, so the route can be reached either way.
 */
export const CLIP_SCHEME_PREFIX = 'socialmorning://clip/';

export function clipLinkFor(id: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/c/${encodeURIComponent(id)}`;
}

export function clipSchemeLinkFor(id: string): string {
  return `${CLIP_SCHEME_PREFIX}${encodeURIComponent(id)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The clip id in a link, or undefined when the URL is not a clip link. */
export function parseClipLink(url: string): string | undefined {
  let id: string | undefined;
  if (url.startsWith(CLIP_SCHEME_PREFIX)) id = url.slice(CLIP_SCHEME_PREFIX.length);
  else {
    const m = /^https?:\/\/[^/]+\/c\/([^/?#]+)/i.exec(url);
    if (m) id = m[1];
  }
  if (id === undefined) return undefined;
  try { id = decodeURIComponent(id); } catch { return undefined; }
  return UUID.test(id) ? id.toLowerCase() : undefined;
}
