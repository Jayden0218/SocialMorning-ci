// Moments on DynamoDB: an episode's hottest buckets and their top comments, and the episodes a viewer follows. Queries and GetItems only.
/**
 * M31 T026, specs/033-m31-redesign/contracts/moments.md. No Scan: the heat curve is one GetItem, the comments one Query
 * on the episode partition (`listComments`), a followed show's newest episodes one G2 `SHEPS#` Query each.
 */
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';
import { bucketOf, BUCKETS, heatCurve } from '../../../../heat/ddb.ts';
import { listComments } from '../../social/comments.ts';
import { listAll } from '../../library/subscriptions.ts';
import { showEpisodes, type EpRow } from './common.ts';

/** A moment needs at least this many reactions, and a place among the curve's top 10 buckets (10 %). */
export const MIN_REACTIONS = 5;
export const TOP_BUCKETS = BUCKETS / 10;
export const MAX_PER_EPISODE = 10;
export const COMMENTS_PER_MOMENT = 3;
export const FOLLOWED_SHOWS = 30;
export const EPISODES_PER_SHOW = 3;
/** The show filter (`?feedUrl=`): the show's newest this many episodes. */
export const EPISODES_FOR_SHOW = 20;

/** The buckets that count as moments: top 10 % of the curve (ties kept) and >= 5 reactions, hottest first. */
export function momentBuckets(curve: readonly number[]): { bucket: number; reactions: number }[] {
  const ranked = [...curve].sort((a, b) => b - a);
  const floor = Math.max(MIN_REACTIONS, ranked[TOP_BUCKETS - 1] ?? 0);
  return curve.map((reactions, bucket) => ({ bucket, reactions })).filter((m) => m.reactions >= floor)
    .sort((a, b) => b.reactions - a.reactions || a.bucket - b.bucket).slice(0, MAX_PER_EPISODE);
}

export type EpisodeInfo = { id: string; title: string; showTitle: string; feedUrl: string; guid: string; enclosureUrl?: string; imageUrl?: string; durationMs?: number };
export type MomentOut = { startMs: number; endMs: number; reactions: number; comments: { id: string; author: string; text: string; likes: number }[] };

/** An episode's heat curve scaled to its hottest bucket: 100 integers 0..100 (all 0 when nothing was heard). Wave 5b: the Show card and the Home card draw it. */
export function normalisedCurve(curve: readonly number[]): number[] {
  const max = Math.max(0, ...curve);
  return Array.from({ length: BUCKETS }, (_, i) => (max > 0 ? Math.round(((curve[i] ?? 0) / max) * 100) : 0));
}
/** `feedUrl` + `guid` (and `enclosureUrl` when known) let the phone play a moment without searching the chart. */
export type EpisodeMoments = { episodeId: string; showTitle: string; episodeTitle: string; feedUrl: string; guid: string; enclosureUrl?: string; coverUrl?: string; curve: number[]; moments: MomentOut[] };

/** One episode's moments with their top comments (anonymous view, so one copy serves every viewer). */
export async function episodeMoments(store: Store, db: Db, ep: EpisodeInfo): Promise<EpisodeMoments> {
  const head = { episodeId: ep.id, showTitle: ep.showTitle, episodeTitle: ep.title, feedUrl: ep.feedUrl, guid: ep.guid, ...(ep.enclosureUrl ? { enclosureUrl: ep.enclosureUrl } : {}), ...(ep.imageUrl ? { coverUrl: ep.imageUrl } : {}) };
  const d = ep.durationMs;
  if (!d || d <= 0) return { ...head, curve: normalisedCurve([]), moments: [] };
  const raw = await heatCurve(store, ep.id);
  const hot = momentBuckets(raw);
  const curve = normalisedCurve(raw);
  if (hot.length === 0) return { ...head, curve, moments: [] };
  const comments = (await listComments(db, ep.id)).filter((c) => c.offsetMs !== null && !c.deleted && !c.removed && !c.blocked && !c.hiddenByHost && !c.held && c.body);
  return {
    ...head,
    curve,
    moments: hot.map(({ bucket, reactions }) => ({
      startMs: Math.floor((bucket * d) / BUCKETS), endMs: Math.floor(((bucket + 1) * d) / BUCKETS), reactions,
      comments: comments.filter((c) => bucketOf(c.offsetMs as number, d) === bucket)
        .sort((a, b) => b.likeCount - a.likeCount || (a.createdAt < b.createdAt ? -1 : 1)).slice(0, COMMENTS_PER_MOMENT)
        .map((c) => ({ id: c.id, author: c.displayName ?? '', text: c.body as string, likes: c.likeCount })),
    })),
  };
}

const infoOf = (e: EpRow): EpisodeInfo => ({ id: e.id, title: e.title, showTitle: e.show_title ?? '', feedUrl: e.feed_url, guid: e.guid, ...(e.enclosure_url ? { enclosureUrl: e.enclosure_url } : {}), ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}) });

/** The viewer's followed shows' newest episodes: <= 30 live subscriptions, 3 episodes each, `skip` (hidden) removed. */
export async function followedEpisodes(store: Store, db: Db, listenerId: string, skip: ReadonlySet<string>, hiddenFeeds: ReadonlySet<string>): Promise<EpisodeInfo[]> {
  const subs = (await listAll(db, listenerId)).filter((s) => s.deleted_at === null && !hiddenFeeds.has(s.feed_url)).slice(0, FOLLOWED_SHOWS);
  const perShow = await Promise.all(subs.map((s) => showEpisodes(store, s.feed_url, { max: EPISODES_PER_SHOW, skip })));
  return perShow.flat().map(infoOf);
}

/** One show's newest 20 episodes (one G2 `SHEPS#` Query), `skip` (hidden) removed, and whether the viewer follows it. */
export async function showMomentEpisodes(store: Store, db: Db, feedUrl: string, listenerId: string | undefined, skip: ReadonlySet<string>): Promise<{ episodes: EpisodeInfo[]; followed: boolean }> {
  const [rows, subs] = await Promise.all([showEpisodes(store, feedUrl, { max: EPISODES_FOR_SHOW, skip }), listenerId ? listAll(db, listenerId) : Promise.resolve([])]);
  return { episodes: rows.map(infoOf), followed: subs.some((s) => s.feed_url === feedUrl && s.deleted_at === null) };
}
