// Voice status posts up to 60 seconds, fully deleted after 24 hours.
/**
 * M12 FR-104 — voice status posts (constitution 3.0.1: ≤ 60 s, deleted by the server at 24 h;
 * owner, 2026-10-05 — was 48 h; the column's default still says 48, so the insert sets it).
 * Guard G-V1: expiry DELETES — the blob first, then the row. Reads also never return an
 * expired row, but hiding is not deleting: a post that is only filtered would still sit in
 * the store for ever.
 */
import { viaStore } from '../../backend.ts';
import { initialsOf } from './comment-likes.ts';

export const VOICE_MAX_BYTES = 600_000;
export const VOICE_MAX_MS = 60_000;
/** At most this many live posts per listener at once. */
export const VOICE_LIVE_MAX = 5;

export type VoiceRow = { id: string; listener_id: string; blob_url: string | null; duration_ms: number | null; created_at: Date | string; expires_at: Date | string; /** M20 US3 */ transcript?: string | null; /** M21 US8: a text status has a body and no audio. */ body?: string | null };

/** M21 US8 (G-M21-8): a text status is 1–140 characters (the column CHECKs it too). */
export const TEXT_STATUS_MAX = 140;

export type PostRow = VoiceRow & { display_name: string; avatar_url: string | null };

export function toPublicPost(r: PostRow, viewerId: string) {
  return {
    id: r.id, author: { id: r.listener_id, name: r.display_name, initials: initialsOf(r.display_name), ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}) },
    // M21 US8: a text status has `body` and no `url` (durationMs 0).
    ...(r.body ? { body: r.body } : { url: r.blob_url }),
    durationMs: Number(r.duration_ms ?? 0), createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), mine: r.listener_id === viewerId,
    ...(r.transcript ? { text: r.transcript } : {}),
  };
}

export type PublicPost = ReturnType<typeof toPublicPost>;

/** M22 US2 (FR-010): at most this many suggested statuses after the people the viewer follows. */
export const SUGGESTED_MAX = 5;

// Bodies in ddb/voice-posts.ts (src/db/backend.ts).
export const liveCount = viaStore<typeof import('./ddb/voice-posts.ts').liveCount>('sc/voice-posts', 'liveCount');
export const insertPost = viaStore<typeof import('./ddb/voice-posts.ts').insertPost>('sc/voice-posts', 'insertPost');
export const insertTextPost = viaStore<typeof import('./ddb/voice-posts.ts').insertTextPost>('sc/voice-posts', 'insertTextPost');
export const fromFollowing = viaStore<typeof import('./ddb/voice-posts.ts').fromFollowing>('sc/voice-posts', 'fromFollowing');
export const suggestedFor = viaStore<typeof import('./ddb/voice-posts.ts').suggestedFor>('sc/voice-posts', 'suggestedFor');
export const visiblePost = viaStore<typeof import('./ddb/voice-posts.ts').visiblePost>('sc/voice-posts', 'visiblePost');
export const getPost = viaStore<typeof import('./ddb/voice-posts.ts').getPost>('sc/voice-posts', 'getPost');
export const removePost = viaStore<typeof import('./ddb/voice-posts.ts').removePost>('sc/voice-posts', 'removePost');
export const removeAttachments = viaStore<typeof import('./ddb/voice-posts.ts').removeAttachments>('sc/voice-posts', 'removeAttachments');
export const sweepExpired = viaStore<typeof import('./ddb/voice-posts.ts').sweepExpired>('sc/voice-posts', 'sweepExpired');
export const removeAllFor = viaStore<typeof import('./ddb/voice-posts.ts').removeAllFor>('sc/voice-posts', 'removeAllFor');
export const setSuggestionMute = viaStore<typeof import('./ddb/voice-posts.ts').setSuggestionMute>('sc/voice-posts', 'setSuggestionMute');
