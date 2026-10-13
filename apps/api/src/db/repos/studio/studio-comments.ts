// A show's comments for the creator: list, reply, and hide or unhide.
/**
 * M11 US3 — a show's comments, as its creator sees them in the Studio (FR-013..FR-016).
 *
 * A reply goes through the app's own `createComment`, so it gets the same depth and parent
 * rules; the route adds the same rate floor and block check the app's POST applies. A hide is
 * reversible (`host_hidden_at`), unlike /mod's remove, and each hide/un-hide is written to
 * `moderation_actions` so the owner's /mod page sees it and can undo it (research R6).
 */
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { like, type LikeState } from '../social/comment-likes.ts';

/** Like a comment as the host, inside one transaction (the app's like). */
export async function likeCommentInTransaction(db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  return db.transaction((tx) => like(tx, commentId, listenerId));
}

export type StudioComment = {
  id: string;
  episodeId: string;
  episodeTitle: string;
  author: { id: string; displayName: string } | null;
  body: string | null;
  state: 'visible' | 'host_hidden' | 'removed' | 'deleted';
  offsetMs: number | null;
  createdAt: string;
  parentId: string | null;
  replies: number;
  /** Written by the show's owner or a helper — they cannot be muted on their own show. */
  byTeam: boolean;
  /** M19 US5: pinned first in the app; voice comments carry their recording. */
  pinned: boolean;
  /** M22 US10: pinned to the bottom — last in the app under every sort. */
  pinnedBottom: boolean;
  voice?: { url: string; ms: number };
};

// DynamoDB bodies: ddb/ (db/backend.ts).
export const recentCommentCountRows = viaStore<typeof import('./ddb/comments.ts').recentCommentCountRows>('st/comments', 'recentCommentCountRows');
export const listShowComments = viaStore<typeof import('./ddb/comments.ts').listShowComments>('st/comments', 'listShowComments');
export const commentOnFeed = viaStore<typeof import('./ddb/comments.ts').commentOnFeed>('st/comments', 'commentOnFeed');
export const setHostHidden = viaStore<typeof import('./ddb/comments.ts').setHostHidden>('st/comments', 'setHostHidden');
export const recentHostHides = viaStore<typeof import('./ddb/comments.ts').recentHostHides>('st/comments', 'recentHostHides');
