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
import type { Db } from '../../db.ts';
import type { VoiceStorage } from '../../../storage/voice-blob.ts';
import type { ImageStorage } from '../../../storage/image-store.ts';
import { deleteAccount } from './delete-account.ts';
import { removeAllFor } from '../social/voice-posts.ts';
import { removeImagesFor } from '../social/comment-images.ts';
import { currentAvatar } from './profile.ts';
import { dual } from '../../backend.ts';

export const DELETION_WAIT_DAYS = 15;
/** Due deletions done per internal call (each is one transaction plus blob deletes). */
export const DELETIONS_PER_CALL = 20;

export type DeletionStores = { voice?: VoiceStorage; images?: ImageStorage; avatars?: VoiceStorage };

/** Starts (or restarts) the wait: hidden now, signed out everywhere, deleted in 15 days. */
export const requestDeletion = dual('ac/index', 'requestDeletion', async (db: Db, listenerId: string): Promise<{ dueAt: string }> => {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ due_at: Date | string }>(
      `INSERT INTO account_deletions (listener_id, requested_at, due_at, cancelled_at)
       VALUES ($1, now(), now() + interval '${DELETION_WAIT_DAYS} days', NULL)
       ON CONFLICT (listener_id) DO UPDATE SET requested_at = now(), due_at = EXCLUDED.due_at, cancelled_at = NULL
       RETURNING due_at`, [listenerId]);
    await tx.query('UPDATE listeners SET hidden_at = now() WHERE id = $1', [listenerId]);
    await tx.query('DELETE FROM sessions WHERE listener_id = $1', [listenerId]);
    return { dueAt: new Date(row!.due_at).toISOString() };
  });
});

/** The open request, if any — what sign-in returns as `pendingDeletion`. */
export const pendingDeletion = dual('ac/index', 'pendingDeletion', async (db: Db, listenerId: string): Promise<{ dueAt: string } | null> => {
  const [r] = await db.query<{ due_at: Date | string }>('SELECT due_at FROM account_deletions WHERE listener_id = $1 AND cancelled_at IS NULL', [listenerId]);
  return r ? { dueAt: new Date(r.due_at).toISOString() } : null;
});

/** Keep: the request is cancelled and the account is visible again, with everything it had. */
export const cancelDeletion = dual('ac/index', 'cancelDeletion', async (db: Db, listenerId: string): Promise<boolean> => {
  return db.transaction(async (tx) => {
    const r = await tx.query('UPDATE account_deletions SET cancelled_at = now() WHERE listener_id = $1 AND cancelled_at IS NULL RETURNING 1', [listenerId]);
    await tx.query('UPDATE listeners SET hidden_at = NULL WHERE id = $1', [listenerId]);
    return r.length > 0;
  });
});

/** The pre-M22 immediate deletion, unchanged: blobs first, then every row (FR-035). */
export const finishDeletion = dual('ac/index', 'finishDeletion', async (db: Db, stores: DeletionStores, listenerId: string): Promise<void> => {
  // M12 FR-104: the listener's voice recordings leave the store before the rows cascade away.
  if (stores.voice) { try { await removeAllFor(db, stores.voice, listenerId, stores.images); } catch (e) { console.error('voice cleanup on delete', e); } }
  // M20 US9 (FR-055): the listener's comment images leave the store before the account goes.
  if (stores.images) { try { await removeImagesFor(db, stores.images, listenerId); } catch (e) { console.error('image cleanup on delete', e); } }
  // M19 US1: the photo is deleted with the account (constitution v2.6.0).
  if (stores.avatars) { try { const a = await currentAvatar(db, listenerId); if (a) await stores.avatars.remove(a); } catch (e) { console.error('avatar cleanup on delete', e); } }
  await deleteAccount(db, listenerId);
});

/** The internal step: every due, uncancelled request is carried out (oldest first, bounded). */
export const runDueDeletions = dual('ac/index', 'runDueDeletions', async (db: Db, stores: DeletionStores, limit = DELETIONS_PER_CALL): Promise<{ deleted: number; failed: number }> => {
  const due = await db.query<{ listener_id: string }>(
    `SELECT listener_id FROM account_deletions WHERE cancelled_at IS NULL AND due_at <= now() ORDER BY due_at LIMIT ${Math.max(1, Math.floor(limit))}`);
  let deleted = 0;
  let failed = 0;
  for (const d of due) {
    try { await finishDeletion(db, stores, d.listener_id); deleted++; }
    catch (e) { failed++; console.error('due deletion failed; retried next cycle', e instanceof Error ? e.message : String(e)); }
  }
  return { deleted, failed };
});
