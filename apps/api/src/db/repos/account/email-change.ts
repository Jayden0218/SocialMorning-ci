// Database queries for changing the sign-in email (M26: moved here from routes/account/email.ts).
import type { Db } from '../../db.ts';

/** The pending change's send time, if one is pending. */
export async function pendingEmailChangeRows(db: Db, listenerId: string): Promise<{ sent_at: Date | string }[]> {
  return db.query<{ sent_at: Date | string }>('SELECT sent_at FROM email_changes WHERE listener_id = $1', [listenerId]);
}

/** Store (or replace) the pending change with fresh codes and zero tries. */
export async function saveEmailChange(db: Db, listenerId: string, to: string, codeHash: Buffer, oldCodeHash: Buffer, sentAt: Date, expiresAt: Date): Promise<void> {
  await db.query(
    `INSERT INTO email_changes (listener_id, new_email, code_hash, old_code_hash, sent_at, expires_at, tries) VALUES ($1, $2, $3, $4, $5, $6, 0)
     ON CONFLICT (listener_id) DO UPDATE SET new_email = EXCLUDED.new_email, code_hash = EXCLUDED.code_hash, old_code_hash = EXCLUDED.old_code_hash, sent_at = EXCLUDED.sent_at, expires_at = EXCLUDED.expires_at, tries = 0`,
    [listenerId, to, codeHash, oldCodeHash, sentAt, expiresAt]);
}

export type EmailChangeTry = { new_email: string; code_hash: Buffer | Uint8Array; old_code_hash: Buffer | Uint8Array | null; tries: number };

/** Reserve one try on a live pending change; no row when it expired or is out of tries. */
export async function takeEmailChangeTry(db: Db, listenerId: string, maxAttempts: number, now: Date): Promise<EmailChangeTry[]> {
  return db.query<EmailChangeTry>(
    `UPDATE email_changes SET tries = tries + 1 WHERE listener_id = $1 AND tries < $2 AND expires_at > $3
     RETURNING new_email, code_hash, old_code_hash, tries`, [listenerId, maxAttempts, now]);
}

/** Drop the pending change. */
export async function deleteEmailChange(db: Db, listenerId: string): Promise<void> {
  await db.query('DELETE FROM email_changes WHERE listener_id = $1', [listenerId]);
}

/**
 * Switch the email in one transaction: false when another account took it meanwhile; otherwise
 * the pending change and both addresses' sign-in codes go, and every other session is signed out.
 */
export async function switchEmail(db: Db, listenerId: string, old: string, to: string, keep: Buffer): Promise<false | { signedOut: number }> {
  return db.transaction<false | { signedOut: number }>(async (tx) => {
    const [taken] = await tx.query('SELECT 1 FROM listeners WHERE email = $1 AND id <> $2', [to, listenerId]);
    if (taken) return false;
    await tx.query('UPDATE listeners SET email = $2 WHERE id = $1', [listenerId, to]);
    await tx.query('DELETE FROM email_changes WHERE listener_id = $1', [listenerId]);
    // Sign-in codes already sent to either address are void now.
    await tx.query('DELETE FROM email_codes WHERE email = $1 OR email = $2', [old, to]);
    // Fix F-S (guard G-M24-FS-2): every other session of this account is signed out; this one stays.
    const gone = await tx.query('DELETE FROM sessions WHERE listener_id = $1 AND token_hash <> $2 RETURNING 1', [listenerId, keep]);
    return { signedOut: gone.length };
  });
}
