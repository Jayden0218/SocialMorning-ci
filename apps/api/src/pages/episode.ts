/**
 * M12 NEW-8 — GET /e/:id, the shareable episode link. Built like the clip page (`/c/:id`):
 * an HTML page, no player and no media — the title, the show, the artwork, "Open in
 * SocialNet" on the app's own scheme, and the publisher's own page when the feed names one.
 * The publisher's page is read from the server's cached copy of the feed only; this page
 * never fetches anything.
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { getEpisode } from '../db/repos/episodes.ts';
import { esc, mmss, page } from './clip.ts';

export const episodePages = new Hono<AuthEnv>();

const httpUrl = (v: unknown): string | undefined => (typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : undefined);

episodePages.get('/e/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const episode = /^[\w-]{1,64}$/.test(id) ? await getEpisode(db, id) : undefined;
  if (!episode) {
    return c.html(page('Episode not found', `<h1>No such episode</h1><p class="muted">The link may be wrong, or the episode was never shared from SocialNet.</p>`), 404);
  }
  const [cachedFeed] = await db.query<{ body: unknown }>('SELECT body FROM cache WHERE key = $1', [`feed:${episode.feed_url}`]);
  const feed = (typeof cachedFeed?.body === 'string' ? JSON.parse(cachedFeed.body) : cachedFeed?.body) as { show?: { link?: unknown }; episodes?: { guid?: unknown; link?: unknown }[] } | undefined;
  const publisher = httpUrl(feed?.episodes?.find((e) => e.guid === episode.guid)?.link) ?? httpUrl(feed?.show?.link);
  const at = Number(c.req.query('t'));
  const moment = Number.isInteger(at) && at > 0 ? ` <span class="muted">· at ${mmss(at)}</span>` : '';
  const art = httpUrl(episode.image_url);
  const open = `socialmorning://episode/${encodeURIComponent(episode.id)}${moment ? `?t=${at}` : ''}`;
  const getApp = /iPhone|iPad|iPod/.test(c.req.header('user-agent') ?? '')
    ? 'The iPhone app is not on the App Store yet'
    : '<a href="/get">Get SocialNet for Android</a>';
  const body = [
    art ? `<img src="${esc(art)}" alt="" width="240" height="240" style="border-radius:12px;display:block;max-width:100%;height:auto;object-fit:cover">` : '',
    `<h1>${esc(episode.title)}</h1>`,
    episode.show_title ? `<p class="muted">${esc(episode.show_title)}${moment}</p>` : moment ? `<p>${moment}</p>` : '',
    `<a class="btn" href="${esc(open)}">Open in SocialNet</a>`,
    publisher ? `<a class="btn" href="${esc(publisher)}" rel="noopener nofollow">The publisher's page</a>` : '',
    `<p class="muted">No app yet? ${getApp} — episodes play from the publisher's own audio; nothing is hosted here.</p>`,
  ].join('');
  // The link preview is the share card (FR-034), so a pasted link looks like the image a listener would send.
  const card = `${c.get('publicBase')}/v1/share/episode/${encodeURIComponent(episode.id)}.png${moment ? `?t=${at}` : ''}`;
  const og = `<meta property="og:image" content="${esc(card)}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1350">`;
  return c.html(page(episode.title, body).replace('</head>', `<meta property="og:title" content="${esc(episode.title)}">${og}</head>`));
});
