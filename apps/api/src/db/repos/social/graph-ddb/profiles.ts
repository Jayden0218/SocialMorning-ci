// Profiles on DynamoDB: the listener item (lane AC) plus this lane's counts, follow state and recent activity, the same answer as before.
/**
 * M26 lane SG (patterns SG-12…SG-18), data-model.md "Lane SG changes".
 *
 * Reads the listener item through lane AC (`getListener`); the switches this lane owns (`privateListening`,
 * `hideOftenListened`) are written through lane AC's `setGraphFlags` (item + Postgres shadow). Counts, follow state
 * and recent activity are this lane's items; stats and "often listened" use lane LB's listened rollups and show
 * META; host lines, overrides and likes are lanes ST / SC rows still on Postgres (read with the old SQL); blocks are
 * lane SF's. Birthday and industry are never read here (G-M21-10).
 */
import { stats } from '@socialmorning/social-core';
import { getListener } from '../../account/ddb/common.ts';
import { setGraphFlags } from '../../account/ddb/listeners.ts';
import { stickerView } from '../../account/stickers.ts';
import { listenedRowsFor } from '../../library/listened.ts';
import { toFeedItem } from '../activity.ts';
import { OFTEN_LISTENED_DAYS, OFTEN_LISTENED_MAX, type OftenListenedShow, type ProfileOut } from '../profiles.ts';
import { hasBlocked, hiddenFeeds, pgRaw, showsByUrl, str, type Hybrid } from './common.ts';
import { counts, isFollowing } from './follows.ts';
import { recentBy } from './activity.ts';

/** M22 US17 item 6: the shows `id` listened to most in the last 90 days (by listened time), with title and artwork. */
export async function oftenListened(h: Hybrid, id: string, today: string): Promise<OftenListenedShow[]> {
  const cutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() - (OFTEN_LISTENED_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = (await listenedRowsFor(h.pg, id)).filter((r) => r.day >= cutoff);
  const top = stats(rows, today, OFTEN_LISTENED_MAX).all.topShows;
  if (top.length === 0) return [];
  const urls = top.map((t) => t.feedUrl);
  const hidden = await hiddenFeeds(h, urls);
  const over = new Map((await pgRaw(h).query<{ feed_url: string; title: string | null; cover_url: string | null }>(
    'SELECT feed_url, title, cover_url FROM show_overrides WHERE feed_url = ANY($1::text[])', [urls])).map((o) => [o.feed_url, o])); // lane ST
  const shows = await showsByUrl(h.store, urls);
  const out: OftenListenedShow[] = [];
  for (const t of top) {
    if (hidden.has(t.feedUrl)) continue; // hidden by moderation
    const o = over.get(t.feedUrl);
    const s = shows.get(t.feedUrl);
    const title = o?.title ?? str(s?.['newestTitle']) ?? t.showTitle;
    if (!title) continue;
    out.push({ feedUrl: t.feedUrl, title, imageUrl: o?.cover_url ?? str(s?.['newestImage']), listenedMs: t.listenedMs });
  }
  return out;
}

export async function setHideOftenListened(h: Hybrid, id: string, value: boolean): Promise<void> {
  await setGraphFlags(h, id, { hideOftenListened: value });
}

export async function setPrivateListening(h: Hybrid, id: string, value: boolean): Promise<void> {
  await setGraphFlags(h, id, { privateListening: value });
}

/** M21 US8 (FR-074): the shows a listener hosts — the proven claim owner or an invited host (lane ST's rows). */
export async function hostOf(h: Hybrid, listenerId: string): Promise<{ feedUrl: string; title: string }[]> {
  const l = await getListener(h, listenerId);
  if (!l || l.suspendedAt || l.hiddenAt) return [];
  const rows = await pgRaw(h).query<{ feed_url: string; title: string | null }>(
    `SELECT w.feed_url, coalesce(o.title, hs.title) AS title
       FROM (SELECT c.feed_url, 0 AS rank, c.proven_at AS since FROM creator_claims c WHERE c.listener_id = $1 AND c.status = 'proven'
             UNION
             SELECT s.feed_url, 1, s.added_at FROM show_hosts s WHERE s.listener_id = $1) w
       LEFT JOIN show_overrides o ON o.feed_url = w.feed_url
       LEFT JOIN hosted_shows hs ON hs.feed_url = w.feed_url AND hs.deleted_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM hidden_feeds x WHERE x.feed_url = w.feed_url)
      ORDER BY w.rank, w.since`,
    [listenerId],
  );
  const shows = await showsByUrl(h.store, rows.map((r) => r.feed_url));
  const seen = new Set<string>();
  const out: { feedUrl: string; title: string }[] = [];
  for (const r of rows) {
    const title = r.title ?? str(shows.get(r.feed_url)?.['newestTitle']);
    if (!title || seen.has(r.feed_url)) continue;
    seen.add(r.feed_url);
    out.push({ feedUrl: r.feed_url, title });
  }
  return out;
}

/** M21 US8 (G-M21-10): may `viewerId` read `id`'s subscriptions? */
export async function subscriptionsVisible(h: Hybrid, id: string, viewerId: string | undefined): Promise<'yes' | 'private' | 'none'> {
  const l = await getListener(h, id);
  if (!l || l.suspendedAt) return 'none';
  if (l.hiddenAt && viewerId !== id) return 'none'; // M22 US11 (G-M22-8)
  if (viewerId === id) return 'yes';
  if (l.privateSubscriptions) return 'private';
  if (viewerId && ((await hasBlocked(h, id, viewerId)) || (await hasBlocked(h, viewerId, id)))) return 'private';
  return 'yes';
}

export async function profile(h: Hybrid, id: string, viewerId: string | undefined, today: string): Promise<ProfileOut | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined; // the SQL's uuid column found nothing for these either
  const l = await getListener(h, id);
  if (!l) return undefined;
  if (l.hiddenAt && viewerId !== id) return undefined;
  const look = { ...(l.avatarUrl ? { avatarUrl: l.avatarUrl } : {}), ...(l.bio ? { bio: l.bio } : {}) };
  const bare = { id: l.id, displayName: l.displayName, ...look, followers: 0, following: 0, isFollowing: false, stats: null, recent: [], hostOf: [], privateSubscriptions: true, oftenListened: [] };
  if (l.suspendedAt) return { ...bare, suspended: true };
  if (viewerId && viewerId !== id && (await hasBlocked(h, id, viewerId))) return bare;
  const blockedByMe = viewerId && viewerId !== id ? await hasBlocked(h, viewerId, id) : false;
  const c = await counts(h, id, viewerId);
  const following = viewerId ? await isFollowing(h, viewerId, id) : false;
  const privateListening = l.privateListening === true;
  const showStats = !privateListening || viewerId === id;
  const s = showStats ? stats(await listenedRowsFor(h.pg, id), today) : null;
  const recent = (await recentBy(h, id)).map(toFeedItem);
  let likesCount: number | undefined;
  if (l.likesPublic !== false || viewerId === id) {
    const [n] = await pgRaw(h).query<{ n: number }>('SELECT count(*)::int AS n FROM episode_likes WHERE listener_id = $1', [id]); // lane SC
    likesCount = Number(n?.n ?? 0);
  }
  const m21 = { hostOf: await hostOf(h, id), ...(likesCount !== undefined ? { likesCount } : {}), privateSubscriptions: viewerId === id ? false : l.privateSubscriptions === true };
  const deco = await stickerView(h.pg, id, viewerId); // M21 US9 (lane AC)
  const self = viewerId === id;
  const hideOften = l['hideOftenListened'] === true;
  const often = self || (!hideOften && !privateListening) ? await oftenListened(h, id, today) : [];
  const m22 = { oftenListened: often, ...(self ? { hideOftenListened: hideOften } : {}) };
  const country = typeof l.country === 'string' ? l.country.trim() : '';
  return { ...deco, ...m22, id: l.id, displayName: l.displayName, ...look, followers: c.followers, following: c.following, isFollowing: following, stats: s, recent, ...m21, ...(blockedByMe ? { blockedByMe: true } : {}), ...(country ? { country } : {}) };
}
