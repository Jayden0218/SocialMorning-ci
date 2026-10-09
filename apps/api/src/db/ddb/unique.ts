// Uniqueness without a UNIQUE index: a U# item claimed with attribute_not_exists in the same transaction as the row.
/**
 * M26 F0-06, data-model.md §5. A GSI cannot enforce uniqueness (research R2), so each of the 22 non-key unique
 * constraints is a `U#<kind>#<value>` item holding the owner's reference. Claim it in the SAME TransactWriteItems
 * as the row it guards (`attribute_not_exists(PK)`); release or move it in the same TX as a delete or change.
 * The item label is `unique:<kind>` so `TxCancelled.failed('unique:EMAIL')` says which value was taken.
 * Read it with a strong GetItem (`uniqueOwner`) — e.g. listener by email, episode by (feed, guid).
 */
import { encode } from './codec.ts';
import { get, type Key, type Store } from './store.ts';
import type { Tx } from './tx.ts';

const kindOf = (key: Key): string => key.PK.split('#')[1] ?? '?';

/** Adds the claim of `key` (a `U.*` key from keys.ts) for `owner` (the row's id, or `PK|SK` of the row). */
export function claimUnique(t: Tx, key: Key, owner: string, opts: { ttl?: number } = {}): Tx {
  return t.put('main', encode('unique', key, { owner }, opts.ttl !== undefined ? { ttl: opts.ttl } : {}), {
    condition: 'attribute_not_exists(PK)',
    label: `unique:${kindOf(key)}`,
  });
}

/** Adds the release of `key`; with `owner`, only if it is still ours (a stale release never frees someone else's). */
export function releaseUnique(t: Tx, key: Key, owner?: string): Tx {
  if (!owner) return t.delete('main', key, { label: `unique:${kindOf(key)}` });
  return t.delete('main', key, { condition: '#o = :o', names: { '#o': 'owner' }, values: { ':o': owner }, label: `unique:${kindOf(key)}` });
}

/** Moves a unique value (e.g. an email change): release the old, claim the new — one TX, two items. */
export function moveUnique(t: Tx, from: Key, to: Key, owner: string): Tx {
  releaseUnique(t, from, owner);
  return claimUnique(t, to, owner);
}

/** Who holds this value now, or undefined. Strongly consistent. */
export async function uniqueOwner<T = string>(store: Store, key: Key): Promise<T | undefined> {
  const item = await get(store, 'main', key, { consistent: true });
  return item ? (item['owner'] as T) : undefined;
}
