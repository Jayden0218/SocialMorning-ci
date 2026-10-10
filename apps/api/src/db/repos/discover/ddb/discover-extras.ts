// Discover's extra parts on DynamoDB: pick counts, followed shows, new arrivals, what people said, video episodes.
/**
 * M26 lane DV (DV-02…DV-07). Live reads, as the SQL (a moderation action shows at once):
 * - statsFor: listeners = distinct public actors of the episode's listen index (listens.ts, guard G2); comments =
 *   lane SC's `commentCount` on `EP#<id>/SOCIAL` (top-level, not deleted, removed or host-hidden — kept in each
 *   comment's own transaction).
 * - followedHere: lane LB's `Q#feeds` (a show META while it has a live subscriber, with `subscriberCount`); titles from
 *   the parsed feed lane LB cached, else the show META's newest title and cover.
 * - newArrivals: lane ST's `hosted_shows` and the Studio episodes it promoted — still Postgres in this lane's hybrid
 *   (lane ST owns them; listed for CUT).
 * - said / saidByIds: each listener's comment index (activity-stats.ts `recentTopComments`), the comment items, the
 *   authors' listener items.
 * - videoEpisodes: the catalogue (src/jobs/charts.ts).
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { catalogueItems } from '../../../../jobs/charts.ts';
import type { EpisodeCard } from '../../../../catalog/apple.ts';
import { hiddenFeedUrls } from '../../safety/moderation.ts';
import { hiddenEpisodeIds } from '../../studio/hidden-episodes.ts';
import { readEntry } from '../../library/ddb/cache.ts';
import type { ItemStats } from '../discover.ts';
import { ARRIVALS_SHOWN, FOLLOWED_SHOWN, SAID_DAYS, SAID_SHOWN, type FollowedHere, type FollowedShow, type NewArrival, type Said } from '../discover-extras.ts';
import { commentItemsOf, recentTopComments } from './activity-stats.ts';
import { allListeners, DAY_MS, epRowOf, episodesByIds, iso, isUuid, listenersByIds, mapLimit, nowMs, pgOf, type EpRow } from './common.ts';
import { listensOf } from './listens.ts';

export async function statsFor(store: Store, _db: Db, episodeIds: readonly string[]): Promise<Map<string, ItemStats>> {
  const out = new Map<string, ItemStats>();
  const ids = [...new Set(episodeIds)];
  if (ids.length === 0) return out;
  const social = new Map((await batchGetAll(store, 'main', ids.map((id) => K.episodeSocial(id)), { consistent: false })).map((s) => [String(s['episodeId']), Number(s['commentCount'] ?? 0)]));
  const listeners = await mapLimit(ids, 8, async (id) => new Set((await listensOf(store, id)).filter((m) => !m.hidden).map((m) => m.actorId)).size);
  ids.forEach((id, i) => out.set(id, { listeners: listeners[i]!, comments: Math.max(0, social.get(id) ?? 0) }));
  return out;
}

const feedShowOf = (body: unknown): { title?: string; imageUrl?: string; author?: string } => {
  const show = (body as { show?: { title?: string; imageUrl?: string; author?: string } } | null)?.show;
  return show ? { ...(show.title ? { title: show.title } : {}), ...(show.imageUrl ? { imageUrl: show.imageUrl } : {}), ...(show.author ? { author: show.author } : {}) } : {};
};

export async function followedHere(store: Store, db: Db): Promise<FollowedHere> {
  const hidden = await hiddenFeedUrls(db);
  const { items } = await queryAll(store, 'main', { IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#feeds' } });
  const feeds = items
    .filter((s) => s['t'] === 'show' && Number(s['subscriberCount'] ?? 0) > 0 && typeof s['feedUrl'] === 'string' && !hidden.has(String(s['feedUrl'])))
    .map((s) => ({ feedUrl: String(s['feedUrl']), followers: Number(s['subscriberCount']), title: s['newestTitle'], image: s['newestImage'] }))
    .sort((a, b) => b.followers - a.followers || (a.feedUrl < b.feedUrl ? -1 : a.feedUrl > b.feedUrl ? 1 : 0));
  const shows: FollowedShow[] = [];
  for (const r of feeds.slice(0, 30)) {
    if (shows.length >= FOLLOWED_SHOWN) break;
    let meta: ReturnType<typeof feedShowOf> = {};
    try { meta = feedShowOf((await readEntry(store, `feed:${r.feedUrl}`))?.body ?? null); } catch { meta = {}; }
    const title = meta.title ?? (typeof r.title === 'string' && r.title !== '' ? r.title : undefined);
    if (!title) continue;
    const imageUrl = meta.imageUrl ?? (typeof r.image === 'string' ? r.image : undefined);
    shows.push({ feedUrl: r.feedUrl, title, ...(imageUrl ? { imageUrl } : {}), ...(meta.author ? { author: meta.author } : {}), followers: r.followers });
  }
  return { total: feeds.length, shows };
}

/** Studio-made shows, newest first, each with its newest live episode — lane ST's tables, still read in Postgres. */
export async function newArrivals(_store: Store, db: Db, limit: number = ARRIVALS_SHOWN): Promise<NewArrival[]> {
  const pg = pgOf(db);
  const { newArrivalsPg } = await import('../discover-extras.ts');
  return newArrivalsPg(pg, limit);
}

const toSaid = (c: Item, e: EpRow): Said => ({
  commentId: String(c['id']), authorId: String(c['authorId']), body: String(c['body']), createdAt: String(c['createdAt']),
  episode: {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url,
    ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: e.duration_ms } : {}),
    ...(e.published_at ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
  },
});

/** The SQL's filters on a comment that may be shown: top-level, not deleted/removed/host-hidden, with words, by a visible author, on a visible show and episode. */
function sayable(c: Item | undefined, e: EpRow | undefined, author: Item | undefined, hidden: ReadonlySet<string>, hiddenEps: ReadonlySet<string>): boolean {
  if (!c || !e || !author) return false;
  if (c['parentId'] || c['deletedAt'] || c['removedAt'] || c['hostHiddenAt'] || typeof c['body'] !== 'string') return false;
  if (author['suspendedAt'] || author['hiddenAt']) return false;
  return !hidden.has(e.feed_url) && !hiddenEps.has(e.id);
}

export async function said(store: Store, db: Db, limit: number = SAID_SHOWN): Promise<Said[]> {
  const since = iso(nowMs(store) - SAID_DAYS * DAY_MS);
  const authors = (await allListeners(store)).filter((l) => !l['suspendedAt'] && !l['hiddenAt']);
  const byAuthor = new Map(authors.map((l) => [String(l['id']), l]));
  const [hidden, hiddenEps] = await Promise.all([hiddenFeedUrls(db), hiddenEpisodeIds(db)]);
  const cands = (await recentTopComments(store, since, authors))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const out: Said[] = [];
  for (let i = 0; i < cands.length && out.length < limit; i += limit * 2) {
    const part = cands.slice(i, i + limit * 2);
    const [items, eps] = await Promise.all([commentItemsOf(store, part), episodesByIds(store, part.map((c) => c.episodeId))]);
    for (const c of part) {
      if (out.length >= limit) break;
      const it = items.get(c.id);
      const e = eps.get(c.episodeId);
      if (!sayable(it, e, byAuthor.get(c.authorId), hidden, hiddenEps)) continue;
      out.push(toSaid(it!, e!));
    }
  }
  return out;
}

export async function saidByIds(store: Store, db: Db, ids: readonly string[]): Promise<Said[]> {
  const ok = [...new Set(ids.filter(isUuid))];
  if (ok.length === 0) return [];
  const refs = await batchGetAll(store, 'main', ok.map((id) => K.commentRef(id)));
  const items = await commentItemsOf(store, refs.map((r) => ({ episodeId: String(r['episodeId']), sk: String(r['sk']) })));
  const list = [...items.values()];
  const [eps, people, hidden, hiddenEps] = await Promise.all([
    episodesByIds(store, list.map((c) => String(c['episodeId']))),
    listenersByIds(store, list.flatMap((c) => (typeof c['authorId'] === 'string' ? [String(c['authorId'])] : []))),
    hiddenFeedUrls(db), hiddenEpisodeIds(db),
  ]);
  return list.filter((c) => sayable(c, eps.get(String(c['episodeId'])), people.get(String(c['authorId'])), hidden, hiddenEps))
    .map((c) => toSaid(c, eps.get(String(c['episodeId']))!));
}

/** M10b US5: the newest video episodes the server knows, hidden shows and episodes left out. */
export async function videoEpisodes(store: Store, db: Db, limit = 10): Promise<{ kind: 'trending'; key: string; episode: EpisodeCard & { id: string; mediaKind: 'video' } }[]> {
  const [hidden, hiddenEps] = await Promise.all([hiddenFeedUrls(db), hiddenEpisodeIds(db)]);
  const rows = (await catalogueItems(store)).map(epRowOf)
    .filter((e) => e.media_kind === 'video' && !hidden.has(e.feed_url) && !hiddenEps.has(e.id))
    .sort((a, b) => {
      if (a.published_at !== b.published_at) {
        if (a.published_at === null) return 1;
        if (b.published_at === null) return -1;
        return a.published_at < b.published_at ? 1 : -1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
  return rows.map((r) => ({
    kind: 'trending' as const,
    key: `${r.feed_url}\u0001${r.guid}`,
    episode: {
      id: r.id, feedUrl: r.feed_url, guid: r.guid, title: r.title, showTitle: r.show_title ?? '', enclosureUrl: r.enclosure_url, mediaKind: 'video' as const,
      ...(r.image_url ? { imageUrl: r.image_url } : {}), ...(r.duration_ms !== null ? { durationMs: r.duration_ms } : {}),
      ...(r.published_at ? { publishedAt: new Date(r.published_at).toISOString() } : {}),
    },
  }));
}

