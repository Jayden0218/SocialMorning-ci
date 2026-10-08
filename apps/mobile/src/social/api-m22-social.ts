// Server calls for M22's social layer: push switches, muted threads, status replies, reactions, items and photos.
/**
 * M22 US1, US2, US3, US6 (specs/023-m22-the-xiaoyuzhou-gaps-2/contracts/api.md "Push", "Statuses").
 * Its own client like `us8-api.ts`, so the test fakes of `ApiClient` need no new methods. Same
 * transport as `createApi`. A recording or a photo is sent raw (not JSON), as voice statuses are.
 *
 * The pure helpers at the top say what a new notice kind reads, where it opens, and which thread
 * "Mute this" mutes — tested alone.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';
import type { VoicePost } from './m12-api';
import { typedAudio } from './comment-extras-api';

// ---- Push switches (US1) ----

export type PushSwitches = {
  newEpisodes: boolean; popular: boolean; replies: boolean; likes: boolean;
  follows: boolean; mentions: boolean; statuses: boolean; digest: boolean;
};
export type PushSwitch = keyof PushSwitches;

// ---- Notices (US2, US3) ----

export type M22NoticeKind = 'reply' | 'like' | 'mention' | 'follow' | 'like_post_comment' | 'like_post_like' | 'status_reply' | 'status_reaction' | 'status_milestone';
export type NoticeRef = { commentId?: string; parentId?: string; episodeId?: string; ownerId?: string; postId?: string; excerpt?: string; episodeTitle?: string };

/** What a row says after the actor's name, for every kind the server sends since M22. */
export function m22NoticeVerb(kind: string): string {
  switch (kind) {
    case 'reply': return 'replied to your comment';
    case 'like': return 'liked your comment';
    case 'mention': return 'mentioned you';
    case 'follow': return 'started following you';
    case 'like_post_comment': return 'commented on your like';
    case 'like_post_like': return 'reacted to your like';
    case 'status_reply': return 'replied to your status';
    case 'status_reaction': return 'reacted to your status';
    case 'status_milestone': return 'helped your status reach 100 reactions';
    default: return 'did something';
  }
}

/** Where a like-post or status notice opens; undefined → the older rule (`noticeTarget`). */
export function m22NoticeTarget(kind: string, ref: NoticeRef): string | undefined {
  if ((kind === 'like_post_comment' || kind === 'like_post_like') && ref.ownerId && ref.episodeId) {
    return `/like/${encodeURIComponent(ref.ownerId)}/${encodeURIComponent(ref.episodeId)}`;
  }
  if (kind.startsWith('status_') && ref.postId) return `/status/${encodeURIComponent(ref.postId)}`;
  return undefined;
}

export type ThreadKind = 'comment' | 'like_post';
/** The thread "Mute this" mutes — the same keys the server makes (`threadOf` in account/push.ts). */
export function noticeThread(kind: string, ref: NoticeRef): { threadKind: ThreadKind; threadKey: string } | undefined {
  if ((kind === 'like_post_comment' || kind === 'like_post_like') && ref.ownerId && ref.episodeId) return { threadKind: 'like_post', threadKey: `${ref.ownerId}:${ref.episodeId}` };
  if (kind === 'reply' || kind === 'mention') {
    const key = ref.parentId ?? ref.commentId;
    return key ? { threadKind: 'comment', threadKey: key } : undefined;
  }
  if (kind === 'like' && ref.commentId) return { threadKind: 'comment', threadKey: ref.commentId };
  return undefined;
}

export type MutedThread = { threadKind: ThreadKind; threadKey: string; title: string; createdAt: string };

// ---- Statuses (US2, US6) ----

/** The six reactions, in order (kind 1–6). Our own set, words for the screen reader. */
export const REACTIONS: readonly { kind: number; emoji: string; label: string }[] = [
  { kind: 1, emoji: '❤️', label: 'Love' },
  { kind: 2, emoji: '😂', label: 'Funny' },
  { kind: 3, emoji: '👏', label: 'Applause' },
  { kind: 4, emoji: '🤔', label: 'Thinking' },
  { kind: 5, emoji: '😮', label: 'Wow' },
  { kind: 6, emoji: '🎧', label: 'Listening too' },
];
export const REPLY_TEXT_MAX = 140;
export const STATUS_ITEMS_MAX = 10;

export type StatusItem =
  | { kind: 'episode'; episodeId: string; title?: string; showTitle?: string; imageUrl?: string; feedUrl?: string; enclosureUrl?: string; durationMs?: number }
  | { kind: 'photo'; url: string };
export type StatusItemIn = { kind: 'episode'; episodeId: string } | { kind: 'photo'; imageKey: string };

export type Status = VoicePost & {
  author: VoicePost['author'] & { avatarUrl?: string };
  items: StatusItem[];
  reactions: { kind: number; count: number }[];
  myReaction: number | null;
  /** The owner only. */
  replyCount?: number;
  reactedBy?: { id: string; name: string; kind: number }[];
  suggested: boolean;
};

export type StatusReply = {
  id: string;
  author: { id: string; name: string; initials: string | null; avatarUrl?: string };
  body?: string;
  url?: string;
  durationMs?: number;
  createdAt: string;
  mine: boolean;
};

/** Older servers send none of the M22 fields; fill them so screens need no checks. */
export function normaliseStatus(p: Partial<Status> & VoicePost): Status {
  return { ...p, items: Array.isArray(p.items) ? p.items : [], reactions: Array.isArray(p.reactions) ? p.reactions : [], myReaction: typeof p.myReaction === 'number' ? p.myReaction : null, suggested: p.suggested === true };
}

/** Next and previous in the viewer: a tap on the right third moves on, the left third goes back; null past either end. */
export function stepStatus(index: number, count: number, side: 'left' | 'right'): number | null {
  const next = side === 'right' ? index + 1 : index - 1;
  return next < 0 || next >= count ? null : next;
}

export type M22SocialApi = ReturnType<typeof createM22SocialApi>;

export function createM22SocialApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  /** A raw upload (recording or photo) — M23 US9: through the shared helper's `raw`. */
  const rawPost = async <T,>(path: string, body: Blob, headers: Record<string, string>): Promise<T> =>
    (await call.raw<T>('POST', path, body, headers)).json;
  return {
    // US1
    pushSwitches: async () => (await call<Partial<PushSwitches>>('GET', '/v1/me/push-prefs')).json,
    setPushSwitches: async (p: Partial<PushSwitches>) => { await call('PUT', '/v1/me/push-prefs', p); },
    // US3
    mutedThreads: async () => (await call<{ items: MutedThread[] }>('GET', '/v1/me/muted-threads')).json.items,
    muteThread: async (t: { threadKind: ThreadKind; threadKey: string }) => { await call('PUT', '/v1/me/muted-threads', t); },
    unmuteThread: async (t: { threadKind: ThreadKind; threadKey: string }) => {
      await call('DELETE', `/v1/me/muted-threads?threadKind=${enc(t.threadKind)}&threadKey=${enc(t.threadKey)}`);
    },
    setLikeNotices: async (commentId: string, off: boolean) => { await call('PUT', `/v1/comments/${enc(commentId)}/like-notices`, { off }); },
    // US2
    statuses: async (): Promise<Status[]> => (await call<{ items: (Partial<Status> & VoicePost)[] }>('GET', '/v1/voice-posts?from=following&suggested=1')).json.items.map(normaliseStatus),
    status: async (id: string): Promise<Status> => normaliseStatus((await call<Partial<Status> & VoicePost>('GET', `/v1/voice-posts/${enc(id)}`)).json),
    replies: async (postId: string) => (await call<{ items: StatusReply[] }>('GET', `/v1/voice-posts/${enc(postId)}/replies`)).json.items,
    replyText: async (postId: string, body: string) => (await call<{ id: string }>('POST', `/v1/voice-posts/${enc(postId)}/replies`, { body: body.trim() })).json,
    replyVoice: async (postId: string, file: Blob, durationMs: number) =>
      rawPost<{ id: string; url: string }>(`/v1/voice-posts/${enc(postId)}/replies`, typedAudio(file), { 'content-type': 'audio/mp4', 'x-duration-ms': String(Math.round(durationMs)) }),
    deleteReply: async (postId: string, replyId: string) => { await call('DELETE', `/v1/voice-posts/${enc(postId)}/replies/${enc(replyId)}`); },
    react: async (postId: string, kind: number) => { await call('PUT', `/v1/voice-posts/${enc(postId)}/reaction`, { kind }); },
    unreact: async (postId: string) => { await call('DELETE', `/v1/voice-posts/${enc(postId)}/reaction`); },
    // US6
    uploadPhoto: async (file: Blob) => rawPost<{ imageKey: string; url: string }>('/v1/voice-posts/images', file, { 'content-type': 'image/jpeg' }),
    /** A voice status with its items in `x-items` (the body is the recording, as `m12.postVoice`). */
    postVoice: async (file: Blob, durationMs: number, transcript: string | undefined, items: readonly StatusItemIn[]) =>
      rawPost<{ id: string; url: string; expiresAt: string }>('/v1/voice-posts', typedAudio(file), {
        'content-type': 'audio/mp4', 'x-duration-ms': String(Math.round(durationMs)),
        ...(transcript ? { 'x-transcript': encodeURIComponent(transcript) } : {}), ...itemsHeader(items),
      }),
    postTextStatus: async (body: string, items: readonly StatusItemIn[]) => (await call<{ id: string }>('POST', '/v1/voice-posts', { body: body.trim(), ...(items.length > 0 ? { items } : {}) })).json,
    // M24 US17: stop suggesting this person's statuses, and undo.
    stopSuggesting: async (listenerId: string) => { await call('PUT', `/v1/voice-posts/suggestions/muted/${enc(listenerId)}`); },
    resumeSuggesting: async (listenerId: string) => { await call('DELETE', `/v1/voice-posts/suggestions/muted/${enc(listenerId)}`); },
  };
}

/** The `x-items` header a voice status carries its items in (URI-encoded JSON). */
export function itemsHeader(items: readonly StatusItemIn[]): Record<string, string> {
  return items.length > 0 ? { 'x-items': encodeURIComponent(JSON.stringify(items)) } : {};
}

export function useM22SocialApi(): M22SocialApi {
  return useMemo(() => createM22SocialApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
