// Account deletion waits 15 days: request it, keep the account, and delete the due ones for good.
/**
 * M22 US11 (FR-033–FR-035; research R10; data-model "State: account deletion"; guard G-M22-8).
 *
 *   active ──DELETE /v1/me──► pending (hidden, signed out) ──15 days──► deleted (the old body)
 *                                 └──sign in + Keep──► active
 *
 * A request writes `account_deletions (due_at = now + 15 days)`, sets `listeners.hidden_at` (every
 * public read filters it beside `suspended_at`) and ends every session. Signing in again is
 * allowed; the sign-in answer carries `pendingDeletion: { dueAt }` and Keep cancels. The hourly
 * internal step `deletions` runs `finishDeletion` — exactly what the immediate deletion did before
 * M22 — for every due, uncancelled row.
 */
import type { VoiceStorage } from '../../../storage/voice-blob.ts';
import type { ImageStorage } from '../../../storage/image-store.ts';
import { viaStore } from '../../backend.ts';

export const DELETION_WAIT_DAYS = 15;
/** Due deletions done per internal call (each is one transaction plus blob deletes). */
export const DELETIONS_PER_CALL = 20;

export type DeletionStores = { voice?: VoiceStorage; images?: ImageStorage; avatars?: VoiceStorage };

/** Starts (or restarts) the wait: hidden now, signed out everywhere, deleted in 15 days. */
export const requestDeletion = viaStore<typeof import('./ddb/index.ts').requestDeletion>('ac/index', 'requestDeletion');

/** The open request, if any — what sign-in returns as `pendingDeletion`. */
export const pendingDeletion = viaStore<typeof import('./ddb/index.ts').pendingDeletion>('ac/index', 'pendingDeletion');

/** Keep: the request is cancelled and the account is visible again, with everything it had. */
export const cancelDeletion = viaStore<typeof import('./ddb/index.ts').cancelDeletion>('ac/index', 'cancelDeletion');

/** The pre-M22 immediate deletion, unchanged: blobs first, then every row (FR-035). */
export const finishDeletion = viaStore<typeof import('./ddb/index.ts').finishDeletion>('ac/index', 'finishDeletion');

/** The internal step: every due, uncancelled request is carried out (oldest first, bounded). */
export const runDueDeletions = viaStore<typeof import('./ddb/index.ts').runDueDeletions>('ac/index', 'runDueDeletions');
