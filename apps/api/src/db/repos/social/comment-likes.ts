// Comment likes: one per listener, never your own, hidden comments not likeable.
/**
 * M12 FR-023 — comment likes. One per listener per comment (the primary key makes both
 * directions idempotent). Guard G-C2: you cannot like your own comment — refused here with
 * `own_comment`, before any insert. A comment nobody can see (deleted, removed, hidden by the
 * host) or one across a block in either direction is `not_found`: a like must not reveal it.
 */
import { viaStore } from '../../backend.ts';

export type LikeState = { likeCount: number; likedByMe: boolean };

/** The first letter or digit of a display name, upper-cased; null when there is none. */
export function initialsOf(name: string | null | undefined): string | null {
  const m = /[\p{L}\p{N}]/u.exec(name ?? '');
  return m ? m[0].toLocaleUpperCase() : null;
}

// Bodies in ddb/comment-likes.ts (src/db/backend.ts).
export const like = viaStore<typeof import('./ddb/comment-likes.ts').like>('sc/comment-likes', 'like');
export const unlike = viaStore<typeof import('./ddb/comment-likes.ts').unlike>('sc/comment-likes', 'unlike');
export const likesOnEpisode = viaStore<typeof import('./ddb/comment-likes.ts').likesOnEpisode>('sc/comment-likes', 'likesOnEpisode');
export const likesStamp = viaStore<typeof import('./ddb/comment-likes.ts').likesStamp>('sc/comment-likes', 'likesStamp');
