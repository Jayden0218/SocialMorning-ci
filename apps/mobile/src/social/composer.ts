/**
 * The comment box (US1, FR-006..FR-011). Pure orchestration: the screen gives it
 * the player snapshot when it opens, and it owns the captured moment from then on.
 *
 *   open()  → captureMoment ONCE (guard G5 lives in social-core's tests)
 *   submit() → register the episode, post, refetch social once, clear the draft
 *
 * Signed out: nothing is sent; the draft (text + moment) is saved so it survives
 * the trip through sign-in (US1 #6).
 */
import { captureMoment, type Moment } from '@socialmorning/social-core';
import type { ApiClient, Comment, EpisodeRegistration } from './api';
import { ApiError } from './api';
import type { Drafts } from './drafts';
import type { SocialCache } from './cache';

export type ComposerDeps = {
  api: ApiClient;
  drafts: Drafts;
  cache: SocialCache;
  isSignedIn: () => boolean;
  now: () => number;
  /** How the phone describes the episode to the server (client-registered, R6). */
  registration: (episodeId: string) => EpisodeRegistration | undefined;
};

export type ComposerState = {
  episodeId: string;
  body: string;
  moment: Moment | null;
  parentId?: string;
  durationMs?: number;
};

export type SubmitResult =
  | { kind: 'posted'; comment: Comment }
  | { kind: 'needsSignIn' }
  | { kind: 'failed'; error: ApiError };

export function createComposer(deps: ComposerDeps) {
  return {
    /** Opens the box: restores a draft if one exists, else captures the moment now. */
    open(snapshot: { episodeId: string; offsetMs: number; durationMs?: number }, parentId?: string): ComposerState {
      const draft = deps.drafts.load(snapshot.episodeId);
      const moment = draft ? (draft.offsetMs === undefined ? null : { offsetMs: draft.offsetMs }) : captureMoment(snapshot);
      return {
        episodeId: snapshot.episodeId,
        body: draft?.body ?? '',
        moment,
        ...(parentId !== undefined ? { parentId } : draft?.parentId !== undefined ? { parentId: draft.parentId } : {}),
        ...(snapshot.durationMs !== undefined ? { durationMs: snapshot.durationMs } : {}),
      };
    },

    /** Every keystroke; the draft store debounces. */
    edit(state: ComposerState, body: string): ComposerState {
      const next = { ...state, body };
      deps.drafts.save({ episodeId: next.episodeId, body, ...(next.moment ? { offsetMs: next.moment.offsetMs } : {}), ...(next.parentId ? { parentId: next.parentId } : {}) });
      return next;
    },

    removeMoment(state: ComposerState): ComposerState {
      const next = { ...state, moment: null };
      deps.drafts.save({ episodeId: next.episodeId, body: next.body, ...(next.parentId ? { parentId: next.parentId } : {}) });
      return next;
    },

    canSubmit: (state: ComposerState) => state.body.trim().length >= 1 && state.body.trim().length <= 2000,

    async submit(state: ComposerState): Promise<SubmitResult> {
      deps.drafts.flush();
      if (!deps.isSignedIn()) return { kind: 'needsSignIn' };
      try {
        const reg = deps.registration(state.episodeId);
        if (reg) await deps.api.registerEpisode(state.episodeId, { ...reg, ...(state.durationMs !== undefined ? { durationMs: state.durationMs } : {}) });
        const comment = await deps.api.postComment(state.episodeId, {
          body: state.body.trim(),
          ...(state.moment ? { offsetMs: state.moment.offsetMs } : {}),
          ...(state.parentId ? { parentId: state.parentId } : {}),
          ...(state.durationMs !== undefined ? { durationMs: state.durationMs } : {}),
        });
        deps.drafts.clear(state.episodeId);
        // One refetch so the marker appears without leaving the screen (T029).
        const r = await deps.api.social(state.episodeId).catch(() => undefined);
        if (r && r.status === 200) deps.cache.put(state.episodeId, r.body, r.etag, deps.now());
        return { kind: 'posted', comment };
      } catch (e) {
        const error = e instanceof ApiError ? e : new ApiError('internal', 'Something went wrong.', 0);
        return { kind: 'failed', error };
      }
    },

    async remove(episodeId: string, commentId: string): Promise<{ placeholder: boolean }> {
      const r = await deps.api.deleteComment(commentId);
      const s = await deps.api.social(episodeId).catch(() => undefined);
      if (s && s.status === 200) deps.cache.put(episodeId, s.body, s.etag, deps.now());
      return r;
    },
  };
}

export type Composer = ReturnType<typeof createComposer>;
