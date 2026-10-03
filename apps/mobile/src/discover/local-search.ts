/**
 * Library-first search (M5 FR-005, research R7): the listener's subscribed shows and
 * their cached episodes, matched with the shared `matchesTerm` — instant, works offline.
 */
import { matchesTerm } from '@socialmorning/social-core';
import type { EpisodeCard, ShowCard } from '../social/api';
import type { Stores } from '../storage/types';

export type LibraryHits = { shows: ShowCard[]; episodes: EpisodeCard[] };

export function searchLibrary(stores: Pick<Stores, 'subscriptions' | 'feeds'>, term: string, cap = 20): LibraryHits {
  const shows: ShowCard[] = [];
  const episodes: EpisodeCard[] = [];
  for (const sub of stores.subscriptions.list()) {
    const show = stores.feeds.getShow(sub.feedUrl);
    if (show && shows.length < cap && matchesTerm(term, show.title, show.author)) {
      shows.push({ feedUrl: sub.feedUrl, title: show.title, author: show.author ?? '', ...(show.imageUrl ? { imageUrl: show.imageUrl } : {}), genres: show.categories });
    }
    for (const e of stores.feeds.listEpisodes(sub.feedUrl)) {
      if (episodes.length >= cap) break;
      if (!matchesTerm(term, e.title)) continue;
      const imageUrl = e.imageUrl ?? show?.imageUrl;
      episodes.push({
        id: e.id, feedUrl: e.feedUrl, guid: e.guid, title: e.title, showTitle: show?.title ?? '', enclosureUrl: e.enclosureUrl,
        ...(imageUrl ? { imageUrl } : {}), ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
        ...(e.publishedAt !== undefined ? { publishedAt: new Date(e.publishedAt).toISOString() } : {}),
      });
    }
  }
  return { shows, episodes };
}

export const looksLikeFeedUrl = (term: string): boolean => /^https?:\/\/\S+\.\S+/i.test(term.trim());
