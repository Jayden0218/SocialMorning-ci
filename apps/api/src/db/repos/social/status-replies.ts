// Replies and reactions on a status: text or voice replies only the owner and the author see, six reactions.
/**
 * M22 US2 (spec FR-007–FR-009; constitution 3.3.0 — voice replies on statuses; contracts/api.md
 * "Statuses"). A reply is text (1–140 characters) or a voice recording (≤ 60 s, ≤ 600 000 bytes,
 * the voice-status store). Only the status owner and the reply's author can read a reply; the
 * owner may delete any reply, the author their own. A listener has at most one reaction (1–6)
 * per status. Rows cascade with the status; a voice reply's file is deleted by the sweep (and on
 * delete) before its row — guard G-M22-2.
 *
 * Who may reply or react: anyone who can see the status — its author, a follower, or (since
 * suggestions, FR-010) any signed-in listener not blocked either way and not suspended.
 */
import { viaStore } from '../../backend.ts';

export const REPLY_TEXT_MAX = 140;
export const REACTION_KINDS = 6;
/** The owner is told once when one status reaches this many reactions (US2 scenario 5). */
export const REACTION_MILESTONE = 100;

export type StatusPostRow = { id: string; listener_id: string; expires_at: Date | string };

export type StatusReply = {
  id: string;
  author: { id: string; name: string; initials: string | null; avatarUrl?: string };
  body?: string;
  url?: string;
  durationMs?: number;
  createdAt: string;
  mine: boolean;
};

export type ReactionSummary = { reactions: { kind: number; count: number }[]; myReaction: number | null; replyCount?: number; reactedBy?: { id: string; name: string; kind: number }[] };

// Bodies in ddb/status-replies.ts (src/db/backend.ts).
export const visibleStatus = viaStore<typeof import('./ddb/status-replies.ts').visibleStatus>('sc/status-replies', 'visibleStatus');
export const addTextReply = viaStore<typeof import('./ddb/status-replies.ts').addTextReply>('sc/status-replies', 'addTextReply');
export const addAudioReply = viaStore<typeof import('./ddb/status-replies.ts').addAudioReply>('sc/status-replies', 'addAudioReply');
export const listReplies = viaStore<typeof import('./ddb/status-replies.ts').listReplies>('sc/status-replies', 'listReplies');
export const deleteReply = viaStore<typeof import('./ddb/status-replies.ts').deleteReply>('sc/status-replies', 'deleteReply');
export const setReaction = viaStore<typeof import('./ddb/status-replies.ts').setReaction>('sc/status-replies', 'setReaction');
export const clearReaction = viaStore<typeof import('./ddb/status-replies.ts').clearReaction>('sc/status-replies', 'clearReaction');
export const summaries = viaStore<typeof import('./ddb/status-replies.ts').summaries>('sc/status-replies', 'summaries');
export const replyAudioOf = viaStore<typeof import('./ddb/status-replies.ts').replyAudioOf>('sc/status-replies', 'replyAudioOf');
