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
import { hostPicks, latestAnnouncementRows, newestEpisodeImageRows, showHosts, showInfo, subscriberCount } from '../../db/repos/studio/show-page.ts';
import { insertShareEvent, recentShareCountRows } from '../../db/repos/studio/share-events.ts';
import { tintOf } from '../../share/tint.ts';
import { hiddenGuids } from '../../db/repos/studio/hidden-episodes.ts';

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
  const [overrides, announcements, polls, hosts, curator, subscribers, people, picks, hidden] = await Promise.all([
    getOverrides(db, feedUrl),
    latestAnnouncementRows(db, feedUrl),
    pollsForApp(db, feedUrl, viewer?.id),
    listHosts(db, feedUrl),
    // M15 T029 (D3): an admin-made account that shares this external show — "Shared by", never host.
    curatorFor(db, feedUrl).catch(() => null),
    subscriberCount(db, feedUrl),
    showHosts(db, feedUrl),
    hostPicks(db, feedUrl),
    // M24 US11: the guids the creator hid — the phone parses the feed itself and drops these.
    hiddenGuids(db, feedUrl),
  ]);
  // The cover the page draws: the Studio's own, else the one the phone has, else the newest episode's.
  let cover = overrides?.coverUrl ?? image;
  if (!cover) {
    const [e] = await newestEpisodeImageRows(db, feedUrl);
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
    hiddenGuids: hidden,
  });
});

/** M24 US11: the guids of a show's hidden episodes, alone (the phone's feed refresh can ask for just these). */
extras.get('/shows/hidden-episodes', async (c) => {
  const feedUrl = feedUrlOf(c.req.query('feedUrl'));
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ guids: await hiddenGuids(c.get('db'), feedUrl) });
});

/** M21 US5 (FR-041): the Show info page — who owns the show, their country, the feed. */
extras.get('/shows/info', async (c) => {
  const feedUrl = feedUrlOf(c.req.query('feedUrl'));
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(await showInfo(c.get('db'), feedUrl));
});

/**
 * A vote. M24 US14: on a multiple-choice poll `optionIdx` toggles that one option (so a phone that
 * sends one tap at a time can pick several), and `optionIdxs` sets the whole choice at once.
 */
extras.post('/polls/:id/vote', requireAuth, json(z.object({ optionIdx: z.number().int().min(0).max(5).optional(), optionIdxs: z.array(z.number().int().min(0).max(5)).min(1).max(6).optional() })
  .refine((b) => (b.optionIdx === undefined) !== (b.optionIdxs === undefined), 'Send optionIdx or optionIdxs.')), async (c) => {
  const b = c.req.valid('json');
  return c.json({ poll: await vote(c.get('db'), c.req.param('id'), c.get('listener')!.id, b.optionIdxs ?? b.optionIdx!, b.optionIdxs !== undefined) });
});

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
    const [recent] = await recentShareCountRows(db, me.id);
    if (Number(recent?.n ?? 0) >= 30) return c.body(null, 204); // a burst is not 30 shares; drop quietly
  }
  await insertShareEvent(db, me?.id ?? null, b.targetKind, b.targetId, b.feedUrl);
  return c.body(null, 204);
});
