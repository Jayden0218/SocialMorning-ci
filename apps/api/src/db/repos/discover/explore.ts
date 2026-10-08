// Explore lists: the three charts, the treasure hunt, the new-shows plaza, and followed faces on picks.
/**
 * M21 US7 (specs/022-m21-the-xiaoyuzhou-gaps, T080). Everything here is computed from the
 * episodes the server already knows; nothing fetches a feed. Counts only, never names, except
 * `likedBy`, which shows a viewer the faces of people they follow (likes are public by choice,
 * M19 `likes_public`). A show the owner hid is left out of every list (M6 FR-014).
 *
 * The three charts, in plain words (the phone's chart-rules page says the same):
 * - talked — "Talked about": listens, comments, clips and reactions in the last 7 days, weighted
 *   3/2/2/1 (Discover's ranking, M5 R4).
 * - new — "New shows": shows whose earliest episode the server knows of is the most recent. A
 *   show the server met through one late episode looks new; that is the limit of what we store.
 * - rising — "Rising": listens plus comments in the last 7 days minus the 7 days before; only
 *   episodes that grew, biggest growth first.
 * Each chart is cached for 5 minutes (`CHART_TTL`), so "Updated" on the phone is at most 5 min old.
 *
 * The treasure hunt and the plaza are OUR OWN DESIGN (owner, 2026-10-06), not a copy of 小宇宙.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../../db.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';
import { cached } from '../cache.ts';
import { hiddenFeedUrls } from '../safety/moderation.ts';
import { talkedAboutChart, type DiscoverItem } from './discover.ts';

export const CHART_KINDS = ['talked', 'new', 'rising'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export type ChartItem = DiscoverItem & { rank: number };
export const CHART_TTL = 5 * 60_000;
const CHART_STORED = 100;

type EpRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at: Date | string | null };
const EP_COLS = 'e.id, e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.duration_ms, e.enclosure_url, e.published_at';
const NOT_HIDDEN = 'NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = e.feed_url)';
const keyOf = (c: { feedUrl: string; guid: string }) => `${c.feedUrl}\u0001${c.guid}`;

export function cardOf(e: EpRow): EpisodeCard & { id: string } {
  return {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url,
    ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}),
    ...(e.published_at !== null ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
  };
}

/** One chart, cached 5 min; `updatedAt` is when this copy was computed. */
export async function chart(db: Db, kind: ChartKind, limit: number, now: () => number = Date.now): Promise<{ items: ChartItem[]; updatedAt: string }> {
  const { body } = await cached(db, `chart:v1:${kind}`, CHART_TTL, async () => ({
    items: kind === 'talked' ? await talkedAboutChart(db, CHART_STORED) : kind === 'new' ? await newShowsChart(db) : await risingChart(db),
    updatedAt: new Date(now()).toISOString(),
  }), now);
  // M6 G7: a show hidden after this copy was made leaves at once, not 5 min later.
  const hidden = await hiddenFeedUrls(db);
  const items = body.items.filter((i) => !hidden.has(i.episode.feedUrl)).slice(0, limit).map((i, n) => ({ ...i, rank: n + 1 }));
  return { items, updatedAt: body.updatedAt };
}

/** "New shows": each show once, with its newest episode, newest first-episode first. */
async function newShowsChart(db: Db): Promise<ChartItem[]> {
  const rows = await db.query<EpRow & { first_at: Date | string }>(
    `WITH s AS (SELECT feed_url, min(COALESCE(published_at, first_seen_at)) AS first_at FROM episodes GROUP BY feed_url),
          latest AS (SELECT DISTINCT ON (feed_url) * FROM episodes ORDER BY feed_url, COALESCE(published_at, first_seen_at) DESC, id)
     SELECT ${EP_COLS}, s.first_at FROM latest e JOIN s USING (feed_url)
      WHERE ${NOT_HIDDEN}
      ORDER BY s.first_at DESC, e.feed_url LIMIT ${CHART_STORED}`,
  );
  return rows.map((r, i) => {
    const card = cardOf(r);
    return { kind: 'trending' as const, key: keyOf(card), episode: card, reason: `New show · first episode ${new Date(r.first_at).toISOString().slice(0, 10)}`, rank: i + 1 };
  });
}

/** "Rising": listens + comments this week minus the week before; only growth, biggest first. */
async function risingChart(db: Db): Promise<ChartItem[]> {
  const rows = await db.query<EpRow & { cur: number; prev: number }>(
    `WITH ev AS (
       SELECT episode_id, created_at FROM activity WHERE kind = 'listened' AND created_at > now() - interval '14 days'
       UNION ALL
       SELECT episode_id, created_at FROM comments
        WHERE parent_id IS NULL AND deleted_at IS NULL AND removed_at IS NULL AND host_hidden_at IS NULL AND created_at > now() - interval '14 days'
     ), g AS (
       SELECT episode_id,
              count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS cur,
              count(*) FILTER (WHERE created_at <= now() - interval '7 days')::int AS prev
         FROM ev GROUP BY episode_id
     )
     SELECT ${EP_COLS}, g.cur, g.prev FROM g JOIN episodes e ON e.id = g.episode_id
      WHERE g.cur > g.prev AND ${NOT_HIDDEN}
      ORDER BY (g.cur - g.prev) DESC, g.cur DESC, e.id LIMIT ${CHART_STORED}`,
  );
  return rows.map((r, i) => {
    const card = cardOf(r);
    const up = Number(r.cur) - Number(r.prev);
    return { kind: 'trending' as const, key: keyOf(card), episode: card, score: up, reason: `+${up} this week (${Number(r.cur)} vs ${Number(r.prev)})`, rank: i + 1 };
  });
}

/** A stable order for a seed: the same seed always gives the same order (no Math.random). */
export function seededOrder<T>(items: readonly T[], seed: string, idOf: (t: T) => string): T[] {
  // SHA-256, not FNV-1a: a seed that differs in one character (the next day) must reorder the
  // whole list, and FNV's last-byte mixing left it unchanged (gate 37442959667).
  const key = (id: string): string => createHash('sha256').update(`${seed}\u0001${id}`).digest('hex').slice(0, 16);
  return items.map((t) => ({ t, k: key(idOf(t)) })).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)).map((x) => x.t);
}

export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
export const HUNT_SIZE = 3;

/**
 * Treasure hunt (OUR OWN DESIGN, owner 2026-10-06): 3 lesser-heard episodes from 3 different
 * shows. Candidates: episodes with audio, in the bottom half by plays (distinct listeners over 30
 * days; the candidates ordered by plays, then id, and the first half kept — ties cut by id), from shows the listener does not subscribe to and did not turn down (`rec_dismissals`,
 * show or episode). The pick is seeded by (listener, UTC day, shuffle), so it holds all day and
 * changes the next day; `shuffle = n` gives the n-th other set.
 */
export async function hunt(db: Db, listenerId: string | undefined, day: string, shuffle: number): Promise<(EpisodeCard & { id: string })[]> {
  const rows = await db.query<EpRow & { plays: number }>(
    `WITH plays AS (
       SELECT episode_id, count(DISTINCT actor_id)::int AS n FROM activity
        WHERE kind = 'listened' AND created_at > now() - interval '30 days' GROUP BY episode_id
     ), cand AS (
       SELECT ${EP_COLS}, COALESCE(p.n, 0) AS plays FROM episodes e LEFT JOIN plays p ON p.episode_id = e.id
        WHERE e.enclosure_url <> '' AND ${NOT_HIDDEN}
          AND ($1::uuid IS NULL OR (
            NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.listener_id = $1::uuid AND s.feed_url = e.feed_url AND s.deleted_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM rec_dismissals d WHERE d.listener_id = $1::uuid
                             AND ((d.kind = 'show' AND d.item_key = e.feed_url) OR (d.kind = 'episode' AND d.item_key = e.id)))))
     )
     SELECT * FROM (SELECT cand.*, row_number() OVER (ORDER BY plays, id) AS rn, count(*) OVER () AS total FROM cand) x
      WHERE rn * 2 <= total + 1 ORDER BY rn LIMIT 2000`,
    [listenerId ?? null],
  );
  const order = seededOrder(rows, `hunt|${listenerId ?? 'anon'}|${day}|${shuffle}`, (r) => r.id);
  const out: (EpisodeCard & { id: string })[] = [];
  const shows = new Set<string>();
  for (const r of order) {
    if (out.length >= HUNT_SIZE) break;
    if (shows.has(r.feed_url)) continue;
    shows.add(r.feed_url);
    out.push(cardOf(r));
  }
  return out;
}

export type PlazaShow = { feedUrl: string; title: string; imageUrl?: string; episodes: number; firstAt: string };
export const PLAZA_POOL = 600;
export const PLAZA_PAGE = 60;

/**
 * New-shows plaza (OUR OWN DESIGN, owner 2026-10-06): the newest PLAZA_POOL shows (by the
 * earliest episode known), put in a seeded order per (listener, day, shuffle), served
 * PLAZA_PAGE at a time. `cursor` is the offset of the next page.
 */
export async function plaza(db: Db, seed: string, cursor: number): Promise<{ items: PlazaShow[]; next?: string }> {
  const hidden = await hiddenFeedUrls(db);
  const rows = await db.query<{ feed_url: string; title: string | null; image_url: string | null; episodes: number; first_at: Date | string }>(
    `SELECT feed_url,
            (array_agg(show_title ORDER BY COALESCE(published_at, first_seen_at) DESC) FILTER (WHERE show_title IS NOT NULL))[1] AS title,
            (array_agg(image_url ORDER BY COALESCE(published_at, first_seen_at) DESC) FILTER (WHERE image_url IS NOT NULL))[1] AS image_url,
            count(*)::int AS episodes, min(COALESCE(published_at, first_seen_at)) AS first_at
       FROM episodes GROUP BY feed_url ORDER BY first_at DESC, feed_url LIMIT ${PLAZA_POOL}`,
  );
  const pool = rows.filter((r) => !hidden.has(r.feed_url));
  const order = seededOrder(pool, `plaza|${seed}`, (r) => r.feed_url);
  const slice = order.slice(cursor, cursor + PLAZA_PAGE);
  return {
    items: slice.map((r) => ({ feedUrl: r.feed_url, title: r.title ?? '', ...(r.image_url ? { imageUrl: r.image_url } : {}), episodes: Number(r.episodes), firstAt: new Date(r.first_at).toISOString() })),
    ...(cursor + PLAZA_PAGE < order.length ? { next: String(cursor + PLAZA_PAGE) } : {}),
  };
}

export type Face = { id: string; displayName: string; avatarUrl?: string };
export const FACES_MAX = 3;

/**
 * Faces on editor's picks: up to 3 people the viewer follows who liked each episode, newest like
 * first. Only public likes, never a suspended account, never anyone blocked either way.
 */
export async function likedByFollowed(db: Db, viewerId: string, episodeIds: readonly string[]): Promise<Map<string, Face[]>> {
  const out = new Map<string, Face[]>();
  if (episodeIds.length === 0) return out;
  const rows = await db.query<{ episode_id: string; id: string; display_name: string; avatar_url: string | null }>(
    `SELECT k.episode_id, l.id, l.display_name, l.avatar_url FROM episode_likes k
       JOIN listeners l ON l.id = k.listener_id AND l.suspended_at IS NULL AND l.hidden_at IS NULL AND l.likes_public = true
      WHERE k.episode_id = ANY($2::text[])
        AND k.listener_id IN (SELECT followed_id FROM follows WHERE follower_id = $1)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = k.listener_id) OR (b.blocker_id = k.listener_id AND b.blocked_id = $1))
      ORDER BY k.created_at DESC, l.id`,
    [viewerId, [...episodeIds]],
  );
  for (const r of rows) {
    const list = out.get(r.episode_id) ?? [];
    if (list.length >= FACES_MAX) continue;
    list.push({ id: r.id, displayName: r.display_name, ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) });
    out.set(r.episode_id, list);
  }
  return out;
}

