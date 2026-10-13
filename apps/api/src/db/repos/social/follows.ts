// Follow and unfollow listeners, and list followers and following.
/** Follows (M4 FR-007): one-way, idempotent both ways, never self (the CHECK is guard G4). */
import { viaStore } from '../../backend.ts';

export type ListenerLite = { id: string; displayName: string | null; avatarUrl?: string; /** M21 US8 */ bio?: string; youFollow?: boolean };

// Bodies in graph-ddb/ (src/db/backend.ts).
export const follow = viaStore<typeof import('./graph-ddb/index.ts').follow>('sg/index', 'follow');
export const unfollow = viaStore<typeof import('./graph-ddb/index.ts').unfollow>('sg/index', 'unfollow');
export const isFollowing = viaStore<typeof import('./graph-ddb/index.ts').isFollowing>('sg/index', 'isFollowing');
export const counts = viaStore<typeof import('./graph-ddb/index.ts').counts>('sg/index', 'counts');
export const followers = viaStore<typeof import('./graph-ddb/index.ts').followers>('sg/index', 'followers');
export const following = viaStore<typeof import('./graph-ddb/index.ts').following>('sg/index', 'following');
