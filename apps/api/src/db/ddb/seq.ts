// Numeric ids for the seven former bigserial tables: a SEQ# counter item, so ids keep their type and order.
/**
 * M26 F0-06, data-model.md §2 ("Ids stay as they are"): activity, rec_events, subscription_events,
 * share_events, admin_audit, chat_messages, list_overrides keep numeric ids (chat's `?after=`/`?before=`
 * cursor is a message id and must stay numeric — SC hard case 5).
 *
 * Two ways to take ids:
 * - `nextSeq` — one atomic UpdateItem `ADD v :n` returning the new value (ReturnValues UPDATED_NEW). Ids are
 *   unique and increasing; a write that then fails leaves a gap (as a Postgres sequence does).
 * - `readSeq` + `seqTxUpdate` — when the id must be issued INSIDE a TransactWriteItems. A transaction cannot
 *   return values (TransactWriteItems has no ReturnValues — https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html),
 *   so the caller reads the counter, uses `seen + 1 … seen + n`, and the TX bumps it with the condition
 *   `v = :seen` (or not-exists for 0). A concurrent writer cancels the TX → retry (retry.ts `withVersionRetry`).
 *   No gaps.
 */
import { seq as seqKey } from './keys.ts';
import { get, update, type Store } from './store.ts';
import type { Tx } from './tx.ts';

/** Reserves `n` ids; returns the FIRST of them. */
export async function nextSeq(store: Store, name: string, n = 1): Promise<number> {
  if (!Number.isInteger(n) || n < 1) throw new Error(`seq: n must be a positive integer, got ${n}`);
  const out = await update(store, 'main', seqKey(name), {
    update: 'ADD #v :n SET #t = :t',
    names: { '#v': 'v', '#t': 't' },
    values: { ':n': n, ':t': 'seq' },
    returnValues: 'UPDATED_NEW',
  });
  const last = Number(out?.['v']);
  if (!Number.isSafeInteger(last)) throw new Error(`seq ${name}: counter is not a number`);
  return last - n + 1;
}

/** The last id issued (0 when none yet), read strongly. */
export async function readSeq(store: Store, name: string): Promise<number> {
  const item = await get(store, 'main', seqKey(name), { consistent: true });
  return item ? Number(item['v']) : 0;
}

/** Adds to `t` the counter bump from `seen` to `seen + n`, conditional on nobody else having moved it. */
export function seqTxUpdate(t: Tx, name: string, seen: number, n = 1): Tx {
  return t.update('main', seqKey(name), {
    update: 'SET #v = :next, #t = :t',
    condition: seen === 0 ? 'attribute_not_exists(#v) OR #v = :seen' : '#v = :seen',
    names: { '#v': 'v', '#t': 't' },
    values: { ':next': seen + n, ':seen': seen, ':t': 'seq' },
    label: `seq:${name}`,
  });
}
