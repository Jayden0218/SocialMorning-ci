// The admin user pages: search, one account in full, PLUS by hand, photo and bio removal, the deletion queue.
import { viaStore } from '../../backend.ts';

// The money reads and the PLUS writes of this page live with the paid repo; re-exported here.
export {
  giftsOf, grantPlusByAdmin, plusEntitlements, purchasesOf, revokeAllPlus, tipsSentBy, type MoneyRow,
} from '../account/purchases.ts';

export type UserRow = { id: string; display_name: string; email: string; created_at: Date | string; suspended_at: Date | string | null; made_by: string | null };

export type PendingDeletionRow = { listener_id: string; display_name: string; email: string; requested_at: Date | string; due_at: Date | string };

// DynamoDB bodies: safety/ddb/admin-users.ts (db/backend.ts); the PLUS, purchase, tip and gift reads are in account/purchases.ts.
export const userRowById = viaStore<typeof import('../safety/ddb/admin-users.ts').userRowById>('sf/admin-users', 'userRowById');
export const searchUsers = viaStore<typeof import('../safety/ddb/admin-users.ts').searchUsers>('sf/admin-users', 'searchUsers');
export const renameListener = viaStore<typeof import('../safety/ddb/admin-users.ts').renameListener>('sf/admin-users', 'renameListener');
export const profileExtras = viaStore<typeof import('../safety/ddb/admin-users.ts').profileExtras>('sf/admin-users', 'profileExtras');
export const reportsAgainst = viaStore<typeof import('../safety/ddb/admin-users.ts').reportsAgainst>('sf/admin-users', 'reportsAgainst');
export const openDeletionOf = viaStore<typeof import('../safety/ddb/admin-users.ts').openDeletionOf>('sf/admin-users', 'openDeletionOf');
export const studioShowsOf = viaStore<typeof import('../safety/ddb/admin-users.ts').studioShowsOf>('sf/admin-users', 'studioShowsOf');
export const avatarUrlOf = viaStore<typeof import('../safety/ddb/admin-users.ts').avatarUrlOf>('sf/admin-users', 'avatarUrlOf');
export const clearAvatar = viaStore<typeof import('../safety/ddb/admin-users.ts').clearAvatar>('sf/admin-users', 'clearAvatar');
export const clearBio = viaStore<typeof import('../safety/ddb/admin-users.ts').clearBio>('sf/admin-users', 'clearBio');
export const openReportCount = viaStore<typeof import('../safety/ddb/admin-users.ts').openReportCount>('sf/admin-users', 'openReportCount');
export const pendingDeletions = viaStore<typeof import('../safety/ddb/admin-users.ts').pendingDeletions>('sf/admin-users', 'pendingDeletions');
// The hosted show: studio/ddb/hosted.ts.
export const paidHostedShowRows = viaStore<typeof import('../studio/ddb/hosted.ts').paidHostedShowRows>('st/hosted', 'paidHostedShowRows');
