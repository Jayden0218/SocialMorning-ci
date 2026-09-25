/**
 * M8 — the For You list (US2; FR-006..FR-023).
 *
 * Seven retrieval channels, one arithmetic score, then MMR and the two hard rules. The
 * chain in 王树森's slides is 召回 → 粗排 → 精排 → 重排, sized for 几亿物品; 粗排 exists only
 * to make 精排 affordable at a scale we do not have, so it is not here.
 *
 * Three channels — the hand pick, "talked about" and the chart — are taken straight from
 * M5's `discoverBody()` rather than reimplemented. It is already cached for an hour, it
 * already registers every card as an episode, and it is already device-verified (M5 H1).
 * A second implementation of the same three lists would be a second thing to be wrong.
 *
 * Every channel is wrapped: one that throws is dropped with a warning and the list is
 * built from the rest (FR-009, principle IV). The response never says WHICH failed —
 * that would leak the shape of other people's data. `/mod/recs` says.
 */
import {
  bestNeighbourSim, CHANNEL_CAP, isFatigued, LIST_SIZE, reasonFor, rerank, scoreCandidate,
  MIN_USEFUL_CANDIDATES, type Channel, type Neighbour, type RecCandidate,
} from '@socialmorning/social-core';
import type { PickIn } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { cached } from './cache.ts';
import { hiddenFeedUrls } from './moderation.ts';
import { blockedIdsFor, safetyStamp } from './blocks.ts';
import { neighboursOf, similarityAgeHours } from './similarity.ts';
import { discoverBody } from './discover.ts';
import { latestEpisodes, topShows } from '../../catalog/apple.ts';
import { registerCard } from '../../catalog/feed.ts';
import type { EpisodeCard } from '../../catalog/apple.ts';

export const FOR_YOU_TTL = 30 * 60_000;
/** How far back the social channel looks. */
export const SOCIAL_WINDOW_DAYS = 14;
/** Categories taken from the listener's own listening. */
export const TOP_GENRES = 2;
/** Fatigue forgets after this long, so a list can recover (FR-017). */
export const FATIGUE_WINDOW_DAYS = 14;
/** The chart is fetched once an hour for everyone, not once per listener. */
export const CHART_TTL = 60 * 60_000;

export type ForYouItem = {
  episode: EpisodeCard & { id: string };
  channel: Channel;
  reason: string;
  score: number;
};

export type ForYouBody = {
  items: ForYouItem[];
  computedAt: string;
  similarityAge: number | null;
  warnings: string[];
};

type Row = {
  id: string; feed_url: string; guid: string; title: string; show_title: string | null;
  image_url: string | null; duration_ms: number | null; enclosure_url: string;
  published_at: string | null; genre_id: number | null;
};

const EPISODE_COLS = 'id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url, published_at, genre_id';

const toCardRow = (e: Row): EpisodeCard & { id: string } => ({
  id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '',
  enclosureUrl: e.enclosure_url,
  ...(e.image_url ? { imageUrl: e.image_url } : {}),
  ...(e.duration_ms !== null ? { durationMs: e.duration_ms } : {}),
  ...(e.published_at !== null ? { publishedAt: new Date(e.published_at).toISOString() } : {}),
  ...(e.genre_id !== null ? { genreId: e.genre_id } : {}),
});

/** Everything about one listener the channels and the scorer need, read once. */
export type Context = {
  listenerId: string;
  subscribed: Set<string>;
  liked: Set<string>;
  finished: Set<string>;
  blocked: Set<string>;
  hidden: Set<string>;
  follows: string[];
  genres: number[];
  /** episodeId → impressions with no open */
  fatigue: Map<string, number>;
  neighbours: Map<string, readonly Neighbour[]>;
};

export async function contextFor(db: Db, listenerId: string): Promise<Context> {
  const [subs, fin, follows, genres, fatigue] = await Promise.all([
    db.query<{ feed_url: string }>('SELECT feed_url FROM subscriptions WHERE listener_id = $1 AND deleted_at IS NULL', [listenerId]),
    db.query<{ episode_id: string; feed_url: string | null }>(
      `SELECT p.episode_id, e.feed_url FROM positions p LEFT JOIN episodes e ON e.id = p.episode_id WHERE p.listener_id = $1 AND p.finished = true`, [listenerId]),
    db.query<{ followed_id: string }>('SELECT followed_id FROM follows WHERE follower_id = $1', [listenerId]),
    db.query<{ genre_id: number; n: number }>(
      `SELECT e.genre_id, count(*)::int AS n FROM activity a JOIN episodes e ON e.id = a.episode_id
       WHERE a.actor_id = $1 AND a.kind = 'listened' AND e.genre_id IS NOT NULL
       GROUP BY e.genre_id ORDER BY n DESC LIMIT ${TOP_GENRES}`, [listenerId]),
    /**
     * Fatigue (FR-017), counted in **distinct days** inside a window — not raw impressions.
     *
     * Counting raw impressions was wrong in a way only the phone showed: the app logs one
     * per row per launch, so opening Discover four times in five minutes retired an
     * episode for ever. On 2026-09-26 that had fatigued out **40 episodes**, including
     * every show on the chart, which is why L2's top ten fell back to repeating the
     * listener's own shows.
     *
     * "Shown three times and never opened" means three *occasions*, and it stops counting
     * after FATIGUE_WINDOW_DAYS so a list can recover.
     */
    db.query<{ episode_id: string; imps: number }>(
      `SELECT episode_id, count(DISTINCT date(at)) FILTER (WHERE kind = 'impression')::int AS imps
       FROM rec_events
       WHERE listener_id = $1 AND at > now() - ($2 || ' days')::interval
       GROUP BY episode_id HAVING count(*) FILTER (WHERE kind = 'open') = 0`, [listenerId, String(FATIGUE_WINDOW_DAYS)]),
  ]);

  const subscribed = new Set(subs.map((r) => r.feed_url));
  const finishedByShow = new Map<string, number>();
  for (const r of fin) if (r.feed_url !== null) finishedByShow.set(r.feed_url, (finishedByShow.get(r.feed_url) ?? 0) + 1);
  const liked = new Set(subscribed);
  for (const [feedUrl, n] of finishedByShow) if (n >= 3) liked.add(feedUrl);

  return {
    listenerId,
    subscribed,
    liked,
    finished: new Set(fin.map((r) => r.episode_id)),
    blocked: await blockedIdsFor(db, listenerId),
    hidden: await hiddenFeedUrls(db),
    follows: follows.map((r) => r.followed_id),
    genres: genres.map((r) => Number(r.genre_id)),
    fatigue: new Map(fatigue.map((r) => [r.episode_id, Number(r.imps)])),
    neighbours: await neighboursOf(db, [...liked]),
  };
}

type Raw = { row: Row; channel: Channel; socialCount?: number; neighbourOf?: string };

async function subNew(db: Db, ctx: Context): Promise<Raw[]> {
  if (ctx.subscribed.size === 0) return [];
  const rows = await db.query<Row>(
    `SELECT ${EPISODE_COLS} FROM episodes WHERE feed_url = ANY($1::text[])
     ORDER BY published_at DESC NULLS LAST LIMIT ${CHANNEL_CAP['sub-new']}`, [[...ctx.subscribed]]);
  return rows.map((row) => ({ row, channel: 'sub-new' as const }));
}

async function showCf(db: Db, ctx: Context): Promise<Raw[]> {
  const out: Raw[] = [];
  for (const [show, list] of ctx.neighbours) {
    for (const n of list) {
      if (ctx.liked.has(n.show)) continue; // they already have it
      const rows = await db.query<Row>(
        `SELECT ${EPISODE_COLS} FROM episodes WHERE feed_url = $1 ORDER BY published_at DESC NULLS LAST LIMIT 2`, [n.show]);
      for (const row of rows) out.push({ row, channel: 'showcf', neighbourOf: show });
      if (out.length >= CHANNEL_CAP.showcf) return out;
    }
  }
  return out;
}

async function social(db: Db, ctx: Context): Promise<Raw[]> {
  if (ctx.follows.length === 0) return [];
  const rows = await db.query<Row & { n: number }>(
    `SELECT ${EPISODE_COLS.split(', ').map((c) => `e.${c}`).join(', ')}, count(DISTINCT a.actor_id)::int AS n
     FROM activity a JOIN episodes e ON e.id = a.episode_id
     WHERE a.actor_id = ANY($1::uuid[]) AND a.hidden = false
       AND a.actor_id <> ALL($2::uuid[])
       AND a.created_at > now() - interval '${SOCIAL_WINDOW_DAYS} days'
     GROUP BY ${EPISODE_COLS.split(', ').map((c) => `e.${c}`).join(', ')}
     ORDER BY n DESC LIMIT ${CHANNEL_CAP.social}`, [ctx.follows, [...ctx.blocked]]);
  return rows.map(({ n, ...row }) => ({ row: row as Row, channel: 'social' as const, socialCount: Number(n) }));
}

async function byGenre(db: Db, ctx: Context): Promise<Raw[]> {
  if (ctx.genres.length === 0) return [];
  const rows = await db.query<Row>(
    `SELECT ${EPISODE_COLS} FROM episodes WHERE genre_id = ANY($1::int[])
     ORDER BY published_at DESC NULLS LAST LIMIT ${CHANNEL_CAP.genre}`, [ctx.genres]);
  return rows.map((row) => ({ row, channel: 'genre' as const }));
}

/**
 * The public chart, as a channel of its own (FR-008 as amended 2026-09-26).
 *
 * It used to be taken from `discoverBody()`'s `trending`, which was wrong in a way that
 * only the phone showed: in M5 the chart exists purely as **filler** for a thin
 * talked-about list — `fillWithTrending(talked, trending, 5)` stops appending once the
 * list reaches five — so with five talked-about items it is *always* empty. That made
 * For You's only source of shows the listener does not already follow a channel that
 * could never fire, and L2 came back with three items.
 *
 * Cached for everyone rather than per listener: it is the same ten shows for all of them.
 */
export async function chartCandidates(db: Db, f: typeof fetch, now: number): Promise<(EpisodeCard & { id: string })[]> {
  const r = await cached<(EpisodeCard & { id: string })[]>(db, 'foryou:chart', CHART_TTL, async () => {
    const out: (EpisodeCard & { id: string })[] = [];
    const shows = await topShows(f, undefined, 10);
    for (const s of shows) {
      if (out.length >= CHANNEL_CAP.chart || s.appleId === undefined) continue;
      const [latest] = await latestEpisodes(f, s.appleId, 1);
      if (latest === undefined) continue;
      const row = await registerCard(db, latest);
      out.push({ ...latest, id: row.id });
    }
    return out;
  }, () => now);
  return r.body;
}

/**
 * Build one listener's list. `discover` and `chart` are injected so the tests can run
 * without a catalogue, and so a catalogue failure is one channel failing rather than the
 * request.
 */
export async function buildForYou(
  db: Db,
  ctx: Context,
  discover: () => Promise<{ picks: { episode: EpisodeCard & { id: string } }[]; talkedAbout: { episode: EpisodeCard & { id: string }; score?: number }[]; trending: { episode: EpisodeCard & { id: string } }[] }>,
  now: number,
  chart: () => Promise<(EpisodeCard & { id: string })[]> = async () => [],
): Promise<{ items: ForYouItem[]; warnings: string[] }> {
  const warnings: string[] = [];
  const raw: Raw[] = [];
  const talkedScore = new Map<string, number>();

  const run = async (name: string, f: () => Promise<Raw[]>): Promise<void> => {
    try { raw.push(...(await f())); } catch (e) { warnings.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  await run('sub-new', () => subNew(db, ctx));
  const cfBefore = raw.length;
  await run('showcf', () => showCf(db, ctx));
  // FR-018: too thin to mean anything ⇒ contribute NOTHING rather than noise.
  if (raw.length - cfBefore < MIN_USEFUL_CANDIDATES) raw.length = cfBefore;
  await run('social', () => social(db, ctx));
  await run('genre', () => byGenre(db, ctx));

  try {
    const d = await discover();
    for (const p of d.picks) raw.push({ row: cardToRow(p.episode), channel: 'pick' });
    for (const t of d.talkedAbout) {
      raw.push({ row: cardToRow(t.episode), channel: 'talked' });
      talkedScore.set(t.episode.id, t.score ?? 0);
    }
    for (const t of d.trending) raw.push({ row: cardToRow(t.episode), channel: 'chart' });
  } catch (e) {
    warnings.push(`discover: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    for (const c of await chart()) raw.push({ row: cardToRow(c), channel: 'chart' });
  } catch (e) {
    warnings.push(`chart: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Dedup by episode id, keeping the first (strongest) channel that produced it.
  const seen = new Map<string, Raw>();
  for (const r of raw) if (!seen.has(r.row.id)) seen.set(r.row.id, r);

  const scored = [...seen.values()]
    .filter((r) => !ctx.finished.has(r.row.id) && !ctx.hidden.has(r.row.feed_url))
    .map((r) => {
      const candidate: RecCandidate = {
        episodeId: r.row.id,
        feedUrl: r.row.feed_url,
        genreId: r.row.genre_id,
        channel: r.channel,
        publishedAt: r.row.published_at === null ? null : new Date(r.row.published_at).getTime(),
        subscribed: ctx.subscribed.has(r.row.feed_url),
        neighbourSim: bestNeighbourSim(ctx.neighbours, r.row.feed_url, ctx.liked),
        genreMatch: r.row.genre_id !== null && ctx.genres.includes(r.row.genre_id),
        socialCount: r.socialCount ?? 0,
        talkedScore: talkedScore.get(r.row.id) ?? 0,
        impressions: ctx.fatigue.get(r.row.id) ?? 0,
      };
      return { raw: r, candidate };
    })
    .filter((x) => !isFatigued(x.candidate))
    .map((x) => ({ raw: x.raw, candidate: x.candidate, score: scoreCandidate(x.candidate, now) }));

  const ordered = rerank(scored.map(({ candidate, score }) => ({ candidate, score })), ctx.neighbours, { size: LIST_SIZE });
  const byId = new Map(scored.map((x) => [x.candidate.episodeId, x.raw]));

  const items = ordered.map(({ candidate, score }) => {
    const r = byId.get(candidate.episodeId)!;
    return {
      episode: toCardRow(r.row),
      channel: candidate.channel,
      reason: reasonFor(candidate.channel, {
        showTitle: r.row.show_title ?? '',
        ...(r.neighbourOf === undefined ? {} : { neighbourOf: r.neighbourOf }),
        ...(r.socialCount === undefined ? {} : { socialCount: r.socialCount }),
      }),
      score,
    };
  });
  return { items, warnings };
}

/** A card that came from Discover, in the row shape the rest of this file uses. */
function cardToRow(c: EpisodeCard & { id: string }): Row {
  return {
    id: c.id, feed_url: c.feedUrl, guid: c.guid, title: c.title, show_title: c.showTitle,
    image_url: c.imageUrl ?? null, duration_ms: c.durationMs ?? null, enclosure_url: c.enclosureUrl,
    published_at: c.publishedAt ?? null, genre_id: c.genreId ?? null,
  };
}

/** The cached, per-listener entry point. */
export async function forYou(
  db: Db, f: typeof fetch, picks: readonly PickIn[], today: string, listenerId: string,
  now: number = Date.now(),
): Promise<{ body: ForYouBody; stale: boolean }> {
  // The key carries M6's safety stamp. A new block changes the stamp, so the list is
  // rebuilt on the next request rather than waiting out the 30-minute cache (FR-021, L4).
  const stamp = await safetyStamp(db, listenerId);
  const r = await cached<ForYouBody>(db, `foryou:${listenerId}:${stamp}`, FOR_YOU_TTL, async () => {
    const ctx = await contextFor(db, listenerId);
    const { items, warnings } = await buildForYou(
      db, ctx,
      async () => (await discoverBody(db, f, picks, today)).body,
      now,
      () => chartCandidates(db, f, now),
    );
    return { items, computedAt: new Date(now).toISOString(), similarityAge: await similarityAgeHours(db), warnings };
  }, () => now);

  // Hiding a show is global and must take effect before ANY listener's cache expires —
  // the same rule M6 applied to Discover (guard G7 there, FR-022 here).
  const hidden = await hiddenFeedUrls(db);
  const body = hidden.size === 0 ? r.body : { ...r.body, items: r.body.items.filter((i) => !hidden.has(i.episode.feedUrl)) };
  return { body, stale: r.stale };
}
