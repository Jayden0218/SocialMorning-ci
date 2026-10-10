// Listener writes that lane SF's admin and moderation code makes: suspension, admin-made accounts and their email.
/**
 * M26 lane SF, an additive file in lane AC's folder (wave-2 rule: "a write to a listener field goes through
 * AC's repo, so it reaches the DynamoDB listener item"). The listener item stays AC's: these functions keep its
 * session copies (`refreshSessionCopies` — `suspendedAt` is copied onto every live session, so the one-GetItem
 * auth check sees a suspension at once) and its Postgres shadow (while the bridge is on) exactly as AC's own
 * writes do.
 * - `suspensionUpdate` adds the listener's change to the CALLER's transaction (moderation `act()` puts the
 *   action, the effect and the notice in one TX — guard G-M26-SF2); `afterSuspension` runs after it commits.
 * - `createMadeListener` / `setMadeEmail`: accounts the admin makes (M15 FR-019/020) — the `U#EMAIL` item is
 *   claimed or moved in the same TX as the listener item, like AC's sign-up (guard G-M26-AC1).
 */
import { randomUUID } from 'node:crypto';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { TxCancelled, type Tx } from '../../../ddb/tx.ts';
import { claimUnique } from '../../../ddb/unique.ts';
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';
import { bridgeOn, getListener, iso, nowMs, refreshSessionCopies, txa, xo, type Hybrid, type ListenerItem } from './common.ts';
import { shadowInsertListener, shadowListener } from './foreign.ts';

const hy = (store: Store, db: Db): Hybrid => ({ store, pg: db });

/** Adds "suspended now" (at) or "not suspended" (null) for `listenerId` to `t`. Returns false when there is nothing to change. */
export async function suspensionUpdate(store: Store, db: Db, t: Tx, listenerId: string, at: string | null): Promise<boolean> {
  const l = await getListener(hy(store, db), listenerId);
  if (!l) return false;
  if (at !== null) {
    if (l.suspendedAt) return false; // the SQL: `WHERE suspended_at IS NULL`
    t.update('main', K.listener(listenerId), xo({ update: 'SET suspendedAt = :at', condition: 'attribute_exists(PK) AND (attribute_not_exists(suspendedAt) OR attribute_type(suspendedAt, :nul))', values: { ':at': at, ':nul': 'NULL' }, label: 'suspension' }));
    return true;
  }
  t.update('main', K.listener(listenerId), xo({ update: 'SET suspendedAt = :null', condition: 'attribute_exists(PK)', values: { ':null': null }, label: 'suspension' }));
  return true;
}

/** After the transaction: the session copies, and the Postgres shadow while other lanes still read `listeners.suspended_at`. */
export async function afterSuspension(store: Store, db: Db, listenerId: string, at: string | null, pg: Db | undefined): Promise<void> {
  await refreshSessionCopies(hy(store, db), listenerId);
  if (pg && bridgeOn(hy(store, db))) {
    await pg.query(at === null ? 'UPDATE listeners SET suspended_at = NULL WHERE id = $1' : 'UPDATE listeners SET suspended_at = $2 WHERE id = $1 AND suspended_at IS NULL', at === null ? [listenerId] : [listenerId, at]);
  }
}

export type MadeAccount = { email: string; passwordHash: string; displayName: string; bio: string | null; madeBy: string };

/** One admin-made account: the listener item (with `madeBy`) + its `U#EMAIL` item, or 'exists'. */
export async function createMadeListener(store: Store, db: Db, a: MadeAccount): Promise<{ id: string } | 'exists'> {
  const id = randomUUID();
  const createdAt = iso(nowMs(store));
  const t = txa(store).put('main', encode('listener', K.listener(id), {
    id, email: a.email, passwordHash: a.passwordHash, displayName: a.displayName, createdAt, failedAttempts: 0, listenedMs: 0, followerCount: 0, followingCount: 0,
    madeBy: a.madeBy, ...(a.bio ? { bio: a.bio } : {}),
  }, { gsi: { ...K.G6(a.displayName, id), ...K.G4('listeners', createdAt, id) } }), { condition: 'attribute_not_exists(PK)', label: 'listener' });
  claimUnique(t.raw, K.U.email(a.email), id);
  try {
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('unique:EMAIL')) return 'exists';
    throw e;
  }
  if (bridgeOn(hy(store, db))) {
    await shadowInsertListener(db, { id, email: a.email, passwordHash: a.passwordHash, displayName: a.displayName, createdAt });
    await db.query('UPDATE listeners SET bio = $2, made_by = $3 WHERE id = $1', [id, a.bio, a.madeBy]);
  }
  return { id };
}

/** A made account's email changes: the listener item and the `U#EMAIL` items move together; false when the new one is taken. */
export async function setMadeEmail(store: Store, db: Db, listenerId: string, to: string): Promise<boolean> {
  const l: ListenerItem | undefined = await getListener(hy(store, db), listenerId);
  if (!l) return false;
  if (l.email === to) return true;
  const t = txa(store)
    .update('main', K.listener(listenerId), { update: 'SET email = :to', condition: 'attribute_exists(PK) AND email = :old', values: { ':to': to, ':old': l.email } })
    .delete('main', K.U.email(l.email), { condition: 'attribute_not_exists(PK) OR owner = :me', values: { ':me': listenerId } });
  claimUnique(t.raw, K.U.email(to), listenerId);
  try {
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('unique:EMAIL')) return false;
    throw e;
  }
  if (bridgeOn(hy(store, db))) await shadowListener(db, listenerId, 'email', to);
  await refreshSessionCopies(hy(store, db), listenerId);
  return true;
}
