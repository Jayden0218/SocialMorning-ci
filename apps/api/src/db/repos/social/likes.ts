// Likes with a note: like or unlike an episode, a timeline of likes from people you follow, and like posts.
/**
 * M19 US3 (FR-020–FR-022). A like (喜欢) carries an optional note of at most 140 characters. Others
 * see a listener's likes only while `likes_public` is on; a blocked listener (either way), a
 * suspended account and a hidden show never appear (M6 rules, applied at read time).
 */
import { viaStore } from '../../backend.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';

export const TIMELINE_PAGE = 20;

export type LikeItem = {
  listener?: { id: string; displayName: string; avatarUrl?: string };
  episode: EpisodeCard & { id: string };
  note?: string;
  createdAt: string;
};

/**
 * M21 US7 (T081) — the like post: one like (owner, episode) as a page of its own, with comments
 * (≤ 280 characters) and one emoji reaction per listener. The like-post page is OUR OWN DESIGN
 * (owner, 2026-10-06). A viewer sees the post only when they could see the like itself (`likesOf`
 * rules: public likes or the owner, no block either way, owner not suspended, show not hidden).
 * Comments from anyone the viewer blocked (or who blocked the viewer), or from a suspended
 * account, are left out of the viewer's read; nobody blocked either way with the owner may comment.
 */
export const LIKE_COMMENTS_MAX = 200;
export type LikeComment = { id: string; author: { id: string; displayName: string; avatarUrl?: string }; body: string; createdAt: string; mine: boolean };
export type LikePost = { like: LikeItem; comments: LikeComment[]; reactions: { counts: { emoji: string; n: number }[]; mine?: string } };

// Bodies in ddb/likes.ts (src/db/backend.ts).
export const like = viaStore<typeof import('./ddb/likes.ts').like>('sc/likes', 'like');
export const unlike = viaStore<typeof import('./ddb/likes.ts').unlike>('sc/likes', 'unlike');
export const myLike = viaStore<typeof import('./ddb/likes.ts').myLike>('sc/likes', 'myLike');
export const timeline = viaStore<typeof import('./ddb/likes.ts').timeline>('sc/likes', 'timeline');
export const likesOf = viaStore<typeof import('./ddb/likes.ts').likesOf>('sc/likes', 'likesOf');
export const visibleLike = viaStore<typeof import('./ddb/likes.ts').visibleLike>('sc/likes', 'visibleLike');
export const likePost = viaStore<typeof import('./ddb/likes.ts').likePost>('sc/likes', 'likePost');
export const addLikeComment = viaStore<typeof import('./ddb/likes.ts').addLikeComment>('sc/likes', 'addLikeComment');
export const deleteLikeComment = viaStore<typeof import('./ddb/likes.ts').deleteLikeComment>('sc/likes', 'deleteLikeComment');
export const setLikeReaction = viaStore<typeof import('./ddb/likes.ts').setLikeReaction>('sc/likes', 'setLikeReaction');
export const clearLikeReaction = viaStore<typeof import('./ddb/likes.ts').clearLikeReaction>('sc/likes', 'clearLikeReaction');
