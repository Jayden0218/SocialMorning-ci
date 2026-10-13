// Database queries to create and find listener accounts.
import type { Listener } from '../../../auth/session.ts';
import { viaStore } from '../../backend.ts';

export type ListenerAuthRow = Listener & { password_hash: string; failed_attempts: number; suspended_at?: Date | string | null; locked_until: Date | string | null };

export const createListener = viaStore<typeof import('./ddb/index.ts').createListener>('ac/index', 'createListener');

export const listenerByEmail = viaStore<typeof import('./ddb/index.ts').listenerByEmail>('ac/index', 'listenerByEmail');

/**
 * M23 US2 (FR-002): the count comes from the database, not from the row read before the slow
 * password check — wrong passwords arriving in parallel are each counted, and a later, shorter
 * lock never replaces a longer one. Returns the new count.
 */
export const recordFailedSignIn = viaStore<typeof import('./ddb/index.ts').recordFailedSignIn>('ac/index', 'recordFailedSignIn');

export const clearFailedSignIns = viaStore<typeof import('./ddb/index.ts').clearFailedSignIns>('ac/index', 'clearFailedSignIns');
