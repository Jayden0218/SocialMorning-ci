/**
 * M10 additions to Discover (2026-09-27): per-pick counts, "followed here", "what people
 * said", and the owner's collections. All of it is optional on the wire so an older build
 * keeps working, and none of it names a listener: counts are counts, and a comment
 * carries its author's id, never a display name (guard G6).
 *
 * `followedHere`, `said` and `stats` are live queries — cheap, and a moderation action
 * (remove, suspend, hide) must take effect at once rather than when an hour's cache
 * expires. Collections go through feeds, so they are cached like picks.
 */
import { hash } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { cached, TTL } from '../cache.ts';
import { fetchFeed, registerCard, toCard } from '../../../catalog/feed.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';
import type { CollectionIn } from '../../../catalog/collections.ts';
import type { DiscoverItem, ItemStats } from './discover.ts';

export type FollowedShow = { feedUrl: string; title: string; imageUrl?: string; author?: string; followers: number };
export type FollowedHere = { total: number; shows: FollowedShow[] };
export type Said = { commentId: string; authorId: string; body: string; createdAt: string; episode: EpisodeCard & { id: string } };
export type Collection = { id: string; title: string; subtitle?: string; items: DiscoverItem[] };

export const FOLLOWED_SHOWN = 9;
export const SAID_SHOWN = 6;
export const SAID_DAYS = 14;
/** At most this many distinct feeds are fetched to rebuild the collections (the function's time budget). */
export const COLLECTION_FEEDS_MAX = 12;

const iso = (v: string | Date | null): string | undefined => (v === null ? undefined : new Date(v).toISOString());

/**
 * Per-episode counts for pick cards. ALL-TIME, not a window: a pick can be months old, and
 * "40 listened" means more than "0 this week". Listeners: distinct public `listened`
 * actors (the `hidden` flag keeps private listeners out, guard G2). Comments: top-level,
 * neither deleted by the author nor removed by moderation.
 */
export async function statsFor(db: Db, episodeIds: readonly string[]): Promise<Map<string, ItemStats>> {
  const out = new Map<string, ItemStats>();
  if (episodeIds.length === 0) return out;
  const rows = await db.query<{ id: string; listeners: number; comments: number }>(
    `WITH ids AS (SELECT DISTINCT value AS id FROM jsonb_array_elements_text(($1::text)::jsonb))
     SELECT ids.id,
            (SELECT count(DISTINCT a.actor_id)::int FROM activity a WHERE a.episode_id = ids.id AND a.kind = 'listened' AND a.hidden = false) AS listeners,
            (SELECT count(*)::int FROM comments c WHERE c.episode_id = ids.id AND c.parent_id IS NULL AND c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL) AS comments
     FROM ids`,
    [JSON.stringify(episodeIds)],
  );
  for (const r of rows) out.set(r.id, { listeners: Number(r.listeners), comments: Number(r.comments) });
  return out;
}

export function withStats(items: readonly DiscoverItem[], stats: ReadonlyMap<string, ItemStats>): DiscoverItem[] {
  return items.map((i) => {
    const s = stats.get(i.episode.id);
    return s ? { ...i, stats: s } : i;
  });
}

type ShowMeta = { title?: string; imageUrl?: string; author?: string };
const feedShowOf = (body: unknown): ShowMeta => {
  const b = (typeof body === 'string' ? JSON.parse(body) : body) as { show?: ShowMeta } | null;
  const show = b?.show;
  return show ? { ...(show.title ? { title: show.title } : {}), ...(show.imageUrl ? { imageUrl: show.imageUrl } : {}), ...(show.author ? { author: show.author } : {}) } : {};
};

/**
 * Shows followed on this server: live subscriptions only (`deleted_at IS NULL` — a
 * tombstone is not a follower, guard G-M1), grouped by feed, most followers first; a
 * hidden show is left out of the list AND the total. Title and art come from what the
 * server already holds — the cached parsed feed, else the newest registered episode. A
 * feed we know no title for is counted but not listed: a card with no name is no card.
 */
export async function followedHere(db: Db): Promise<FollowedHere> {
  const rows = await db.query<{ feed_url: string; followers: number; total: number; show_title: string | null; image_url: string | null; feed_body: unknown }>(
    `WITH f AS (
       SELECT s.feed_url, count(*)::int AS followers FROM subscriptions s
       WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = s.feed_url)
       GROUP BY s.feed_url
     ),
     top AS (SELECT feed_url, followers, (count(*) OVER ())::int AS total FROM f ORDER BY followers DESC, feed_url LIMIT 30)
     SELECT top.feed_url, top.followers, top.total, e.show_title, e.image_url, c.body AS feed_body
     FROM top
     LEFT JOIN LATERAL (SELECT show_title, image_url FROM episodes WHERE episodes.feed_url = top.feed_url AND show_title IS NOT NULL AND show_title <> '' ORDER BY updated_at DESC LIMIT 1) e ON true
     LEFT JOIN cache c ON c.key = 'feed:' || top.feed_url
     ORDER BY top.followers DESC, top.feed_url`,
  );
  const shows: FollowedShow[] = [];
  for (const r of rows) {
    if (shows.length >= FOLLOWED_SHOWN) break;
    let meta: ShowMeta = {};
    try { meta = r.feed_body == null ? {} : feedShowOf(r.feed_body); } catch { meta = {}; }
    const title = meta.title ?? r.show_title ?? undefined;
    if (!title) continue;
    const imageUrl = meta.imageUrl ?? r.image_url ?? undefined;
    shows.push({ feedUrl: r.feed_url, title, ...(imageUrl ? { imageUrl } : {}), ...(meta.author ? { author: meta.author } : {}), followers: Number(r.followers) });
  }
  return { total: rows[0] ? Number(rows[0].total) : 0, shows };
}

/**
 * "What people said": the newest top-level comments of the last 14 days. Out: deleted by
 * the author, removed by moderation, empty, by a suspended listener or a deleted account,
 * or on a hidden show. The author travels as an id only — no display name is selected,
 * so none can leak (guard G6).
 */
export async function said(db: Db): Promise<Said[]> {
  const rows = await db.query<{ id: string; author_id: string; body: string; created_at: string | Date; episode_id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at: string | Date | null }>(
    `SELECT c.id, c.author_id, c.body, c.created_at,
            e.id AS episode_id, e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url, e.published_at
     FROM comments c
     JOIN episodes e ON e.id = c.episode_id
     JOIN listeners l ON l.id = c.author_id
     WHERE c.parent_id IS NULL AND c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL AND c.body IS NOT NULL
       AND l.suspended_at IS NULL
       AND c.created_at > now() - ($1 || ' days')::interval
       AND NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = e.feed_url)
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $2`,
    [String(SAID_DAYS), SAID_SHOWN],
  );
  return rows.map((r) => {
    const publishedAt = iso(r.published_at);
    return {
      commentId: r.id, authorId: r.author_id, body: r.body, createdAt: iso(r.created_at)!,
      episode: {
        id: r.episode_id, feedUrl: r.feed_url, guid: r.guid, title: r.title, showTitle: r.show_title ?? '', enclosureUrl: r.enclosure_url,
        ...(r.image_url ? { imageUrl: r.image_url } : {}), ...(r.duration_ms !== null ? { durationMs: r.duration_ms } : {}),
        ...(publishedAt ? { publishedAt } : {}),
      },
    };
  });
}

/**
 * The owner's collections, each item resolved exactly like a pick (feedUrl + optional
 * guid; no guid = the show's latest). Cached an hour under a key that carries the file's
 * hash, so an edited collections.json shows on the next request. Feeds are cached per
 * feed already (the seed reuses the picks' feeds), and at most COLLECTION_FEEDS_MAX are
 * touched. A bad item is a warning; a collection left with nothing is dropped.
 */
export async function resolveCollections(db: Db, f: typeof fetch, collections: readonly CollectionIn[]): Promise<{ collections: Collection[]; warnings: string[] }> {
  if (collections.length === 0) return { collections: [], warnings: [] };
  const r = await cached<{ collections: Collection[]; warnings: string[] }>(db, `discover:collections:${hash(JSON.stringify(collections))}`, TTL.discover, async () => {
    const warnings: string[] = [];
    const feeds = new Set<string>();
    const out: Collection[] = [];
    for (const c of collections) {
      const items: DiscoverItem[] = [];
      const keys = new Set<string>();
      for (const it of c.items) {
        if (!feeds.has(it.feedUrl) && feeds.size >= COLLECTION_FEEDS_MAX) { warnings.push(`collection ${c.id}: over ${COLLECTION_FEEDS_MAX} feeds, ${it.feedUrl} skipped`); continue; }
        feeds.add(it.feedUrl);
        try {
          const { feed } = await fetchFeed(db, f, it.feedUrl);
          const episode = it.guid === undefined ? feed.episodes[0] : feed.episodes.find((e) => e.guid === it.guid);
          if (!episode) { warnings.push(`collection ${c.id} ${it.feedUrl} ${it.guid ?? '(show)'}: episode not in the feed`); continue; }
          const card = toCard(it.feedUrl, feed.show, episode);
          const key = `${card.feedUrl}\u0001${card.guid}`;
          if (keys.has(key)) continue;
          keys.add(key);
          const row = await registerCard(db, card);
          items.push({ kind: 'pick', key, episode: { ...card, id: row.id }, ...(it.why !== undefined ? { why: it.why } : {}) });
        } catch (e) {
          warnings.push(`collection ${c.id} ${it.feedUrl}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (items.length > 0) out.push({ id: c.id, title: c.title, ...(c.subtitle !== undefined ? { subtitle: c.subtitle } : {}), items });
      else warnings.push(`collection ${c.id}: no item resolved`);
    }
    return { collections: out, warnings };
  });
  return r.body;
}

/** Serve-time: a hidden show leaves every collection at once; an emptied collection goes. */
export function collectionsWithoutHidden(cols: readonly Collection[], hidden: ReadonlySet<string>): Collection[] {
  if (hidden.size === 0) return [...cols];
  return cols.map((c) => ({ ...c, items: c.items.filter((i) => !hidden.has(i.episode.feedUrl)) })).filter((c) => c.items.length > 0);
}


/**
 * M10b US5 — "Podcasts you can watch": the newest video episodes SocialNet has registered
 * (from feeds, charts and picks), at most 10, hidden shows left out. Live, not cached.
 */
export async function videoEpisodes(db: Db, limit = 10): Promise<{ kind: 'trending'; key: string; episode: EpisodeCard & { id: string; mediaKind: 'video' } }[]> {
  const rows = await db.query<{ id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at: string | Date | null }>(
    `SELECT e.id, e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url, e.published_at
     FROM episodes e
     WHERE e.media_kind = 'video' AND NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = e.feed_url)
     ORDER BY e.published_at DESC NULLS LAST, e.id LIMIT $1`,
    [limit],
  );
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
