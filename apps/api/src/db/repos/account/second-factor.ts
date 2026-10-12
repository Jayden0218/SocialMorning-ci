// Database queries for the admin second factor kept on the session row (M26 F0-01: moved here from auth/second-factor.ts).
import { viaStore } from '../../backend.ts';

export type SecondFactorAtRow = { second_factor_at: Date | string | null };

export const secondFactorAtRows = viaStore<typeof import('./ddb/index.ts').secondFactorAtRows>('ac/index', 'secondFactorAtRows');

/** Marks the session as past the second factor. */
export const markSecondFactorDone = viaStore<typeof import('./ddb/index.ts').markSecondFactorDone>('ac/index', 'markSecondFactorDone');

export const secondFactorSentAtRows = viaStore<typeof import('./ddb/index.ts').secondFactorSentAtRows>('ac/index', 'secondFactorSentAtRows');

/** Stores a new hashed code on the session and resets its tries. */
export const storeSecondFactorCode = viaStore<typeof import('./ddb/index.ts').storeSecondFactorCode>('ac/index', 'storeSecondFactorCode');

/** Reserves one try while fewer than `maxTries` are used and the code is newer than `sentAfter`. */
export const reserveSecondFactorTry = viaStore<typeof import('./ddb/index.ts').reserveSecondFactorTry>('ac/index', 'reserveSecondFactorTry');

/** A right code: marks the session and clears the code. */
export const passSecondFactor = viaStore<typeof import('./ddb/index.ts').passSecondFactor>('ac/index', 'passSecondFactor');

/** Uses the code up. */
export const clearSecondFactorCode = viaStore<typeof import('./ddb/index.ts').clearSecondFactorCode>('ac/index', 'clearSecondFactorCode');
