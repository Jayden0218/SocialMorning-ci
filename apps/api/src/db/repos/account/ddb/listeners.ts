// Listener accounts on DynamoDB: the listener item plus its U#EMAIL uniqueness item, lockout counters, country, profile reads.
/**
 * M26 lane AC (AC-T01; patterns AC-01…AC-11, AC-136…AC-138). Keys: `L#<id>/PROFILE` (G6 = name, G4 =
 * `Q#listeners`) and `U#EMAIL#<lower email>` → id (data-model.md §5). The email is unique because the
 * U# item is claimed with `attribute_not_exists(PK)` in the SAME transaction as the listener item —
 * guard G-M26-AC1: two sign-ups racing for one email make one account.
 */
import { randomUUID } from 'node:crypto';
import { lockoutUntil } from '@socialmorning/social-core';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { update } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { claimUnique, uniqueOwner } from '../../../ddb/unique.ts';
import { withRetry } from '../../../ddb/retry.ts';
import type { Listener } from '../../../../auth/session.ts';
import type { ListenerAuthRow } from '../listeners.ts';
import { countryOf, recordCountry as recordCountryDual } from '../country.ts';
import { getListener, iso, nowMs, plainPg, unlessCondition, upd, txa, type Hybrid, bridgeOn } from './common.ts';
import { shadowInsertListener } from './foreign.ts';

export async function createListener(h: Hybrid, email: string, passwordHash: string, displayName: string): Promise<Listener | 'exists'> {
  const id = randomUUID();
  const createdAt = iso(nowMs(h));
  const t = txa(h.store).put('main', encode('listener', K.listener(id), {
    id, email, passwordHash, displayName, createdAt, failedAttempts: 0, listenedMs: 0, followerCount: 0, followingCount: 0,
  }, { gsi: { ...K.G6(displayName, id), ...K.G4('listeners', createdAt, id) } }), { condition: 'attribute_not_exists(PK)', label: 'listener' });
  // RED G-M26-AC1: claimUnique(t.raw, K.U.email(email), id);
  try {
    // Two sign-ups at once may get TransactionConflict instead of the condition: try again, and the
    // second try sees the other's U#EMAIL item (ConditionalCheckFailed → 'exists').
    await withRetry(() => t.commit(), { tries: 6 });
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('unique:EMAIL')) return 'exists';
    throw e;
  }
  if (bridgeOn(h)) await shadowInsertListener(h.pg, { id, email, passwordHash, displayName, createdAt });
  return { id, email, display_name: displayName, created_at: createdAt };
}

/** By email: a strong GetItem of the U#EMAIL item, then of the listener. */
export async function listenerByEmail(h: Hybrid, email: string): Promise<ListenerAuthRow | undefined> {
  const id = await uniqueOwner(h.store, K.U.email(email));
  if (!id) return undefined;
  const l = await getListener(h, id);
  if (!l) return undefined;
  return {
    id: l.id, email: l.email, display_name: l.displayName, created_at: l.createdAt, password_hash: l.passwordHash,
    failed_attempts: Number(l.failedAttempts ?? 0), locked_until: l.lockedUntil ?? null, suspended_at: l.suspendedAt ?? null,
  };
}

/** M23 US2: the count is the item's (ADD returns the new value), so parallel failures each count; a lock only grows. */
export async function recordFailedSignIn(h: Hybrid, id: string, now: number): Promise<number> {
  const out = await unlessCondition(upd(h.store, 'main', K.listener(id), {
    update: 'ADD failedAttempts :one', condition: 'attribute_exists(PK)', values: { ':one': 1 }, returnValues: 'UPDATED_NEW',
  }));
  const count = Number(out?.['failedAttempts'] ?? 0);
  const until = lockoutUntil(count, now);
  if (until !== null) {
    const u = iso(until);
    // GREATEST(COALESCE(locked_until, new), new): only when there is no lock or a shorter one.
    await unlessCondition(upd(h.store, 'main', K.listener(id), {
      update: 'SET lockedUntil = :u',
      condition: 'attribute_exists(PK) AND (attribute_not_exists(lockedUntil) OR lockedUntil < :u)',
      values: { ':u': u },
    }));
  }
  return count;
}

export async function clearFailedSignIns(h: Hybrid, id: string): Promise<void> {
  await unlessCondition(upd(h.store, 'main', K.listener(id), {
    update: 'SET failedAttempts = :z REMOVE lockedUntil', condition: 'attribute_exists(PK)', values: { ':z': 0 },
  }));
}

export async function recordCountry(h: Hybrid, listenerId: string, header: string | undefined | null): Promise<void> {
  const c = countryOf(header);
  if (c === undefined) return;
  await unlessCondition(upd(h.store, 'main', K.listener(listenerId), { update: 'SET country = :c', condition: 'attribute_exists(PK)', values: { ':c': c } }));
  if (bridgeOn(h)) await recordCountryDual(plainPg(h), listenerId, header); // shadow
}
