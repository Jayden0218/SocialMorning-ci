// App routes for creator features: show extras, poll votes, and share events.
/**
 * M11 — what the APP reads and writes for a show's creator features (contracts/studio-api.md,
 * "App-facing"). The show page fetches RSS on the phone (research R7), so the creator's
 * overrides, announcements and polls arrive in ONE call made after the feed has loaded; if it
 * fails, the page stays exactly as the feed draws it (Principle IV).
 *
 * M21 US4/US5: the same call carries what the show and episode pages add — the cover `tint`
 * (`share/tint.ts`; null while it is first worked out, never more than ~1 s of waiting), our
 * `subscribers` count, the `hosts` with faces, and the `hostPicks`. The phone passes the cover it
 * draws: `image` (the feed's show cover; a Studio cover wins over it) and, on an episode page,
 * `episodeImage`, whose tint comes back as `episodeTint`. `GET /shows/info?feedUrl=` is the Show
 * info page — a query string like its sibling, so the feed URL never travels as a path segment.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { pollsForApp, vote } from '../../db/repos/studio/polls.ts';
import { getOverrides } from '../../db/repos/studio/show-overrides.ts';
import { listHosts } from '../../db/repos/studio/show-hosts.ts';
import { curatorFor } from '../../db/repos/studio/curators.ts';
import { imagesOf } from '../../db/repos/studio/announcements.ts';
import { hostPicks, showHosts, showInfo, subscriberCount } from '../../db/repos/studio/show-page.ts';
import { tintOf } from '../../share/tint.ts';

export const extras = new Hono<AuthEnv>();

const feedUrlOf = (v: string | undefined): string => {
  const feedUrl = v ?? '';
  if (!/^https?:\/\//.test(feedUrl) || feedUrl.length > 2048) throw new ApiError('validation', 'feedUrl is required.', { fields: ['feedUrl'] });
  return feedUrl;
};
const imageOf = (v: string | undefined): string | undefined => (v && /^https?:\/\//.test(v) && v.length <= 2048 ? v : undefined);

extras.get('/shows/extras', optionalAuth, async (c) => {
  const feedUrl = feedUrlOf(c.req.query('feedUrl'));
  const db = c.get('db');
  const viewer = c.get('listener');
  const f = c.get('imageFetch');
  const image = imageOf(c.req.query('image'));
  const episodeImage = imageOf(c.req.query('episodeImage'));
  const [overrides, announcements, polls, hosts, curator, subscribers, people, picks] = await Promise.all([
    getOverrides(db, feedUrl),
    db.query<{ id: string; body: string; created_at: Date | string; edited_at: Date | string | null; images: unknown }>(
      'SELECT id, body, created_at, edited_at, images FROM announcements WHERE feed_url = $1 AND deleted_at IS NULL AND release_at <= now() ORDER BY created_at DESC LIMIT 3', [feedUrl]),
    pollsForApp(db, feedUrl, viewer?.id),
    listHosts(db, feedUrl),
    // M15 T029 (D3): an admin-made account that shares this external show — "Shared by", never host.
    curatorFor(db, feedUrl).catch(() => null),
    subscriberCount(db, feedUrl),
    showHosts(db, feedUrl),
    hostPicks(db, feedUrl),
  ]);
  // The cover the page draws: the Studio's own, else the one the phone has, else the newest episode's.
  let cover = overrides?.coverUrl ?? image;
  if (!cover) {
    const [e] = await db.query<{ image_url: string }>('SELECT image_url FROM episodes WHERE feed_url = $1 AND image_url IS NOT NULL ORDER BY published_at DESC NULLS LAST LIMIT 1', [feedUrl]);
    cover = e?.image_url;
  }
  const [tint, episodeTint] = await Promise.all([tintOf(db, f, cover), episodeImage ? tintOf(db, f, episodeImage) : Promise.resolve(undefined)]);
  c.header('Cache-Control', viewer ? 'private, no-store' : 'public, max-age=60');
  return c.json({
    overrides,
    announcements: announcements.map((a) => ({ id: a.id, body: a.body, createdAt: new Date(a.created_at).toISOString(), edited: a.edited_at !== null, images: imagesOf(a.images) })),
    polls,
    // M14: invited hosts (real accounts) and whether tips are switched on.
    hostAccounts: hosts.map((h) => ({ id: h.id, displayName: h.displayName })),
    tipsEnabled: overrides?.tipsEnabled ?? false,
    curator,
    // M21 US4/US5.
    tint,
    ...(episodeTint !== undefined ? { episodeTint } : {}),
    subscribers,
    hosts: people,
    hostPicks: picks,
  });
});

/** M21 US5 (FR-041): the Show info page — who owns the show, their country, the feed. */
extras.get('/shows/info', async (c) => {
  const feedUrl = feedUrlOf(c.req.query('feedUrl'));
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(await showInfo(c.get('db'), feedUrl));
});

extras.post('/polls/:id/vote', requireAuth, json(z.object({ optionIdx: z.number().int().min(0).max(5) })), async (c) =>
  c.json({ poll: await vote(c.get('db'), c.req.param('id'), c.get('listener')!.id, c.req.valid('json').optionIdx) }));

const shareBody = z.object({
  targetKind: z.enum(['episode', 'clip', 'show']),
  targetId: z.string().min(1).max(2048),
  feedUrl: z.string().url().max(2048),
});

/** FR-011: the share sheet opened. Anonymous is fine; the phone never waits for this. */
extras.post('/shares', optionalAuth, json(shareBody), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  const me = c.get('listener');
  if (me) {
    const [recent] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM share_events WHERE listener_id = $1 AND at > now() - interval '1 minute'", [me.id]);
    if (Number(recent?.n ?? 0) >= 30) return c.body(null, 204); // a burst is not 30 shares; drop quietly
  }
  await db.query('INSERT INTO share_events (listener_id, target_kind, target_id, feed_url) VALUES ($1, $2, $3, $4)', [me?.id ?? null, b.targetKind, b.targetId, b.feedUrl]);
  return c.body(null, 204);
});
