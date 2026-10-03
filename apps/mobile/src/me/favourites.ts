// Keeps the list of episodes you starred, newest first.
/**
 * Favourites (我的收藏, owner 2026-09-27): episodes the listener starred, newest first.
 * On this phone only for now — the server has no favourites table.
 */
import type { SettingsStore } from '@/storage/types';
import { readList, writeList } from './local-list';
import { recordChange } from '@/sync/library';

export const FAVOURITES_KEY = 'me.favourites';
export type Favourite = { episodeId: string; at: number };

const isFav = (x: unknown): x is Favourite =>
  typeof x === 'object' && x !== null && typeof (x as Favourite).episodeId === 'string' && typeof (x as Favourite).at === 'number';

export const listFavourites = (s: SettingsStore): Favourite[] => readList(s, FAVOURITES_KEY, isFav);
export const isFavourite = (s: SettingsStore, episodeId: string): boolean => listFavourites(s).some((f) => f.episodeId === episodeId);

/** Stars or un-stars; returns the new state. */
export function toggleFavourite(s: SettingsStore, episodeId: string, now: number): boolean {
  const list = listFavourites(s);
  if (list.some((f) => f.episodeId === episodeId)) {
    writeList(s, FAVOURITES_KEY, list.filter((f) => f.episodeId !== episodeId));
    recordChange(s, 'fav_episode', episodeId, undefined, now); // M10b: follows the account
    return false;
  }
  writeList(s, FAVOURITES_KEY, [{ episodeId, at: now }, ...list]);
  recordChange(s, 'fav_episode', episodeId, {}, now);
  return true;
}
