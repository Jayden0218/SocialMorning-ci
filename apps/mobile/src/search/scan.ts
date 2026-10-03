/**
 * What a scanned QR code opens (M10, owner 2026-09-27). Only what the app already
 * answers on: its own `socialmorning://` links (clip, episode, show, profile), the
 * shareable `https://<api host>/c/<id>` clip link, and a podcast feed URL (its show
 * page). Anything else is not followed — a QR code can point anywhere — it goes into
 * the search box as text instead.
 */
import { looksLikeFeedUrl } from '@/discover/local-search';

export type ScanTarget =
  | { kind: 'route'; path: string }
  | { kind: 'show'; feedUrl: string }
  | { kind: 'search'; term: string };

const SCHEME = 'socialmorning://';
/** The app's own paths a code may open. `[^/?#]+` keeps each id to one segment. */
const OWN = [/^clip\/[^/?#]+$/, /^episode\/[^/?#]+$/, /^show\/[^/?#]+$/, /^profile\/[^/?#]+$/];

export function scanTarget(raw: string, apiBaseUrl: string): ScanTarget {
  const data = raw.trim();
  if (data.toLowerCase().startsWith(SCHEME)) {
    const rest = data.slice(SCHEME.length).replace(/\/+$/, '');
    if (OWN.some((re) => re.test(rest))) return { kind: 'route', path: `/${rest}` };
    return { kind: 'search', term: data };
  }
  const host = apiBaseUrl.replace(/\/+$/, '');
  const clip = new RegExp(`^${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/c/([^/?#]+)/?$`, 'i').exec(data);
  if (clip?.[1]) return { kind: 'route', path: `/clip/${clip[1]}` };
  if (looksLikeFeedUrl(data)) return { kind: 'show', feedUrl: data };
  return { kind: 'search', term: data };
}
