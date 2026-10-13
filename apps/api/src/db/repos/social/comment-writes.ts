// Comment writes the comment routes run: the rate floor, posting and deleting in a transaction, images, reactions.
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { like, type LikeState } from './comment-likes.ts';

/** PUT /v1/comments/:id/like inside a transaction. */
export async function likeCommentInTx(db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  return db.transaction((tx) => like(tx, commentId, listenerId));
}

// Bodies in ddb/comment-writes.ts (src/db/backend.ts).
export const recentCommentRows = viaStore<typeof import('./ddb/comment-writes.ts').recentCommentRows>('sc/comment-writes', 'recentCommentRows');
export const postCommentInTx = viaStore<typeof import('./ddb/comment-writes.ts').postCommentInTx>('sc/comment-writes', 'postCommentInTx');
export const deleteCommentInTx = viaStore<typeof import('./ddb/comment-writes.ts').deleteCommentInTx>('sc/comment-writes', 'deleteCommentInTx');
export const postVoiceCommentInTx = viaStore<typeof import('./ddb/comment-writes.ts').postVoiceCommentInTx>('sc/comment-writes', 'postVoiceCommentInTx');
export const commentImageBytesRows = viaStore<typeof import('./ddb/comment-writes.ts').commentImageBytesRows>('sc/comment-writes', 'commentImageBytesRows');
export const setCommentImage = viaStore<typeof import('./ddb/comment-writes.ts').setCommentImage>('sc/comment-writes', 'setCommentImage');
export const toggleReactionInTx = viaStore<typeof import('./ddb/comment-writes.ts').toggleReactionInTx>('sc/comment-writes', 'toggleReactionInTx');
