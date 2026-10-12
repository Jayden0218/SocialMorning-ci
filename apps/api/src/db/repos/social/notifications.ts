// Interaction notices: replies, likes, mentions and follows aimed at you, never from yourself or someone you shut out.
/**
 * M21 US10 (contracts/api.md "Notifications", G-M21-9). A row is written in the same transaction
 * as the act it reports. The guard is in `notify`: no row for a self-act, none to a recipient who
 * blocked the actor, none to a recipient who muted the actor. Read: newest first, a page of 30, `unread` = newer than `notifications_seen_at`.
 */
import { viaStore } from '../../backend.ts';

export type NoticeKind = 'reply' | 'like' | 'mention' | 'follow'
  // M22 US2/US3
  | 'like_post_comment' | 'like_post_like' | 'status_reply' | 'status_reaction' | 'status_milestone';

/** The most people one comment can mention; more are ignored (spam). */
export const MAX_MENTIONS = 5;

/**
 * The names a comment body may mention: for each `@`, the next one to four words (at most 40
 * characters), lower-cased. The caller matches them against display names, case-insensitively.
 */
export function mentionCandidates(body: string): string[][] {
  const out: string[][] = [];
  const re = /@([^\s@][^@\n]{0,39})/gu;
  for (const m of body.matchAll(re)) {
    const words = m[1]!.split(/\s+/).filter(Boolean);
    const cands: string[] = [];
    for (let i = 1; i <= Math.min(4, words.length); i += 1) {
      const name = words.slice(0, i).join(' ').replace(/[.,!?;:，。！？；：)]+$/u, '').toLowerCase();
      if (name && name.length <= 40) cands.push(name);
    }
    if (cands.length > 0) out.push(cands);
  }
  return out;
}

export type NoticeItem = {
  id: string;
  kind: NoticeKind;
  actor: { id: string; name: string; avatarUrl: string | null };
  ref: Record<string, string>;
  createdAt: string;
  unread: boolean;
};

/**
 * My notices, newest first, 30 a page; `cursor` is the last item's `createdAt`. Actors I have
 * blocked or muted since are left out too. `ref` gains the comment's `excerpt` (when it is still
 * visible) and the episode's `episodeTitle`, so a row can say what it is about.
 */
// Bodies in graph-ddb/ (src/db/backend.ts).
export const notify = viaStore<typeof import('./graph-ddb/index.ts').notify>('sg/index', 'notify');
export const mentionedIds = viaStore<typeof import('./graph-ddb/index.ts').mentionedIds>('sg/index', 'mentionedIds');
export const notifyForComment = viaStore<typeof import('./graph-ddb/index.ts').notifyForComment>('sg/index', 'notifyForComment');
export const listNotifications = viaStore<typeof import('./graph-ddb/index.ts').listNotifications>('sg/index', 'listNotifications');
export const markSeen = viaStore<typeof import('./graph-ddb/index.ts').markSeen>('sg/index', 'markSeen');
