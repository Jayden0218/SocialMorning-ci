// The Following feed: activity by people you follow, newest first, in pages.
/**
 * The Following feed (M4 FR-008, research R4): activity rows by the people a listener
 * follows, `hidden = false` (guard G5: a private actor's listens never show — the flag was
 * fixed when the row was written, R5), newest first, keyset-paged on (created_at, id).
 */
import { createHash } from 'node:crypto';
import { viaStore } from '../../backend.ts';

export type ActivityKind = 'listened' | 'clipped' | 'commented';

export type FeedRow = {
  id: string; kind: ActivityKind; actor_id: string; actor_name: string | null;
  episode_id: string; episode_title: string; show_title: string | null; image_url: string | null;
  moment_ms: number | null; ref_id: string | null; created_at: string;
};

export type FeedItemOut = {
  id: number; kind: ActivityKind; actor: { id: string; displayName: string | null };
  episode: { id: string; title: string; showTitle: string | null; imageUrl: string | null };
  momentMs: number | null; refId: string | null; createdAt: string;
};

export const toFeedItem = (r: FeedRow): FeedItemOut => ({
  id: Number(r.id), kind: r.kind, actor: { id: r.actor_id, displayName: r.actor_name },
  episode: { id: r.episode_id, title: r.episode_title, showTitle: r.show_title, imageUrl: r.image_url },
  momentMs: r.moment_ms, refId: r.ref_id, createdAt: new Date(r.created_at).toISOString(),
});

/** A weak validator for the first page: the newest visible id and the count, hashed. */
export function etagFor(items: readonly FeedRow[]): string {
  const h = createHash('sha256').update(items.map((r) => r.id).join(',')).digest('base64url').slice(0, 16);
  return `W/"${h}"`;
}

// Bodies in graph-ddb/ (src/db/backend.ts).
export const feedFor = viaStore<typeof import('./graph-ddb/index.ts').feedFor>('sg/index', 'feedFor');
export const recentBy = viaStore<typeof import('./graph-ddb/index.ts').recentBy>('sg/index', 'recentBy');
