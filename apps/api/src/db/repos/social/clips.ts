// Clips: save, list and delete a time range of an episode, no audio.
/**
 * Clips (M4 FR-001..006): a RANGE on an episode, no media. `create` is idempotent on
 * (author, clientId) — a phone that retries after a crash makes one clip (G8) — and
 * writes the `clipped` activity row in the same transaction (research R4).
 */
import { viaStore } from '../../backend.ts';

export type ClipRow = {
  id: string; author_id: string; author_name: string | null; client_id: string; episode_id: string; reported?: boolean;
  start_ms: number; end_ms: number; caption: string; created_at: string; deleted_at: string | null; removed_at?: string | null;
};

export type ClipOut = {
  id: string; author: { id: string; displayName: string | null }; episodeId: string;
  startMs: number; endMs: number; caption: string; createdAt: string; deleted: boolean; removed?: boolean; reported?: boolean;
};

export const toClipOut = (r: ClipRow): ClipOut => ({
  id: r.id, author: { id: r.author_id, displayName: r.author_name }, episodeId: r.episode_id,
  startMs: r.start_ms, endMs: r.end_ms, caption: r.caption, createdAt: new Date(r.created_at).toISOString(), deleted: r.deleted_at !== null || r.removed_at != null,
  ...(r.removed_at != null ? { removed: true } : {}),
  ...(r.reported ? { reported: true } : {}),
});

// Bodies in ddb/clips.ts (src/db/backend.ts).
export const createClip = viaStore<typeof import('./ddb/clips.ts').createClip>('sc/clips', 'createClip');
export const getClip = viaStore<typeof import('./ddb/clips.ts').getClip>('sc/clips', 'getClip');
export const listClipsForEpisode = viaStore<typeof import('./ddb/clips.ts').listClipsForEpisode>('sc/clips', 'listClipsForEpisode');
export const deleteClip = viaStore<typeof import('./ddb/clips.ts').deleteClip>('sc/clips', 'deleteClip');
