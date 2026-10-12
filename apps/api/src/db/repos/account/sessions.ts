// Database queries for sign-in sessions (M26 F0-01: moved here from auth/, routes/ and pages/).
import type { Listener } from '../../../auth/session.ts';
import { viaStore } from '../../backend.ts';

/** Sign out one session by its token hash. */
export const deleteSessionByHash = viaStore<typeof import('./ddb/index.ts').deleteSessionByHash>('ac/index', 'deleteSessionByHash');

/** A new session row; `second_factor_at` is now() when the sign-in already proved the inbox. */
export const insertSession = viaStore<typeof import('./ddb/index.ts').insertSession>('ac/index', 'insertSession');

export const sessionExistsRows = viaStore<typeof import('./ddb/index.ts').sessionExistsRows>('ac/index', 'sessionExistsRows');

/** Re-keys a session row from one token hash to another (secret rotation). */
export const rehashSession = viaStore<typeof import('./ddb/index.ts').rehashSession>('ac/index', 'rehashSession');

/** Swaps the session `old` for `freshHash` when its last swap is `ROTATE_EVERY_HOURS` old; returns `fresh`, or undefined. */
export const rotateSessionRow = viaStore<typeof import('./ddb/index.ts').rotateSessionRow>('ac/index', 'rotateSessionRow');

/** The listener behind a live phone session; also bumps `last_seen_at` and records today's app use. */
export const listenerForTokenRows = viaStore<typeof import('./ddb/index.ts').listenerForTokenRows>('ac/index', 'listenerForTokenRows');

export type StudioSessionRow = Listener & { last_seen_at: Date | string };

/** The listener behind a live Studio session (label `STUDIO_LABEL`), with its `last_seen_at`. */
export const studioSessionRows = viaStore<typeof import('./ddb/index.ts').studioSessionRows>('ac/index', 'studioSessionRows');

export const touchSessionLastSeen = viaStore<typeof import('./ddb/index.ts').touchSessionLastSeen>('ac/index', 'touchSessionLastSeen');

export const sessionCreatedAtRows = viaStore<typeof import('./ddb/index.ts').sessionCreatedAtRows>('ac/index', 'sessionCreatedAtRows');

/** Ends every act-as session an admin owns. */
export const deleteActAsSessions = viaStore<typeof import('./ddb/index.ts').deleteActAsSessions>('ac/index', 'deleteActAsSessions');

export const insertActAsSession = viaStore<typeof import('./ddb/index.ts').insertActAsSession>('ac/index', 'insertActAsSession');

/** The account behind an act-as token owned by `adminId` (still an admin), with the session's creation time. */
export const actingTargetRows = viaStore<typeof import('./ddb/index.ts').actingTargetRows>('ac/index', 'actingTargetRows');
