/**
 * Clips on the phone (M4 US1, FR-001/FR-001a, research R8). A new clip is a PENDING row
 * first — made offline or not — and `sendPending()` posts it when it can: register the
 * episode (M3's R6), then POST with the phone-generated `clientId`, so a retry after a
 * crash makes one clip (server guard G8). Share is offered only once the server id is
 * known, because the link does not exist before then.
 */
import { validateClipRange, type ClipRange } from '@socialmorning/social-core';
import type { ApiClient, Clip, EpisodeRegistration } from '../social/api';
import { ApiError } from '../social/api';
import type { PendingClipRow, PendingClipStore } from '../storage/types';

export type ClipsDeps = {
  api: ApiClient;
  pending: PendingClipStore;
  isSignedIn: () => boolean;
  now: () => number;
  registration: (episodeId: string) => EpisodeRegistration | undefined;
  newClientId: () => string;
  /** Told about every clip that reached the server, so the episode's list can update. */
  onSent?: (clip: Clip) => void;
};

export type CreateResult =
  | { kind: 'sent'; clip: Clip }
  | { kind: 'pending'; row: PendingClipRow }
  | { kind: 'needsSignIn' }
  | { kind: 'invalid'; reason: string };

export type Clips = {
  create(episodeId: string, range: ClipRange, caption: string, durationMs?: number): Promise<CreateResult>;
  /** Posts every pending clip in creation order; stops at the first network failure. Returns what was sent. */
  sendPending(): Promise<Clip[]>;
  pendingFor(episodeId: string): PendingClipRow[];
};

export function createClips(deps: ClipsDeps): Clips {
  let sending: Promise<Clip[]> | undefined;

  async function sendOne(row: PendingClipRow): Promise<Clip | 'stop' | 'dropped'> {
    const reg = deps.registration(row.episodeId);
    try {
      if (reg) await deps.api.registerEpisode(row.episodeId, reg);
      const clip = await deps.api.postClip(row.episodeId, { clientId: row.clientId, startMs: row.startMs, endMs: row.endMs, caption: row.caption });
      deps.pending.remove(row.clientId);
      deps.onSent?.(clip);
      return clip;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('internal', String(e), 0);
      if (err.code === 'network' || err.code === 'unauthenticated') {
        // Not now: keep it, try again on the next tick. (Signed out: it waits for sign-in.)
        deps.pending.put({ ...row, attempts: row.attempts + 1, lastError: err.code });
        return 'stop';
      }
      // The server said no for good (validation, not_found, …): the clip cannot be made.
      deps.pending.put({ ...row, attempts: row.attempts + 1, lastError: err.message });
      return 'dropped';
    }
  }

  async function sendPending(): Promise<Clip[]> {
    if (sending) return sending;
    sending = (async () => {
      const sent: Clip[] = [];
      if (!deps.isSignedIn()) return sent;
      for (const row of deps.pending.list()) {
        if (row.lastError !== undefined && row.lastError !== 'network' && row.lastError !== 'unauthenticated') continue; // refused for good: shown, not retried
        const r = await sendOne(row);
        if (r === 'stop') break;
        if (r !== 'dropped') sent.push(r);
      }
      return sent;
    })();
    try { return await sending; } finally { sending = undefined; }
  }

  return {
    async create(episodeId, range, caption, durationMs) {
      const check = validateClipRange(range, durationMs);
      if (!check.ok) return { kind: 'invalid', reason: check.reason };
      if (!deps.isSignedIn()) return { kind: 'needsSignIn' };
      const row: PendingClipRow = { clientId: deps.newClientId(), episodeId, startMs: range.startMs, endMs: range.endMs, caption: caption.trim().slice(0, 200), createdAt: deps.now(), attempts: 0 };
      deps.pending.put(row);
      const sent = await sendPending();
      const mine = sent.find((c) => c.startMs === row.startMs && c.endMs === row.endMs && c.episodeId === episodeId);
      const still = deps.pending.list().find((p) => p.clientId === row.clientId);
      if (mine && !still) return { kind: 'sent', clip: mine };
      return { kind: 'pending', row: still ?? row };
    },
    sendPending,
    pendingFor: (episodeId) => deps.pending.listForEpisode(episodeId),
  };
}
