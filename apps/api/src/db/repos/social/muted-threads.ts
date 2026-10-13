// Muted notice threads: no more notices or pushes from one comment thread or one like-post.
/**
 * M22 US3 (spec FR-011, FR-012; contracts/api.md "Push"). A muted thread is private to the
 * listener who muted it: `muted_threads(listener_id, thread_kind, thread_key)`. `notify()` and
 * `pushFor()` read the table (lane 1); this file writes it and lists it for Settings › Privacy.
 *
 * Thread keys are the ones `threadOf` in `account/push.ts` makes: a comment thread is the top
 * comment's id; a like-post is `<ownerId>:<episodeId>`.
 *
 * "Stop like notices" is the comment author's own switch on one comment (`like_notices_off`):
 * likes on it make no notice, replies still do.
 */
import { viaStore } from '../../backend.ts';

export type ThreadKind = 'comment' | 'like_post';
export type MutedThread = { threadKind: ThreadKind; threadKey: string; title: string; createdAt: string };

const UUID = /^[0-9a-f-]{36}$/i;

/** A key this server could have made: a comment id, or `<uuid>:<episode id>`. */
export function validThreadKey(kind: ThreadKind, key: string): boolean {
  if (key.length === 0 || key.length > 300) return false;
  if (kind === 'comment') return UUID.test(key);
  const i = key.indexOf(':');
  return i === 36 && UUID.test(key.slice(0, 36)) && key.length > 37;
}

// The comment's own switch (`setLikeNotices`) lives in comments (ddb/comments.ts).
export const setLikeNotices = viaStore<typeof import('./ddb/comments.ts').setLikeNotices>('sc/comments', 'setLikeNotices');

// Bodies in graph-ddb/ (src/db/backend.ts).
export const muteThread = viaStore<typeof import('./graph-ddb/index.ts').muteThread>('sg/index', 'muteThread');
export const unmuteThread = viaStore<typeof import('./graph-ddb/index.ts').unmuteThread>('sg/index', 'unmuteThread');
export const listMutedThreads = viaStore<typeof import('./graph-ddb/index.ts').listMutedThreads>('sg/index', 'listMutedThreads');
