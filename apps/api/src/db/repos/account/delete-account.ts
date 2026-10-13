// Deletes an account and its data in one step, keeping reply threads intact.
import { viaStore } from '../../backend.ts';

/**
 * FR-005a (clarified 2026-09-21: everything goes). One transaction:
 *   1. every comment by the listener: placeholder if it has replies, else delete
 *      (guard G6: "delete unconditionally" breaks the replies' context) — two set-based
 *      statements since M23;
 *   2. delete the listener — sessions, reactions, positions cascade;
 *   3. rebuild heat for every episode touched.
 * The email is free again afterwards because the row is gone, not flagged.
 */
export const deleteAccount = viaStore<typeof import('./ddb/index.ts').deleteAccount>('ac/index', 'deleteAccount');
