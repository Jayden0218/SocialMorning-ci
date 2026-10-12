// Show hosts added by single-use invite links lasting four days, five hosts maximum.
/**
 * M14 US2 — hosts are real accounts, added the way 小宇宙 adds them: the owner makes an invite
 * link, the host opens it signed in and accepts (FR-02). The token is 24 random bytes, stored
 * only as its hash; one use; 4 days; revocable. At most 5 hosts per show.
 */
import { viaStore } from '../../backend.ts';

export const INVITE_DAYS = 4;
export const MAX_HOSTS = 5;

// DynamoDB bodies: ddb/team.ts (db/backend.ts).
export const createInvite = viaStore<typeof import('./ddb/team.ts').createInvite>('st/team', 'createInvite');
export const openInvites = viaStore<typeof import('./ddb/team.ts').openInvites>('st/team', 'openInvites');
export const revokeInvite = viaStore<typeof import('./ddb/team.ts').revokeInvite>('st/team', 'revokeInvite');
export const previewInvite = viaStore<typeof import('./ddb/team.ts').previewInvite>('st/team', 'previewInvite');
export const acceptInvite = viaStore<typeof import('./ddb/team.ts').acceptInvite>('st/team', 'acceptInvite');
export const listHosts = viaStore<typeof import('./ddb/team.ts').listHosts>('st/team', 'listHosts');
export const removeHost = viaStore<typeof import('./ddb/team.ts').removeHost>('st/team', 'removeHost');
