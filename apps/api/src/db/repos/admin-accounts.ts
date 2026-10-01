/**
 * M15 T027 — accounts the admin makes (FR-019, FR-020; research R6).
 *
 * An account with no email gets `acct-<uuid>@accounts.invalid` (RFC 2606 reserves `.invalid`; it
 * can never receive mail). The password hash is of random bytes nobody knows, as code sign-in
 * does (routes/auth.ts), so a real email added later signs in with a code. `made_by` names the
 * admin. Bulk results come back in input order; a refused row never stops the others.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';

export type AccountInput = { displayName: string; bio?: string | undefined; email?: string | undefined };
export type AccountResult = { ok: true; id: string } | { ok: false; reason: string };
export type Account = { id: string; email: string; displayName: string; bio: string | null; createdAt: string; suspended: boolean; madeBy: string | null; placeholderEmail: boolean };

export const MAX_BULK = 50;
export const PLACEHOLDER_DOMAIN = '@accounts.invalid';

type Row = { id: string; email: string; display_name: string; bio: string | null; created_at: Date | string; suspended_at: Date | string | null; made_by: string | null };
const COLS = 'id, email, display_name, bio, created_at, suspended_at, made_by';
export const toAccount = (r: Row): Account => ({
  id: r.id, email: r.email, displayName: r.display_name, bio: r.bio, createdAt: new Date(r.created_at).toISOString(),
  suspended: r.suspended_at !== null, madeBy: r.made_by, placeholderEmail: r.email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN),
});

export async function accountsByIds(db: Db, ids: readonly string[]): Promise<Account[]> {
  if (ids.length === 0) return [];
  return (await db.query<Row>(`SELECT ${COLS} FROM listeners WHERE id = ANY($1::uuid[]) ORDER BY created_at`, [ids])).map(toAccount);
}

export async function madeAccounts(db: Db): Promise<Account[]> {
  return (await db.query<Row>(`SELECT ${COLS} FROM listeners WHERE made_by IS NOT NULL ORDER BY created_at DESC LIMIT 500`)).map(toAccount);
}

export async function createAccounts(tx: Db, adminId: string, rows: readonly AccountInput[], passwordHash: string): Promise<AccountResult[]> {
  const seen = new Set<string>();
  const out: AccountResult[] = [];
  for (const r of rows) {
    const email = r.email?.trim().toLowerCase() || `acct-${randomUUID()}${PLACEHOLDER_DOMAIN}`;
    if (seen.has(email)) { out.push({ ok: false, reason: 'This email is in the list twice.' }); continue; }
    seen.add(email);
    // ON CONFLICT keeps the transaction alive: a taken email is a refused row, not an aborted batch.
    const [made] = await tx.query<{ id: string }>(
      `INSERT INTO listeners (email, password_hash, display_name, bio, made_by) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, passwordHash, r.displayName.trim(), r.bio?.trim() || null, adminId],
    );
    out.push(made ? { ok: true, id: made.id } : { ok: false, reason: 'An account with this email already exists.' });
  }
  return out;
}

export async function emailTaken(db: Db, email: string, exceptId: string): Promise<boolean> {
  const [r] = await db.query('SELECT 1 FROM listeners WHERE email = $1 AND id <> $2', [email, exceptId]);
  return Boolean(r);
}

export async function updateAccount(tx: Db, id: string, p: { displayName?: string | undefined; bio?: string | null | undefined; email?: string | undefined }): Promise<Account | undefined> {
  const [r] = await tx.query<Row>(
    `UPDATE listeners SET display_name = coalesce($2, display_name),
            bio = CASE WHEN $3::boolean THEN $4 ELSE bio END,
            email = coalesce($5, email)
      WHERE id = $1 AND made_by IS NOT NULL RETURNING ${COLS}`,
    [id, p.displayName?.trim() ?? null, p.bio !== undefined, p.bio === undefined ? null : p.bio?.trim() || null, p.email?.trim().toLowerCase() ?? null],
  );
  return r ? toAccount(r) : undefined;
}
