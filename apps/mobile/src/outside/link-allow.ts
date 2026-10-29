// Decides which socialmorning:// links from publisher content may open a screen in the app.
/**
 * M32 B7. A `socialmorning://` link inside show notes or chapters is publisher-controlled, so it
 * may only reach screens that show content. Account-changing screens (gift, redeem, purchase,
 * wallet, tips, settings …) and anything unknown are denied. Other schemes are not decided here
 * (`external`). Built on `knownRoute` so the route patterns stay the app's own.
 */
import { knownRoute } from '@/launch/choose';

export type LinkAllow = { kind: 'app'; path: string } | { kind: 'denied' } | { kind: 'external' };

/** Content screens only (expo-router patterns; `[x]` is one segment). */
export const CONTENT_ROUTES: readonly string[] = [
  '/', '/following', '/library',
  '/academy', '/academy/[slug]', '/categories', '/category/[id]', '/chart',
  '/episode/[id]', '/show/[feedUrl]', '/clip/[id]', '/issue/[id]', '/issues', '/picks/past',
  '/profile/[id]', '/search',
];

export function linkAllow(raw: string): LinkAllow {
  const url = raw.trim();
  if (!/^socialmorning:/i.test(url)) return { kind: 'external' };
  const rest = url.replace(/^socialmorning:/i, '').replace(/#.*$/, '');
  const qAt = rest.indexOf('?');
  const pathPart = qAt === -1 ? rest : rest.slice(0, qAt);
  const query = qAt === -1 ? '' : rest.slice(qAt);
  if (pathPart.includes('\\')) return { kind: 'denied' };
  const segs = pathPart.split('/').filter((s) => s.length > 0);
  for (const s of segs) {
    let decoded: string;
    try { decoded = decodeURIComponent(s); } catch { return { kind: 'denied' }; }
    if (decoded === '.' || decoded === '..' || decoded.includes('\\')) return { kind: 'denied' };
  }
  if (segs.length === 0) return { kind: 'denied' };
  const path = `/${segs.join('/')}`;
  if (!knownRoute(path, CONTENT_ROUTES)) return { kind: 'denied' };
  return { kind: 'app', path: path + query };
}
