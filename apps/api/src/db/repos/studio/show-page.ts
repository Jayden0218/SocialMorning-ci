// What the app's show page reads from us: subscribers, hosts with faces, host picks, owner info.
/**
 * M21 US5 (FR-040…FR-042, contracts/api.md "Episode and show"). The show page draws from the
 * RSS feed on the phone; these are the parts only the server knows.
 *
 * - `subscriberCount`: our own count — live `subscriptions` rows (`deleted_at IS NULL`, the
 *   tombstone rule of migration 005); 0 for a feed moderation has hidden.
 * - `showHosts`: the verified owner (the PROVEN claim) first, then the invited hosts
 *   (`show_hosts`), each with a face; suspended accounts are left out.
 * - Host picks: up to 20 of the show's episodes, in the host's order (`host_picks`, migration 019).
 * - `showInfo`: who stands behind the show — created in the Studio, claimed, or only a feed —
 *   and the owner's country (two letters, guard G-I1), never more.
 */
import { viaStore } from '../../backend.ts';

import { HOST_PICKS_MAX } from '@socialmorning/social-core';
export { HOST_PICKS_MAX };

export type ShowHost = { id: string; name: string; avatarUrl: string | null };

export type ShowInfo = { ownerType: 'claimed' | 'studio' | 'feed'; ownerCountry: string | null; feedUrl: string; claimedAt: string | null };

export type ShowPageAnnouncementRow = { id: string; body: string; created_at: Date | string; edited_at: Date | string | null; images: unknown };

// DynamoDB bodies: ddb/page.ts (db/backend.ts).
export const subscriberCount = viaStore<typeof import('./ddb/page.ts').subscriberCount>('st/page', 'subscriberCount');
export const showHosts = viaStore<typeof import('./ddb/page.ts').showHosts>('st/page', 'showHosts');
export const hostPicks = viaStore<typeof import('./ddb/page.ts').hostPicks>('st/page', 'hostPicks');
export const setHostPicks = viaStore<typeof import('./ddb/page.ts').setHostPicks>('st/page', 'setHostPicks');
export const hostPickItems = viaStore<typeof import('./ddb/page.ts').hostPickItems>('st/page', 'hostPickItems');
export const showInfo = viaStore<typeof import('./ddb/page.ts').showInfo>('st/page', 'showInfo');
export const latestAnnouncementRows = viaStore<typeof import('./ddb/page.ts').latestAnnouncementRows>('st/page', 'latestAnnouncementRows');
export const newestEpisodeImageRows = viaStore<typeof import('./ddb/page.ts').newestEpisodeImageRows>('st/page', 'newestEpisodeImageRows');
