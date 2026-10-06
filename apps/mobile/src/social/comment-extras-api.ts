// Server calls for comment extras: pin, mark unfriendly, the reply page, voice comments.
/**
 * M19 US5/US6 (specs/020-m19-the-rest-of-xiaoyuzhou/contracts/api.md, "Comments"), in their own
 * client like m12-api.ts so the test fakes of `ApiClient` need no new methods.
 *  - PUT/DELETE /v1/comments/:id/pin → 204 (the show's proven host only; 403 otherwise)
 *  - PUT/DELETE /v1/comments/:id/unfriendly → { folded } (not on your own comment)
 *  - GET /v1/comments/:id/thread → { parent, replies }
 *  - POST /v1/episodes/:id/comments/voice — raw audio/mp4, x-duration-ms, x-offset-ms, x-parent-id
 * The new comment fields are all optional, so an older server still parses (`extrasOf`).
 */
import { useMemo } from 'react';
import { ApiError, requester, type ApiDeps, type Comment } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type CommentVoice = { url: string; ms: number; /** M20 US3: the text its author posted with it. */ text?: string };
/** M19 fields on a comment: pinned by the host, folded for being unfriendly, reply count, voice. */
/** M20 US9: a comment's one picture, in the R2 image store. */
export type CommentImage = { url: string; w: number; h: number };
export type CommentExtras = { pinned?: true; folded?: true; replyCount?: number; voice?: CommentVoice; image?: CommentImage };
export type CommentPlus = Comment & CommentExtras;
export type Thread = { parent: CommentPlus; replies: CommentPlus[] };

/** The M19 fields of a comment, read safely whatever the `Comment` type says today. */
export function extrasOf(c: Comment): CommentExtras {
  const x = c as CommentPlus;
  const voice = x.voice && typeof x.voice.url === 'string' && typeof x.voice.ms === 'number' ? x.voice : undefined;
  const image = x.image && typeof x.image.url === 'string' && x.image.url.startsWith('https://') && x.image.w > 0 && x.image.h > 0 ? x.image : undefined;
  return {
    ...(x.pinned === true ? { pinned: true as const } : {}),
    ...(x.folded === true ? { folded: true as const } : {}),
    ...(typeof x.replyCount === 'number' ? { replyCount: x.replyCount } : {}),
    ...(voice ? { voice } : {}),
    ...(image ? { image } : {}),
  };
}

/** How many replies a comment has: the server's count, else the replies it sent. */
export const replyCountOf = (c: Comment): number => extrasOf(c).replyCount ?? (c.replies ?? []).filter((r) => !r.deleted).length;

/**
 * iPhone walk 2026-10-06 (B4): a Blob read back from a file has an empty type, and React Native's
 * fetch then sends ITS type as the Content-Type, over our header — the server refused the upload
 * ("Send the recording as audio/mp4"). The audio is re-wrapped with the type it really has.
 */
export function typedAudio(file: Blob): Blob {
  return file.type === 'audio/mp4' || file.type === 'audio/aac' ? file : new Blob([file], { type: 'audio/mp4' });
}

export type CommentExtrasApi = ReturnType<typeof createCommentExtrasApi>;

export function createCommentExtrasApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    pin: async (id: string) => { await call('PUT', `/v1/comments/${enc(id)}/pin`); },
    unpin: async (id: string) => { await call('DELETE', `/v1/comments/${enc(id)}/pin`); },
    markUnfriendly: async (id: string) => (await call<{ folded: boolean }>('PUT', `/v1/comments/${enc(id)}/unfriendly`)).json,
    unmarkUnfriendly: async (id: string) => (await call<{ folded: boolean }>('DELETE', `/v1/comments/${enc(id)}/unfriendly`)).json,
    thread: async (id: string) => (await call<Thread>('GET', `/v1/comments/${enc(id)}/thread`)).json,
    /** M20 US9 (FR-054): whether the server takes images — the picture button shows only when true. */
    imagesOn: async () => { try { return (await call<{ on: boolean }>('GET', '/v1/comments/images')).json.on === true; } catch { return false; } },
    /** M20 US9 (FR-053): the shrunk JPEG for a comment just posted — raw bytes, ≤ 1 000 000. */
    postImage: async (commentId: string, file: Blob, w: number, h: number): Promise<CommentPlus> => {
      const token = await deps.getToken();
      let res: Response;
      try {
        res = await deps.fetch(`${deps.baseUrl}/v1/comments/${enc(commentId)}/image`, {
          method: 'POST',
          headers: { 'content-type': 'image/jpeg', 'x-width': String(Math.round(w)), 'x-height': String(Math.round(h)), ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: file,
        });
      } catch (e) {
        throw new ApiError('network', "Couldn't reach the server.", 0, { cause: String(e) });
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; comment?: CommentPlus };
      if (!res.ok) throw new ApiError((json.error as never) ?? 'internal', json.message ?? `Server answered ${res.status}.`, res.status);
      return json.comment as CommentPlus;
    },
    /** FR-044: the recording as made (m4a), ≤ 60 s — raw bytes, so not through the JSON helper. */
    postVoice: async (episodeId: string, file: Blob, o: { durationMs: number; offsetMs?: number; parentId?: string; /** M20 US3 */ transcript?: string }): Promise<CommentPlus> => {
      const token = await deps.getToken();
      let res: Response;
      try {
        res = await deps.fetch(`${deps.baseUrl}/v1/episodes/${enc(episodeId)}/comments/voice`, {
          method: 'POST',
          headers: {
            'content-type': 'audio/mp4',
            'x-duration-ms': String(Math.round(o.durationMs)),
            ...(o.offsetMs !== undefined ? { 'x-offset-ms': String(Math.max(0, Math.round(o.offsetMs))) } : {}),
            ...(o.parentId ? { 'x-parent-id': o.parentId } : {}),
            ...(o.transcript ? { 'x-transcript': encodeURIComponent(o.transcript) } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: typedAudio(file),
        });
      } catch (e) {
        throw new ApiError('network', "Couldn't reach the server.", 0, { cause: String(e) });
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; comment?: CommentPlus } & Partial<CommentPlus>;
      if (!res.ok) throw new ApiError((json.error as never) ?? 'internal', json.message ?? `Server answered ${res.status}.`, res.status);
      // The task says 201 { comment }; the contract says the Comment itself — take either.
      return (json.comment ?? json) as CommentPlus;
    },
  };
}

export function useCommentExtrasApi(): CommentExtrasApi {
  return useMemo(() => createCommentExtrasApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
