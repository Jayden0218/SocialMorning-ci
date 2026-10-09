// Public web card for a show: cover, name, description, latest episodes.
/**
 * M14 US9 — GET /show/<key>: a public card for a show (claimed or created), like 小宇宙's 播客名片.
 * Cover, name, description, latest episodes, "Open in the app". No personal data; every value
 * escaped (FR-10). 404 for a show nobody has claimed or created.
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { showKey } from '../db/repos/studio/studio-roles.ts';
import { provenFeedRows, showCardEpisodeRows, showCardInfoRows } from '../db/repos/social/public-pages.ts';
import { esc, page } from './clip.ts';

export const showCard = new Hono<AuthEnv>();

showCard.get('/:key', async (c) => {
  const db = c.get('db');
  const key = c.req.param('key');
  if (!/^[0-9a-f]{16}$/.test(key)) return c.html(page('Not found', '<h1>No such show</h1>'), 404);
  const feeds = await provenFeedRows(db);
  const feedUrl = feeds.map((f) => f.feed_url).find((f) => showKey(f) === key);
  if (!feedUrl) return c.html(page('Not found', '<h1>No such show</h1><p class="muted">It may have been removed.</p>'), 404);
  const [info] = await showCardInfoRows(db, feedUrl);
  // M24 US11: hidden episodes leave this list.
  const eps = await showCardEpisodeRows(db, feedUrl);
  const title = info?.title ?? 'A podcast on SocialNet';
  const openInApp = `socialmorning://show/${encodeURIComponent(feedUrl)}`;
  c.header('cache-control', 'public, max-age=300');
  return c.html(page(title, `
${info?.cover && /^https:\/\//.test(info.cover) ? `<img src="${esc(info.cover)}" alt="" width="160" height="160" style="border-radius:16px;object-fit:cover">` : ''}
<h1 style="margin:16px 0 8px">${esc(title)}</h1>
${info?.description ? `<p class="muted">${esc(info.description.slice(0, 400))}</p>` : ''}
${eps.length ? `<h2 style="font-size:17px">Latest episodes</h2><ul>${eps.map((e) => `<li>${esc(e.title)}${e.published_at ? ` <span class="muted">· ${esc(new Date(e.published_at).toISOString().slice(0, 10))}</span>` : ''}</li>`).join('')}</ul>` : ''}
<a class="btn" href="${esc(openInApp)}">Open in SocialNet</a> <a class="btn" href="/get" style="background:#fff;color:#111;border:1px solid #111">Get the app</a>`));
});
