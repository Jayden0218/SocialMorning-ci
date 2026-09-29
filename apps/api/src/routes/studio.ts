/**
 * M11 — the Studio's API, `/v1/studio/*` (specs/011-m11-studio/contracts/studio-api.md).
 *
 * Order of the walls, for every route:
 *   1. `Cache-Control: private, no-store` on every response, errors included (guard G-X1):
 *      the Studio reaches us through a Vercel rewrite, which caches by upstream headers.
 *   2. CSRF: a write without `X-Studio: 1` is refused (G-X2).
 *   3. A live `studio-web` session, idle ≤ 12 h (G-S1) — except `POST /session`, which trades
 *      a fresh studio-web token for the cookie.
 *   4. `/shows/:show/*`: the caller's role on that show, or 403 `no_role` (G-A1);
 *      owner-only routes add `ownerOnly` (G-A2).
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { tokenHash, publicListener } from '../auth/session.ts';
import { STUDIO_COOKIE, STUDIO_IDLE_MS, studioAuth, studioCsrf, studioListener, studioToken, type StudioEnv } from '../auth/studio-session.ts';
import { ApiError } from '../errors.ts';
import { roleFor, showsFor } from '../db/repos/studio-roles.ts';
import { z } from 'zod';
import { json } from '../validate.ts';
import {
  EPISODE_SORTS, METRICS, alsoFollow, claimedAt, episodeCsv, episodeDetail, episodeStats, recentComments, recentEpisodes,
  sortEpisodes, totals, trend, trendCsv, validTz, yesterday, type EpisodeSort, type Metric,
} from '../db/repos/studio-numbers.ts';
import { commentOnFeed, listShowComments, setHostHidden } from '../db/repos/studio-comments.ts';
import { createComment, toPublic } from '../db/repos/comments.ts';
import { listMutes, mute, subscriberList, subscriberStats, unmute } from '../db/repos/studio-subscribers.ts';
import { edit as editAnnouncement, listAnnouncements, publish, remove as removeAnnouncement } from '../db/repos/announcements.ts';
import { closePoll, createPoll, listPolls } from '../db/repos/polls.ts';
import { getOverrides, putOverrides } from '../db/repos/show-overrides.ts';
import { addOperator, release, removeOperator, team } from '../db/repos/show-team.ts';
import { tipsFor } from '../db/repos/studio-tips.ts';
import { isBlockedBy } from '../db/repos/blocks.ts';

export type { StudioEnv };

export const studio = new Hono<StudioEnv>();

studio.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  await next();
  c.res.headers.set('Cache-Control', 'private, no-store');
});
studio.use('*', studioCsrf);

const secure = (url: string) => new URL(url).protocol === 'https:';

/**
 * Sign-in happens at `/v1/auth/sign-in` or `/v1/auth/code/verify` with `deviceLabel: 'studio-web'`
 * (one sign-in path for the whole product). The Studio then posts that token here as a Bearer
 * and gets it back as a first-party HttpOnly cookie. The body repeats the token for the
 * Bearer fallback (research R1) in case the proxy drops `Set-Cookie`.
 */
studio.post('/session', async (c) => {
  const token = studioToken(c);
  const who = token ? await studioListener(c.get('db'), c.get('pepper'), token) : undefined;
  if (who === 'expired') throw new ApiError('session_expired', 'You were away for a while. Sign in again.');
  if (!who || !token) throw new ApiError('unauthenticated', 'Sign in with deviceLabel "studio-web" first.');
  setCookie(c, STUDIO_COOKIE, token, { httpOnly: true, secure: secure(c.req.url), sameSite: 'Strict', path: '/', maxAge: STUDIO_IDLE_MS / 1000 });
  return c.json({ token, me: publicListener(who), shows: await showsFor(c.get('db'), who.id) });
});

studio.use('*', async (c, next) => (c.req.path.endsWith('/v1/studio/session') && c.req.method === 'POST' ? next() : studioAuth(c, next)));

studio.post('/session/sign-out', async (c) => {
  await c.get('db').query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(c.get('token')!, c.get('pepper'))]);
  deleteCookie(c, STUDIO_COOKIE, { path: '/', secure: secure(c.req.url) });
  return c.body(null, 204);
});

studio.get('/me', async (c) => {
  const me = c.get('listener')!;
  return c.json({ me: publicListener(me), shows: await showsFor(c.get('db'), me.id) });
});

// ---- Show scope (G-A1) ----
studio.use('/shows/:show/*', async (c, next) => {
  const show = await roleFor(c.get('db'), c.get('listener')!.id, c.req.param('show'));
  if (!show) throw new ApiError('no_role', 'You do not manage this show.');
  c.set('show', show);
  await next();
});

/** Owner-only routes (G-A2): settings, team, tips, release. */
export const ownerOnly: MiddlewareHandler<StudioEnv> = async (c, next) => {
  await next();
};

const days = (v: string | undefined): 7 | 30 | 90 => (v === '7' ? 7 : v === '90' ? 90 : 30);
const metric = (v: string | undefined): Metric => ((METRICS as readonly string[]).includes(v ?? '') ? (v as Metric) : 'plays');

studio.get('/shows/:show/overview', async (c) => {
  const db = c.get('db');
  const { feedUrl } = c.get('show');
  const [t, comments, episodes, since] = await Promise.all([
    totals(db, feedUrl), recentComments(db, feedUrl), recentEpisodes(db, feedUrl), claimedAt(db, feedUrl),
  ]);
  return c.json({ show: c.get('show'), claimedAt: since, totals: t, recentComments: comments, recentEpisodes: episodes });
});

studio.get('/shows/:show/trend', async (c) => {
  const m = metric(c.req.query('metric'));
  const n = days(c.req.query('days'));
  const tz = validTz(c.req.query('tz'));
  return c.json({ metric: m, tz, days: await trend(c.get('db'), c.get('show').feedUrl, m, n, tz) });
});

// ---- US2: Data ----

const csv = (body: string, filename: string) =>
  new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
const slug = (s: string | null) => (s ?? 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'show';

studio.get('/shows/:show/yesterday', async (c) => c.json(await yesterday(c.get('db'), c.get('show').feedUrl, validTz(c.req.query('tz')))));

studio.get('/shows/:show/top-episodes', async (c) => {
  const all = sortEpisodes(await episodeStats(c.get('db'), c.get('show').feedUrl), 'plays', 'desc');
  return c.json({ items: all.filter((e) => e.plays > 0).slice(0, 5).map((e) => ({ id: e.id, title: e.title, plays: e.plays })) });
});

studio.get('/shows/:show/also-follow', async (c) => c.json(await alsoFollow(c.get('db'), c.get('show').feedUrl)));

studio.get('/shows/:show/episodes', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  const sort = (EPISODE_SORTS as readonly string[]).includes(c.req.query('sort') ?? '') ? (c.req.query('sort') as EpisodeSort) : 'publishedAt';
  const dir = c.req.query('dir') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const all = sortEpisodes((await episodeStats(c.get('db'), c.get('show').feedUrl)).filter((e) => !q || e.title.toLowerCase().includes(q)), sort, dir);
  return c.json({ total: all.length, page, pageSize: 20, items: all.slice((page - 1) * 20, page * 20) });
});

studio.get('/shows/:show/episodes/:id', async (c) => {
  const d = await episodeDetail(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
  if (!d) throw new ApiError('not_found', 'No such episode on this show.');
  return c.json(d);
});

studio.get('/shows/:show/export/trend.csv', async (c) => {
  const m = metric(c.req.query('metric'));
  const n = days(c.req.query('days'));
  const rows = await trend(c.get('db'), c.get('show').feedUrl, m, n, validTz(c.req.query('tz')));
  return csv(trendCsv(m, rows), `${slug(c.get('show').title)}-${m}-${n}d.csv`);
});

studio.get('/shows/:show/export/episodes.csv', async (c) => {
  const all = sortEpisodes(await episodeStats(c.get('db'), c.get('show').feedUrl), 'publishedAt', 'desc');
  return csv(episodeCsv(all), `${slug(c.get('show').title)}-episodes.csv`);
});

// ---- US3: Comments ----

studio.get('/shows/:show/comments', async (c) =>
  c.json(await listShowComments(c.get('db'), c.get('show').feedUrl, {
    ...(c.req.query('q') ? { q: c.req.query('q')! } : {}),
    ...(c.req.query('episodeId') ? { episodeId: c.req.query('episodeId')! } : {}),
    ...(c.req.query('before') ? { before: c.req.query('before')! } : {}),
  })));

const replyBody = z.object({ body: z.string().trim().min(1).max(2000) });

/** The same rules as the app's POST: 5 s floor, no reply to someone who blocked you, one level deep. */
studio.post('/shows/:show/comments/:id/reply', json(replyBody), async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!;
  const parent = await commentOnFeed(db, c.get('show').feedUrl, c.req.param('id'));
  if (!parent) throw new ApiError('not_found', 'No such comment on this show.');
  const [recent] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM comments WHERE author_id = $1 AND created_at > now() - interval '5 seconds'", [me.id]);
  if (Number(recent?.n ?? 0) > 0) throw new ApiError('locked', 'One comment every few seconds, please.', { retryAfterSeconds: 5 });
  if (parent.author_id && parent.author_id !== me.id && (await isBlockedBy(db, parent.author_id, me.id))) {
    throw new ApiError('blocked', "You can't interact with this listener.");
  }
  // Reply to the thread's top comment when answering a reply (replies are one level deep).
  const created = await createComment(db, { episodeId: parent.episode_id, authorId: me.id, body: c.req.valid('json').body, parentId: parent.parent_id ?? parent.id });
  return c.json({ comment: toPublic(created, me.id) }, 201);
});

studio.post('/shows/:show/comments/:id/hide', async (c) => {
  await setHostHidden(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.get('listener')!.id, true);
  return c.body(null, 204);
});

studio.post('/shows/:show/comments/:id/unhide', async (c) => {
  await setHostHidden(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.get('listener')!.id, false);
  return c.body(null, 204);
});

// ---- US4: Subscribers and mutes ----

studio.get('/shows/:show/subscribers/stats', async (c) =>
  c.json(await subscriberStats(c.get('db'), c.get('show').feedUrl, days(c.req.query('days')), validTz(c.req.query('tz')))));

studio.get('/shows/:show/subscribers', async (c) =>
  c.json(await subscriberList(c.get('db'), c.get('show').feedUrl, Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1))));

studio.get('/shows/:show/mutes', async (c) => c.json(await listMutes(c.get('db'), c.get('show').feedUrl)));

studio.put('/shows/:show/mutes/:listenerId', async (c) => {
  await mute(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'), c.get('listener')!.id);
  return c.body(null, 204);
});

studio.delete('/shows/:show/mutes/:listenerId', async (c) => {
  await unmute(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'));
  return c.body(null, 204);
});

// ---- US5: Announcements and polls ----

const announcementBody = z.object({ body: z.string().trim().min(1).max(500) });

studio.get('/shows/:show/announcements', async (c) => c.json(await listAnnouncements(c.get('db'), c.get('show').feedUrl)));

studio.post('/shows/:show/announcements', json(announcementBody), async (c) => {
  const show = c.get('show');
  const r = await publish(c.get('db'), c.get('catalog').pushFetch, show.feedUrl, show.title, c.get('listener')!.id, c.req.valid('json').body);
  return c.json(r, 201);
});

studio.put('/shows/:show/announcements/:id', json(announcementBody), async (c) =>
  c.json({ announcement: await editAnnouncement(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.req.valid('json').body) }));

studio.delete('/shows/:show/announcements/:id', async (c) => {
  await removeAnnouncement(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
  return c.body(null, 204);
});

const pollBody = z.object({
  question: z.string().trim().min(1).max(100),
  options: z.array(z.string().trim().min(1).max(40)).min(2).max(6),
  endsAt: z.string().datetime(),
  episodeId: z.string().min(1).max(64).optional(),
});

studio.get('/shows/:show/polls', async (c) => c.json({ items: await listPolls(c.get('db'), c.get('show').feedUrl) }));

studio.post('/shows/:show/polls', json(pollBody), async (c) =>
  c.json({ poll: await createPoll(c.get('db'), c.get('show').feedUrl, c.get('listener')!.id, c.req.valid('json')) }, 201));

studio.post('/shows/:show/polls/:id/close', async (c) => {
  await closePoll(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
  return c.body(null, 204);
});

// ---- US6: Settings, team, release — owner only (G-A2) ----

const https = z.string().trim().max(2048).regex(/^https:\/\/\S+$/, 'must be an https link');
const overridesBody = z.object({
  title: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  coverUrl: https.nullable().optional(),
  themeColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  milestoneMessage: z.string().trim().max(120).nullable().optional(),
  hosts: z.array(z.string().trim().min(1).max(40)).max(5).nullable().optional(),
  links: z.array(z.object({ label: z.string().trim().min(1).max(20), url: https })).max(5).nullable().optional(),
}).strict();

studio.get('/shows/:show/overrides', ownerOnly, async (c) => c.json({ overrides: await getOverrides(c.get('db'), c.get('show').feedUrl) }));

studio.put('/shows/:show/overrides', ownerOnly, json(overridesBody), async (c) =>
  c.json({ overrides: await putOverrides(c.get('db'), c.get('show').feedUrl, c.get('listener')!.id, c.req.valid('json') as never) }));

studio.get('/shows/:show/team', ownerOnly, async (c) => c.json(await team(c.get('db'), c.get('show').feedUrl)));

studio.post('/shows/:show/team', ownerOnly, json(z.object({ email: z.string().trim().toLowerCase().email().max(254) })), async (c) => {
  await addOperator(c.get('db'), c.get('show').feedUrl, c.req.valid('json').email, c.get('listener')!.id);
  return c.json(await team(c.get('db'), c.get('show').feedUrl), 201);
});

studio.delete('/shows/:show/team/:listenerId', ownerOnly, async (c) => {
  await removeOperator(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'));
  return c.body(null, 204);
});

/** The owner types the show's title to confirm, so a stray click cannot give the show away. */
studio.post('/shows/:show/release', ownerOnly, json(z.object({ confirm: z.string() })), async (c) => {
  const show = c.get('show');
  if (c.req.valid('json').confirm.trim() !== (show.title ?? show.feedUrl).trim()) {
    throw new ApiError('validation', 'Type the show\'s name exactly to confirm.', { fields: ['confirm'] });
  }
  await release(c.get('db'), show.feedUrl);
  return c.body(null, 204);
});

// ---- US7: Tips — owner only ----

studio.get('/shows/:show/tips', ownerOnly, async (c) => c.json(await tipsFor(c.get('db'), c.get('show').feedUrl)));
