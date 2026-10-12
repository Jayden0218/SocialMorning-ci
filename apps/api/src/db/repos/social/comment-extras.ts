// Comment pins, "unfriendly" marks and the reply page's thread.
/**
 * M19 US5 (FR-040–FR-043). A host pins one top-level comment per episode (pinning another unpins
 * the first). Any signed-in listener may mark a comment unfriendly once — never their own; at
 * UNFRIENDLY_FOLD_AT marks it folds for everyone, and who marked it is never returned.
 */
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { ApiError } from '../../../errors.ts';
import { hostsOfEpisode } from '../studio/creator.ts';
import { getComment, listComments, type PublicComment } from './comments.ts';

/** Pins (or unpins) as the given listener, who must be a host of the episode's show. */
export async function setPinned(db: Db, commentId: string, listenerId: string, pin: boolean): Promise<void> {
  const c = await getComment(db, commentId);
  if (!c || c.deleted_at !== null || c.removed_at !== null) throw new ApiError('not_found', 'No such comment.');
  if (c.parent_id !== null) throw new ApiError('validation', 'Only a top-level comment can be pinned.');
  const hosts = await hostsOfEpisode(db, c.episode_id);
  if (!hosts.includes(listenerId)) throw new ApiError('forbidden', "Only the show's host can pin a comment.");
  await pinAsHost(db, commentId, c.episode_id, listenerId, pin);
}

/**
 * M22 US10 (FR-030, G-M22-11): pin one top-level comment per episode to the bottom (or unpin it),
 * as the given listener, who must be a host of the episode's show. A new bottom pin replaces the
 * old one (partial unique index `comments_one_pinned_bottom`).
 */
export async function setPinnedBottom(db: Db, commentId: string, listenerId: string, pin: boolean): Promise<void> {
  const c = await getComment(db, commentId);
  if (!c || c.deleted_at !== null || c.removed_at !== null) throw new ApiError('not_found', 'No such comment.');
  if (c.parent_id !== null) throw new ApiError('validation', 'Only a top-level comment can be pinned.');
  const hosts = await hostsOfEpisode(db, c.episode_id);
  if (!hosts.includes(listenerId)) throw new ApiError('forbidden', "Only the show's host can pin a comment.");
  await pinBottomAsHost(db, commentId, c.episode_id, pin);
}

/**
 * The reply page (FR-043): the parent and all its replies, with the viewer's blocks and mutes applied.
 * M21 US6: `tab: 'all'` keeps the replies oldest first (the conversation); `'newest'` is newest first.
 */
export async function thread(db: Db, commentId: string, viewerId: string | undefined, tab: 'all' | 'newest' = 'all'): Promise<{ parent: PublicComment; replies: PublicComment[] } | undefined> {
  const c = await getComment(db, commentId);
  if (!c) return undefined;
  const topId = c.parent_id ?? c.id;
  const all = await listComments(db, c.episode_id, viewerId);
  const parent = all.find((x) => x.id === topId);
  if (!parent) return undefined;
  const { replies, ...rest } = parent;
  const list = replies ?? [];
  return { parent: rest, replies: tab === 'newest' ? [...list].reverse() : list };
}

// Bodies in ddb/comment-extras.ts (src/db/backend.ts).
export const pinAsHost = viaStore<typeof import('./ddb/comment-extras.ts').pinAsHost>('sc/comment-extras', 'pinAsHost');
export const pinBottomAsHost = viaStore<typeof import('./ddb/comment-extras.ts').pinBottomAsHost>('sc/comment-extras', 'pinBottomAsHost');
export const setUnfriendly = viaStore<typeof import('./ddb/comment-extras.ts').setUnfriendly>('sc/comment-extras', 'setUnfriendly');
