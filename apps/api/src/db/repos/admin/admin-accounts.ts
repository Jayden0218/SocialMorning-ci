// Admin-made accounts: create one or many, edit, with or without email.
/**
 * M15 T027 — accounts the admin makes (FR-019, FR-020; research R6).
 *
 * An account with no email gets `acct-<uuid>@accounts.invalid` (RFC 2606 reserves `.invalid`; it
 * can never receive mail). The password hash is of random bytes nobody knows, as code sign-in
 * does (routes/account/auth.ts), so a real email added later signs in with a code. `made_by` names the
 * admin. Bulk results come back in input order; a refused row never stops the others.
 */
import { viaStore } from '../../backend.ts';

export type AccountInput = { displayName: string; bio?: string | undefined; email?: string | undefined };
export type AccountResult = { ok: true; id: string } | { ok: false; reason: string };
export type Account = { id: string; email: string; displayName: string; bio: string | null; createdAt: string; suspended: boolean; madeBy: string | null; placeholderEmail: boolean };

export const MAX_BULK = 50;
export const PLACEHOLDER_DOMAIN = '@accounts.invalid';

type Row = { id: string; email: string; display_name: string; bio: string | null; created_at: Date | string; suspended_at: Date | string | null; made_by: string | null };
export const toAccount = (r: Row): Account => ({
  id: r.id, email: r.email, displayName: r.display_name, bio: r.bio, createdAt: new Date(r.created_at).toISOString(),
  suspended: r.suspended_at !== null, madeBy: r.made_by, placeholderEmail: r.email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN),
});

// DynamoDB bodies: safety/ddb/admin-accounts.ts (db/backend.ts).
export const accountsByIds = viaStore<typeof import('../safety/ddb/admin-accounts.ts').accountsByIds>('sf/admin-accounts', 'accountsByIds');
export const madeAccounts = viaStore<typeof import('../safety/ddb/admin-accounts.ts').madeAccounts>('sf/admin-accounts', 'madeAccounts');
export const createAccounts = viaStore<typeof import('../safety/ddb/admin-accounts.ts').createAccounts>('sf/admin-accounts', 'createAccounts');
export const emailTaken = viaStore<typeof import('../safety/ddb/admin-accounts.ts').emailTaken>('sf/admin-accounts', 'emailTaken');
export const updateAccount = viaStore<typeof import('../safety/ddb/admin-accounts.ts').updateAccount>('sf/admin-accounts', 'updateAccount');
