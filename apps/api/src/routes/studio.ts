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
import { createClaim, myClaims, verifyClaim } from '../db/repos/creator.ts';
import {
  CATEGORIES, createHostedShow, hostedByFeed, listHostedEpisodes, publishEpisode, removeEpisode, storedBytes, updateHostedShow,
} from '../db/repos/hosted.ts';
import { AUDIO_TYPES, IMAGE_TYPES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from '../storage/episodes-blob.ts';
import { randomUUID } from 'node:crypto';
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

// ---- Claiming a show from the Studio (the app's M10b flow, on the web) ----
// A person with no show lands here first. Ownership is still proven the same way: the code must
// appear in the live feed (M10b guard G-C1), so nobody reaches another creator's data by asking.

studio.get('/claims', async (c) => c.json({ claims: await myClaims(c.get('db'), c.get('listener')!.id) }));

studio.post('/claims', json(z.object({ feedUrl: z.string().trim().url().max(2048).regex(/^https?:\/\//) })), async (c) =>
  c.json({ claim: await createClaim(c.get('db'), c.get('listener')!.id, c.req.valid('json').feedUrl) }, 201));

studio.post('/claims/:id/verify', async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!;
  const r = await verifyClaim(db, c.get('catalog').fetch, me.id, c.req.param('id')).catch(() => ({ status: 'pending' as const }));
  if (r === 'not_found') throw new ApiError('not_found', 'No such claim.');
  if (r === 'taken') throw new ApiError('conflict', 'Someone else has already proved this show is theirs.');
  return c.json({ status: r.status, shows: await showsFor(db, me.id) });
});

// ---- M13: create a show here (specs/013-m13-create-show US1) ----

const showDetails = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000).optional(),
  author: z.string().trim().max(100).optional(),
  language: z.string().regex(/^[a-z]{2}(-[A-Za-z]{2,4})?$/).optional(),
  category: z.enum(CATEGORIES).optional(),
  explicit: z.boolean().optional(),
});

studio.post('/hosted-shows', json(showDetails), async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!;
  const [n] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM hosted_shows WHERE owner_id = $1 AND deleted_at IS NULL', [me.id]);
  if (Number(n?.n ?? 0) >= 5) throw new ApiError('conflict', 'One account can create 5 shows.', { reason: 'too_many_shows' });
  const show = await createHostedShow(db, me.id, c.get('publicBase'), c.req.valid('json'));
  return c.json({ show, shows: await showsFor(db, me.id) }, 201);
});

studio.get('/storage', async (c) =>
  c.json({ ready: c.get('storage').ready, usedBytes: await storedBytes(c.get('db')), ceilingBytes: c.get('hostedCeilingBytes'), maxAudioBytes: MAX_AUDIO_BYTES }));

// ---- Show scope (G-A1) ----
studio.use('/shows/:show/*', async (c, next) => {
  const show = await roleFor(c.get('db'), c.get('listener')!.id, c.req.param('show'));
  if (!show) throw new ApiError('no_role', 'You do not manage this show.');
  c.set('show', show);
  await next();
});

/** Owner-only routes (G-A2): settings, team, tips, release. */
export const ownerOnly: MiddlewareHandler<StudioEnv> = async (c, next) => {
  if (c.get('show').role !== 'owner') throw new ApiError('owner_only', 'Only the owner of this show can do this.');
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
  const hosted = await hostedByFeed(c.get('db'), show.feedUrl);
  await release(c.get('db'), show.feedUrl);
  if (hosted) {
    // A show made here has no other home: giving it back deletes it and its audio (the feed answers 410).
    const eps = await listHostedEpisodes(c.get('db'), hosted.id);
    await c.get('db').query('UPDATE hosted_shows SET deleted_at = now() WHERE id = $1', [hosted.id]);
    await c.get('db').query('UPDATE hosted_episodes SET deleted_at = now() WHERE show_id = $1 AND deleted_at IS NULL', [hosted.id]);
    for (const e of eps) await c.get('storage').remove(e.audioUrl).catch(() => undefined);
  }
  return c.body(null, 204);
});

// ---- US7: Tips — owner only ----

studio.get('/shows/:show/tips', ownerOnly, async (c) => c.json(await tipsFor(c.get('db'), c.get('show').feedUrl)));

// ---- M13: a created show's details, uploads and episodes (US2, US3) ----

/** The created show behind this Studio show, or 404 — a claimed feed has no uploads. */
async function hostedOf(db: import('../db/db.ts').Db, feedUrl: string) {
  const h = await hostedByFeed(db, feedUrl);
  if (!h) throw new ApiError('not_found', 'This show comes from another feed; its episodes are published there.');
  return h;
}

studio.get('/shows/:show/details', async (c) => c.json({ show: await hostedOf(c.get('db'), c.get('show').feedUrl) }));

studio.put('/shows/:show/details', ownerOnly, json(showDetails.partial().extend({ coverUrl: z.string().url().nullable().optional() })), async (c) => {
  const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
  const b = c.req.valid('json');
  if (b.coverUrl) {
    const f = await c.get('storage').head(b.coverUrl);
    if (!f || !f.pathname.startsWith(`covers/${h.id}/`) || !IMAGE_TYPES.includes(f.contentType)) throw new ApiError('validation', 'Upload the cover first.', { fields: ['coverUrl'] });
    b.coverUrl = f.url;
  }
  return c.json({ show: await updateHostedShow(c.get('db'), h.id, b) });
});

const uploadBody = z.object({
  kind: z.enum(['audio', 'cover']),
  contentType: z.string().max(100),
  size: z.number().int().positive(),
});

/** A 1-hour token for ONE path under this show, the allowed types and the size limit (FR-005). */
studio.post('/shows/:show/uploads', json(uploadBody), async (c) => {
  const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
  const storage = c.get('storage');
  if (!storage.ready) throw new ApiError('unavailable', 'The audio store is not connected yet. The owner connects it once in Vercel (Storage → socialmorning-episodes).');
  const b = c.req.valid('json');
  const audio = b.kind === 'audio';
  const types = audio ? AUDIO_TYPES : IMAGE_TYPES;
  const max = audio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (!types.includes(b.contentType)) throw new ApiError('validation', audio ? 'Upload an MP3 or M4A file.' : 'Upload a JPEG or PNG image.', { fields: ['contentType'] });
  if (b.size > max) throw new ApiError('validation', `The file is over ${Math.round(max / 1024 / 1024)} MB.`, { fields: ['size'] });
  if (audio) {
    const used = await storedBytes(c.get('db'));
    const ceiling = c.get('hostedCeilingBytes');
    if (used + b.size > ceiling) throw new ApiError('conflict', `Storage is full: ${Math.round(used / 1024 / 1024)} MB of ${Math.round(ceiling / 1024 / 1024)} MB used.`, { reason: 'storage_full', usedBytes: used, ceilingBytes: ceiling });
  }
  const ext = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'image/jpeg': 'jpg', 'image/png': 'png' }[b.contentType] ?? 'bin';
  const pathname = `${audio ? 'episodes' : 'covers'}/${h.id}/${randomUUID()}.${ext}`;
  return c.json({ pathname, token: await storage.uploadToken(pathname, { maxBytes: max, types }) });
});

studio.get('/shows/:show/hosted-episodes', async (c) => c.json({ items: await listHostedEpisodes(c.get('db'), (await hostedOf(c.get('db'), c.get('show').feedUrl)).id) }));

const publishBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(''),
  audioUrl: z.string().url(),
  durationMs: z.number().int().positive().max(24 * 3600 * 1000).nullable().optional(),
});

/** Publish: the file must really be in our store, under THIS show, audio, within limits (FR-006). */
studio.post('/shows/:show/hosted-episodes', json(publishBody), async (c) => {
  const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
  const b = c.req.valid('json');
  const storage = c.get('storage');
  const f = await storage.head(b.audioUrl);
  if (!f || !f.pathname.startsWith(`episodes/${h.id}/`)) throw new ApiError('validation', 'That audio was not uploaded to this show.', { fields: ['audioUrl'] });
  if (!AUDIO_TYPES.includes(f.contentType) || f.size > MAX_AUDIO_BYTES) {
    await storage.remove(f.url);
    throw new ApiError('validation', 'That file is not an MP3 or M4A under 200 MB.', { fields: ['audioUrl'] });
  }
  const used = await storedBytes(c.get('db'));
  if (used + f.size > c.get('hostedCeilingBytes')) {
    await storage.remove(f.url);
    throw new ApiError('conflict', 'Storage is full.', { reason: 'storage_full' });
  }
  const ep = await publishEpisode(c.get('db'), h, c.get('listener')!.id, { title: b.title, description: b.description, audioUrl: f.url, audioBytes: f.size, audioType: f.contentType, durationMs: b.durationMs ?? null });
  return c.json({ episode: ep }, 201);
});

/** Unpublish and delete the audio (FR-007, guard G-D1). Comments on it stay, like any episode that leaves a feed. */
studio.delete('/shows/:show/hosted-episodes/:id', async (c) => {
  const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
  const ep = await removeEpisode(c.get('db'), h.id, c.req.param('id'));
  if (!ep) throw new ApiError('not_found', 'No such episode.');
  await c.get('storage').remove(ep.audioUrl);
  return c.body(null, 204);
});
