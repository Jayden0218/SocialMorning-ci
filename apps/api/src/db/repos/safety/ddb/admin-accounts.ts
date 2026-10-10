// Admin-made accounts on DynamoDB: read from lane AC's listener items, made and edited through AC's repo (admin-ops.ts).
/**
 * M26 lane SF (SF-50…SF-54). A made account is an ordinary listener item with `madeBy`; the list is the G4
 * `Q#listeners` queue filtered in code (owner page, ≤ a few hundred accounts). Creating one claims its
 * `U#EMAIL` item in the same transaction (lane AC's `createMadeListener`), so a taken email is a refused row and
 * the rest of the batch goes on, as the SQL's ON CONFLICT did.
 */
import { randomUUID } from 'node:crypto';
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import { uniqueOwner } from '../../../ddb/unique.ts';
import { createMadeListener, setMadeEmail } from '../../account/ddb/admin-ops.ts';
import { updateProfile } from '../../account/profile.ts';
import { PLACEHOLDER_DOMAIN, toAccount, type Account, type AccountInput, type AccountResult } from '../../admin/admin-accounts.ts';
import { getMany, queue, type Db, type Item, type Store } from './common.ts';

const row = (l: Item) => ({
  id: String(l['id']), email: String(l['email']), display_name: String(l['displayName']), bio: (l['bio'] as string | null | undefined) ?? null,
  created_at: String(l['createdAt']), suspended_at: (l['suspendedAt'] as string | null | undefined) ?? null, made_by: (l['madeBy'] as string | null | undefined) ?? null,
});

export async function accountsByIds(store: Store, _db: Db, ids: readonly string[]): Promise<Account[]> {
  if (ids.length === 0) return [];
  const items = await getMany(store, 'main', [...new Set(ids)].map((id) => K.listener(id)));
  return items.map(row).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)).map(toAccount);
}

export async function madeAccounts(store: Store, _db: Db): Promise<Account[]> {
  const ids = (await queue(store, 'listeners')).filter((l) => l['madeBy']).map((l) => String(l['id']));
  // Read back from the table: the queue's copy may lag a just-made account's name.
  const items = await getMany(store, 'main', ids.map((id) => K.listener(id)));
  return items.filter((l) => l['madeBy']).map(row).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, 500).map(toAccount);
}

export async function createAccounts(store: Store, db: Db, adminId: string, rows: readonly AccountInput[], passwordHash: string): Promise<AccountResult[]> {
  const seen = new Set<string>();
  const out: AccountResult[] = [];
  for (const r of rows) {
    const email = r.email?.trim().toLowerCase() || `acct-${randomUUID()}${PLACEHOLDER_DOMAIN}`;
    if (seen.has(email)) { out.push({ ok: false, reason: 'This email is in the list twice.' }); continue; }
    seen.add(email);
    const made = await createMadeListener(store, db, { email, passwordHash, displayName: r.displayName.trim(), bio: r.bio?.trim() || null, madeBy: adminId });
    out.push(made === 'exists' ? { ok: false, reason: 'An account with this email already exists.' } : { ok: true, id: made.id });
  }
  return out;
}

export async function emailTaken(store: Store, _db: Db, email: string, exceptId: string): Promise<boolean> {
  const owner = await uniqueOwner(store, K.U.email(email));
  return owner !== undefined && owner !== exceptId;
}

export async function updateAccount(store: Store, db: Db, id: string, p: { displayName?: string | undefined; bio?: string | null | undefined; email?: string | undefined }): Promise<Account | undefined> {
  const l = await get(store, 'main', K.listener(id));
  if (!l || !l['madeBy']) return undefined;
  const patch: { displayName?: string; bio?: string } = {};
  if (p.displayName !== undefined) patch.displayName = p.displayName.trim();
  if (p.bio !== undefined) patch.bio = p.bio?.trim() || '';
  if (Object.keys(patch).length) await updateProfile(db, id, patch);
  if (p.email !== undefined) await setMadeEmail(store, db, id, p.email.trim().toLowerCase());
  const now = await get(store, 'main', K.listener(id));
  return now ? toAccount(row(now)) : undefined;
}
