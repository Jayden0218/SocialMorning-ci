// What a Moments card's buttons do, apart from drawing: find the episode on the phone, then act.
/**
 * M31 T025. A moment names its episode by id and, since 2026-10-27, its `feedUrl` (contract `moments.md`), but the player, the clip
 * maker and the comments page work from the phone's own copy of the show's feed. `ensureLocal`
 * makes sure the phone has the episode: it is already there for a show you follow; for a chart
 * episode the card is found in the Discover data (or the Talked-about chart) and its show's feed is
 * fetched the way opening any Discover card does (`resolveCard`, without subscribing).
 * Only a tap calls this — scrolling past a card fetches nothing (research T020 §4, rule 4).
 */
import type { Discover, EpisodeCard } from '@/social/api';
import type { Stores } from '@/storage/types';

/** Every episode card in the Discover data, by id. */
export function cardsOf(body: Discover | undefined): Map<string, EpisodeCard> {
  const out = new Map<string, EpisodeCard>();
  if (!body) return out;
  const add = (c: EpisodeCard | undefined): void => { if (c && !out.has(c.id)) out.set(c.id, c); };
  for (const list of [body.picks, body.talkedAbout, body.trending, body.video ?? []]) for (const i of list) add(i.episode);
  for (const i of body.said ?? []) add(i.episode);
  for (const i of body.newShows ?? []) add(i.episode);
  for (const i of body.newArrivals ?? []) add(i.episode);
  for (const c of body.collections ?? []) for (const i of c.items) add(i.episode);
  return out;
}

export type EnsureDeps = {
  stores: Pick<Stores, 'feeds'>;
  refreshShow: (feedUrl: string) => Promise<unknown>;
  /** The card for an episode id the phone has not seen (the Discover data, then the chart). */
  card: (episodeId: string) => Promise<EpisodeCard | undefined>;
};
export type EnsureResult = { ok: true } | { ok: false; reason: 'offline' | 'missing' };

/**
 * `feedUrl`: the moment's own feed (the server names it since 2026-10-27); with it no lookup of the
 * chart is needed. Without it (an older server) `card()` finds the show as before.
 */
export async function ensureLocal(deps: EnsureDeps, episodeId: string, feedUrl?: string): Promise<EnsureResult> {
  if (deps.stores.feeds.getEpisode(episodeId)) return { ok: true };
  const feed = feedUrl ?? (await deps.card(episodeId).catch(() => undefined))?.feedUrl;
  if (!feed) return { ok: false, reason: 'missing' };
  try { await deps.refreshShow(feed); } catch { return { ok: false, reason: 'offline' }; }
  return deps.stores.feeds.getEpisode(episodeId) ? { ok: true } : { ok: false, reason: 'missing' };
}

export const reasonText = (reason: 'offline' | 'missing'): string =>
  reason === 'offline' ? "Couldn't fetch that show right now." : "That episode isn't available to play right now.";

/** The point inside a moment a reaction is sent at: its middle (always inside the bucket). */
export function reactAt(m: { startMs: number; endMs: number }): number {
  return Math.floor((m.startMs + m.endMs) / 2);
}
