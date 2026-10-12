// Host notices: announcements from the shows a listener follows, from their release time.
/**
 * M19 US10 (FR-062). The "From hosts" list in Notifications: announcements of every show the
 * listener subscribes to, newest first, only once `release_at` has come, never from a hidden show.
 * M24 US12: plus the show's subscriber-milestone message, to the one listener who crossed it.
 */
import { viaStore } from '../../backend.ts';

export const NOTICES_PAGE = 20;

export type HostNotice = { id: string; feedUrl: string; showTitle: string; imageUrl?: string; body: string; images: string[]; releaseAt: string };

// Bodies in graph-ddb/ (src/db/backend.ts).
export const hostNotices = viaStore<typeof import('./graph-ddb/index.ts').hostNotices>('sg/index', 'hostNotices');
