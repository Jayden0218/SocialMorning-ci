// Database queries for changing the sign-in email (M26: moved here from routes/account/email.ts).
import { viaStore } from '../../backend.ts';

/** The pending change's send time, if one is pending. */
export const pendingEmailChangeRows = viaStore<typeof import('./ddb/index.ts').pendingEmailChangeRows>('ac/index', 'pendingEmailChangeRows');

/** Store (or replace) the pending change with fresh codes and zero tries. */
export const saveEmailChange = viaStore<typeof import('./ddb/index.ts').saveEmailChange>('ac/index', 'saveEmailChange');

export type EmailChangeTry = { new_email: string; code_hash: Buffer | Uint8Array; old_code_hash: Buffer | Uint8Array | null; tries: number };

/** Reserve one try on a live pending change; no row when it expired or is out of tries. */
export const takeEmailChangeTry = viaStore<typeof import('./ddb/index.ts').takeEmailChangeTry>('ac/index', 'takeEmailChangeTry');

/** Drop the pending change. */
export const deleteEmailChange = viaStore<typeof import('./ddb/index.ts').deleteEmailChange>('ac/index', 'deleteEmailChange');

/**
 * Switch the email in one transaction: false when another account took it meanwhile; otherwise
 * the pending change and both addresses' sign-in codes go, and every other session is signed out.
 */
export const switchEmail = viaStore<typeof import('./ddb/index.ts').switchEmail>('ac/index', 'switchEmail');
