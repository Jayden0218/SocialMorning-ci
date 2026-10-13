// Comment control per show and per episode: open, closed, or held for the host's review.
/**
 * M24 US8 (specs/025-m24-gaps-and-look). The host sets the whole show, or one episode, to
 * `open`, `closed` or `review`; an episode's own setting wins over the show's. No row = open.
 *
 *  - closed → the comment POST answers 403 `comments_closed`.
 *  - review → the comment is written to `held_comments`, never to `comments`, so no read of
 *    `comments` anywhere (threads, heat, counts, feeds, notices) can show it. Its author reads
 *    it in `listComments` (marked `held`); Approve moves it into `comments` through the app's
 *    own `createComment` (activity, notices, heat), Reject deletes it.
 *
 * The show's team (proven owner, invited hosts, operators) is never refused or held.
 */
import { viaStore } from '../../backend.ts';
import { initialsOf } from '../social/comment-likes.ts';
import type { PublicComment } from '../social/comments.ts';

export type CommentMode = 'open' | 'closed' | 'review';
export const MODES: readonly CommentMode[] = ['open', 'closed', 'review'];

type HeldRow = {
  id: string; episode_id: string; author_id: string; parent_id: string | null; body: string; offset_ms: number | null; country: string | null; created_at: Date | string; display_name: string | null; avatar_url: string | null;
  /** Fix F-S (migration 026): a picture added while the comment waits. */
  image_url: string | null; image_path: string | null; image_w: number | null; image_h: number | null; image_bytes: number | null;
};

/** How the author sees their own held comment. Nobody else is ever given one. */
export function heldToPublic(r: HeldRow): PublicComment & { held: true } {
  return {
    id: r.id, authorId: r.author_id, displayName: r.display_name, body: r.body, offsetMs: r.offset_ms, parentId: r.parent_id,
    createdAt: new Date(r.created_at).toISOString(), deleted: false, initials: initialsOf(r.display_name),
    ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    ...(r.image_url && r.image_w && r.image_h ? { image: { url: r.image_url, w: Number(r.image_w), h: Number(r.image_h) } } : {}),
    likeCount: 0, likedByMe: false, country: r.country?.trim() || null, badge: null, mine: true, held: true,
  };
}

export type PendingComment = { id: string; episodeId: string; episodeTitle: string; author: { id: string; displayName: string }; body: string; offsetMs: number | null; parentId: string | null; createdAt: string };

// DynamoDB bodies: ddb/comments.ts (db/backend.ts).
export const modeFor = viaStore<typeof import('./ddb/comments.ts').modeFor>('st/comments', 'modeFor');
export const policyOf = viaStore<typeof import('./ddb/comments.ts').policyOf>('st/comments', 'policyOf');
export const setPolicy = viaStore<typeof import('./ddb/comments.ts').setPolicy>('st/comments', 'setPolicy');
export const heldForImage = viaStore<typeof import('./ddb/comments.ts').heldForImage>('st/comments', 'heldForImage');
export const setHeldImage = viaStore<typeof import('./ddb/comments.ts').setHeldImage>('st/comments', 'setHeldImage');
export const commentControl = viaStore<typeof import('./ddb/comments.ts').commentControl>('st/comments', 'commentControl');
export const requireOpenForVoice = viaStore<typeof import('./ddb/comments.ts').requireOpenForVoice>('st/comments', 'requireOpenForVoice');
export const heldForAuthor = viaStore<typeof import('./ddb/comments.ts').heldForAuthor>('st/comments', 'heldForAuthor');
export const heldStamp = viaStore<typeof import('./ddb/comments.ts').heldStamp>('st/comments', 'heldStamp');
export const listPending = viaStore<typeof import('./ddb/comments.ts').listPending>('st/comments', 'listPending');
export const approveHeld = viaStore<typeof import('./ddb/comments.ts').approveHeld>('st/comments', 'approveHeld');
export const rejectHeld = viaStore<typeof import('./ddb/comments.ts').rejectHeld>('st/comments', 'rejectHeld');
