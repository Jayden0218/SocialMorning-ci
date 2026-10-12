// Builds one listener's own data as JSON: profile, library, comments, clips, statuses, lists, purchases and tips.
/**
 * M25 lane SB (audit #19, PDPA/GDPR access and portability). Everything here is the listener's
 * own rows, read by their id — never another person's. Secrets and internal keys are left out
 * (password and code hashes, session tokens, store purchase tokens, storage paths), and byte
 * columns are dropped. Big integers become strings so the JSON is always valid.
 */
import { viaStore } from '../../backend.ts';

/** The sections of the file, in order (account/ddb/account.ts fills each from the owning lane's items). */
export const SECTIONS: readonly string[] = [
  'subscriptions', 'positions', 'library', 'listened', 'likes', 'reactions', 'following', 'comments', 'heldComments', 'clips',
  'statuses', 'statusItems', 'playlists', 'playlistItems', 'sharedLists', 'queue', 'purchases', 'entitlements', 'tips', 'giftsBought', 'devices',
];

export const exportData = viaStore<typeof import('./ddb/index.ts').exportData>('ac/index', 'exportData');
