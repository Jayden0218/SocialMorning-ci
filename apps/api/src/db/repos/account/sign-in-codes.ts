// Database queries for email sign-in codes (M26 F0-01: moved here from auth/codes.ts).
import { viaStore } from '../../backend.ts';

export type EmailCodeRow = { code_hash: Buffer | Uint8Array; sent_at: Date | string; expires_at: Date | string; attempts: number };

export const codeSentAtRows = viaStore<typeof import('./ddb/index.ts').codeSentAtRows>('ac/index', 'codeSentAtRows');

/** Stores (or replaces) the hashed code for an email, with zero attempts used. */
export const upsertEmailCode = viaStore<typeof import('./ddb/index.ts').upsertEmailCode>('ac/index', 'upsertEmailCode');

/** Reserves one attempt while fewer than `maxAttempts` are used and the code has not expired at `now`. */
export const reserveCodeAttempt = viaStore<typeof import('./ddb/index.ts').reserveCodeAttempt>('ac/index', 'reserveCodeAttempt');

/** A right code gives its attempt back. */
export const returnCodeAttempt = viaStore<typeof import('./ddb/index.ts').returnCodeAttempt>('ac/index', 'returnCodeAttempt');

export const deleteEmailCode = viaStore<typeof import('./ddb/index.ts').deleteEmailCode>('ac/index', 'deleteEmailCode');
