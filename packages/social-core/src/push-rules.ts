/**
 * M22 US1/US3 (specs/023 research R2): whether a notice also becomes a phone push.
 * Pure: the server gathers the facts, this decides. Guards G-M22-1 (never from a blocked or
 * muted person, a muted thread, or your own act) and G-M22-4 (likes on one item within
 * 10 minutes are one push).
 */

export type PushKind =
  | 'reply' | 'like' | 'mention' | 'follow'
  | 'like_post_comment' | 'like_post_like'
  | 'status_reply' | 'status_reaction' | 'status_milestone';

export interface PushPrefs {
  replies: boolean;
  likes: boolean;
  follows: boolean;
  mentions: boolean;
  statuses: boolean;
}

export interface PushRelations {
  /** The recipient blocked the actor, or the actor blocked the recipient. */
  blocked: boolean;
  /** The recipient muted the actor. */
  muted: boolean;
  /** The recipient muted this thread (a comment or a like-post). */
  threadMuted: boolean;
  /** The comment's author turned off like notices for it. */
  likeNoticesOff?: boolean;
}

/** The open like window for (recipient, target), if any. */
export interface LikeWindow {
  firstAt: number;
  count: number;
}

export const LIKE_WINDOW_MS = 10 * 60 * 1000;

export type PushDecision =
  | { send: false }
  | { send: true; grouped: false }
  | { send: true; grouped: true; count: number };

const PREF_FOR: Record<PushKind, keyof PushPrefs> = {
  reply: 'replies',
  like: 'likes',
  mention: 'mentions',
  follow: 'follows',
  like_post_comment: 'replies',
  like_post_like: 'likes',
  status_reply: 'statuses',
  status_reaction: 'statuses',
  status_milestone: 'statuses',
};

const IS_LIKE: ReadonlySet<PushKind> = new Set(['like', 'like_post_like', 'status_reaction']);

export function isLikeKind(kind: PushKind): boolean {
  return IS_LIKE.has(kind);
}

export function shouldPush(
  notice: { kind: PushKind; actorId: string; recipientId: string; at: number },
  prefs: PushPrefs,
  rel: PushRelations,
  window: LikeWindow | null,
): PushDecision {
  if (notice.actorId === notice.recipientId) return { send: false };
  if (rel.blocked || rel.muted || rel.threadMuted) return { send: false };
  if (!prefs[PREF_FOR[notice.kind]]) return { send: false };
  if (!isLikeKind(notice.kind)) return { send: true, grouped: false };
  if (notice.kind === 'like' && rel.likeNoticesOff) return { send: false };
  if (window && notice.at - window.firstAt < LIKE_WINDOW_MS) {
    return { send: true, grouped: true, count: window.count + 1 };
  }
  return { send: true, grouped: false };
}
