// The per-episode listen index on DynamoDB: one sm-events item per listened activity row, by episode and by day.
/**
 * M26 lane DV (data-model.md "Lane DV changes"). The Discover numbers need "who listened to THIS episode" (all-time
 * public listeners on pick cards — DV-02; "people who listened to this also listened" — DV-60) and "what was listened
 * to in the last N days" (talked about 7 d, rising 14 d, the treasure hunt's plays 30 d — DV-01/21/22). Lane SG's
 * activity items are keyed by ACTOR (`ACT#<actor>`), so neither question has a key there.
 *
 * - `LSN#<episodeId> / <actorId>#<day>` (sm-events): one item per `listened` activity row (the row's own
 *   once-per-day rule makes it one per actor, episode and day), written by lane SG's `writeAct` IN THE SAME
 *   TRANSACTION as the activity item (`listenMarkItem`), so the index can never miss or double a row.
 *   `hidden` is the row's `hidden` (the private-listening switch at write time — guard G2 counts only `false`).
 * - E1 `DAY#<UTC day of createdAt>` / `lsn#<createdAt>#<0|1>`: the day index (KEYS_ONLY — the key carries the time
 *   and the hidden flag), so a window of N days is N Queries, never a Scan.
 * - Account deletion: the job's `discover` phase deletes the listener's items, found through their own `ACT#`
 *   partition (it runs before lane SG's `graph` phase deletes that partition).
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item, Store } from '../../../ddb/store.ts';

export const DAY_MS = 86_400_000;

export type ListenMark = { episodeId: string; actorId: string; day: string; at: string; hidden: boolean };

/** The index item for one `listened` activity row (lane SG puts it in the activity's own transaction). */
export function listenMarkItem(a: { actorId: string; episodeId: string; day: string; hidden: boolean; createdAt: string }): Item {
  const at = K.ts(a.createdAt);
  return encode('listenMark', K.listenMark(a.episodeId, a.actorId, a.day), { episodeId: a.episodeId, actorId: a.actorId, day: a.day, at, hidden: a.hidden }, {
    gsi: K.E1(at.slice(0, 10), 'lsn', `${at}#${a.hidden ? 1 : 0}`),
  });
}

/** Every listen row of one episode (all time), strongly read. */
export async function listensOf(store: Store, episodeId: string): Promise<ListenMark[]> {
  const { items } = await queryAll(store, 'events', {
    KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `LSN#${episodeId}` }, ConsistentRead: true,
  });
  return items.map((i) => ({ episodeId, actorId: String(i['actorId']), day: String(i['day']), at: String(i['at']), hidden: i['hidden'] === true }));
}

const fromIndexKey = (i: Item): ListenMark => {
  const [, at, h] = String(i['E1SK']).split('#') as [string, string, string];
  const sk = String(i['SK']);
  const cut = sk.lastIndexOf('#');
  return { episodeId: String(i['PK']).slice('LSN#'.length), actorId: sk.slice(0, cut), day: sk.slice(cut + 1), at, hidden: h === '1' };
};

/** Every listen row written after `sinceMs` (up to `nowMs`): one E1 Query per UTC day of the window. */
export async function listensSince(store: Store, sinceMs: number, nowMs: number): Promise<ListenMark[]> {
  const since = new Date(sinceMs).toISOString();
  const out: ListenMark[] = [];
  for (let d = Date.parse(`${since.slice(0, 10)}T00:00:00.000Z`); d <= nowMs; d += DAY_MS) {
    const day = new Date(d).toISOString().slice(0, 10);
    const { items } = await queryAll(store, 'events', {
      IndexName: K.INDEX.E1, KeyConditionExpression: 'E1PK = :d AND E1SK > :from',
      ExpressionAttributeValues: { ':d': `DAY#${day}`, ':from': `lsn#${since}` },
    }, { keep: (i) => String(i['E1SK']).startsWith('lsn#') });
    for (const i of items) {
      const m = fromIndexKey(i);
      if (m.at > since) out.push(m);
    }
  }
  return out;
}

/**
 * The account deletion's `discover` phase, one chunk: the listener's `listened` activity items (lane SG's partition,
 * read before lane SG's phase deletes it) name their index items. Returns the cursor to continue from (`done` false),
 * or `done` true.
 */
export async function deleteListensStep(store: Store, listenerId: string, after: string | undefined, chunk = 25): Promise<{ done: boolean; next?: string }> {
  const { items, lastKey } = await queryAll(store, 'events', {
    KeyConditionExpression: after ? 'PK = :pk AND SK > :after' : 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `ACT#${listenerId}`, ...(after ? { ':after': after } : {}) },
    ConsistentRead: true,
  }, { max: chunk });
  const marks = items.filter((i) => i['kind'] === 'listened' && typeof i['day'] === 'string');
  await batchWriteAll(store, 'events', marks.map((i) => ({ delete: K.listenMark(String(i['episodeId']), listenerId, String(i['day'])) })));
  const last = items[items.length - 1];
  return last && lastKey ? { done: false, next: String(last['SK']) } : { done: true };
}
