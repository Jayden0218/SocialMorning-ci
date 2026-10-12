// "Can't find it? Tell us" on DynamoDB: the words in one partition, and a once-a-day mark per asker.
/**
 * M26 lane DV (DV-91, DV-92).
 * - `SEARCHREQ / <createdAt>#<id>` (type `searchRequest`): the words and the time — no listener id (nobody reads it;
 *   TTL 91 days, the read keeps 90).
 * - The SQL's "once per listener (or signed-out caller) per lowercased words per day" is a mark item: the listener's
 *   own `L#<id>/SRQ#<sha(lower q)>` (gone with the account), or `SRQ#anon/<sha>` for everyone signed out (they all
 *   shared one NULL listener id in SQL too). A request is stored with its mark in one transaction, conditioned on the
 *   mark being absent or a day old.
 * - The admin list groups by lowercased words in code: min(words), count, newest — newest first.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import type { Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { DAY_MS, iso, nowMs, partitionItems } from './common.ts';

export const KEEP_DAYS = 90;

export async function insertSearchRequest(store: Store, _db: Db, listenerId: string | null, q: string): Promise<void> {
  const now = nowMs(store);
  const at = iso(now);
  const id = randomUUID();
  try {
    await tx(store)
      .put('main', encode('searchDedupe', K.searchDedupe(listenerId, q), { at }, { ttl: ttlAfter(now, 2 * DAY_MS) }), {
        condition: 'attribute_not_exists(PK) OR #a <= :cut', names: { '#a': 'at' }, values: { ':cut': iso(now - DAY_MS) }, label: 'once-a-day',
      })
      .put('main', encode('searchRequest', K.searchRequest(at, id), { id, q, createdAt: at }, { ttl: ttlAfter(now, (KEEP_DAYS + 1) * DAY_MS) }))
      .commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('once-a-day')) return; // asked already today: stored once
    throw e;
  }
}

export async function searchRequestRows(store: Store, _db: Db, limit: number): Promise<{ q: string; n: number; last: Date | string }[]> {
  const since = iso(nowMs(store) - KEEP_DAYS * DAY_MS);
  const rows = await partitionItems(store, 'SEARCHREQ', { from: `${since}`, to: '~' });
  const groups = new Map<string, { q: string; n: number; last: string }>();
  for (const r of rows) {
    const q = String(r['q']);
    const at = String(r['createdAt']);
    if (at <= since) continue;
    const g = groups.get(q.toLowerCase());
    if (!g) groups.set(q.toLowerCase(), { q, n: 1, last: at });
    else { g.n++; if (q < g.q) g.q = q; if (at > g.last) g.last = at; }
  }
  return [...groups.values()].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)).slice(0, limit);
}
