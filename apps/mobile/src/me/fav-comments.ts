/**
 * Favourite comments (M10b US2, FR-005): comments the listener starred, newest first, with
 * enough of the comment kept to list it (text, episode, moment, author name) — the comment
 * itself may later be deleted, and then the star says so rather than vanishing.
 */
import type { SettingsStore } from '../storage/types';
import { recordChange } from '../sync/library';
import { readList, writeList } from './local-list';

export const FAV_COMMENTS_KEY = 'me.favComments';
export type FavComment = { commentId: string; episodeId: string; body: string; author: string; offsetMs: number | null; at: number };

const ok = (x: unknown): x is FavComment => typeof x === 'object' && x !== null && typeof (x as FavComment).commentId === 'string' && typeof (x as FavComment).at === 'number';

export const listFavComments = (s: SettingsStore): FavComment[] => readList(s, FAV_COMMENTS_KEY, ok);
export const isFavComment = (s: SettingsStore, commentId: string): boolean => listFavComments(s).some((c) => c.commentId === commentId);

export function toggleFavComment(s: SettingsStore, c: Omit<FavComment, 'at'>, now: number): boolean {
  const list = listFavComments(s);
  if (list.some((x) => x.commentId === c.commentId)) {
    writeList(s, FAV_COMMENTS_KEY, list.filter((x) => x.commentId !== c.commentId));
    recordChange(s, 'fav_comment', c.commentId, undefined, now);
    return false;
  }
  const row: FavComment = { ...c, body: c.body.slice(0, 500), at: now };
  writeList(s, FAV_COMMENTS_KEY, [row, ...list]);
  recordChange(s, 'fav_comment', c.commentId, { episodeId: row.episodeId, body: row.body, author: row.author, offsetMs: row.offsetMs }, now);
  return true;
}
