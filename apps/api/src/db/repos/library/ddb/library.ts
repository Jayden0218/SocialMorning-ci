// Library sync on DynamoDB: L#<id>/LIB#<kind>#<key> items merged one by one, tombstones kept 30 days, 12 searches.
/**
 * M26 lane LB, LB-T05 (patterns LB-04…07), data-model.md §3, §10. The M10b rule per (kind, key): the later
 * own stamp (`deletedAt` if present, else `updatedAt`) wins and a tie keeps the tombstone. Each item is one
 * conditional write on the version read (the old merge was one transaction over the whole set; the rule
 * never needs two items at once). Every read is a Query of the listener's OWN partition (guard G-P1: nothing
 * here can return another listener's item). Tombstones carry a TTL 30 days after `deletedAt` as a backstop;
 * reads filter on `deletedAt` itself.
 */
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { get, isoNow, put, type Item, type Store } from '../../../ddb/store.ts';
import * as pg from '../library.ts';
import { SEARCH_MAX, TOMBSTONE_DAYS, type Kind, type LibraryIn, type LibraryRow } from '../library.ts';

const DAY_MS = 86_400_000;
const stampOf = (r: { updatedAt: string; deletedAt?: string | null }) => new Date(r.deletedAt ?? r.updatedAt).getTime();

function libraryRow(it: Item): LibraryRow {
  return {
    kind: String(it['kind']) as Kind, item_key: String(it['itemKey']), payload: (it['payload'] ?? {}) as Record<string, unknown>,
    updated_at: String(it['updatedAt']), deleted_at: it['deletedAt'] ? String(it['deletedAt']) : null,
  };
}

/** A sort key is at most 1 024 bytes; a long key (512 CJK characters is 1 536) is keyed by its hash — the item keeps the key itself. */
const libKey = (listenerId: string, kind: string, key: string) => K.libraryItem(listenerId, kind, Buffer.byteLength(key, 'utf8') > 400 ? `H:${K.sha(key)}` : key);

function libraryItem(listenerId: string, r: LibraryRow, v: number): Item {
  return encode('libraryItem', libKey(listenerId, r.kind, r.item_key), {
    listenerId, kind: r.kind, itemKey: r.item_key, payload: r.payload, updatedAt: r.updated_at, deletedAt: r.deleted_at, v,
  }, r.deleted_at ? { ttl: ttlAfter(Date.parse(r.deleted_at), TOMBSTONE_DAYS * DAY_MS) } : {});
}

async function items(store: Store, listenerId: string): Promise<Item[]> {
  const { items: all } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': K.LISTENER_SK.library },
    ConsistentRead: true,
  });
  return all;
}

export async function listAll(store: Store, _db: Pick<Db, 'query'>, listenerId: string): Promise<LibraryRow[]> {
  const keepAfter = store.clock.now() - TOMBSTONE_DAYS * DAY_MS;
  return (await items(store, listenerId)).map(libraryRow)
    .filter((r) => r.deleted_at === null || Date.parse(r.deleted_at) > keepAfter)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

const conditionFor = (cur: Item | undefined) => cur
  ? (cur['v'] === undefined ? { condition: 'attribute_not_exists(#v)', names: { '#v': 'v' } } : { condition: '#v = :seen', names: { '#v': 'v' }, values: { ':seen': Number(cur['v']) } })
  : { condition: 'attribute_not_exists(PK)' };

async function mergeOne(store: Store, listenerId: string, next: LibraryIn, first: Item | undefined): Promise<void> {
  let known: Item | undefined | null = first ?? null;
  await withVersionRetry(async (attempt) => {
    const cur = attempt === 1 && known !== null ? known : await get(store, 'main', libKey(listenerId, next.kind, next.key));
    known = null;
    if (cur) {
      const c = libraryRow(cur);
      const curStamp = stampOf({ updatedAt: c.updated_at, deletedAt: c.deleted_at });
      const nextStamp = stampOf(next);
      const nextTomb = (next.deletedAt ?? null) !== null;
      if (!(nextStamp > curStamp || (nextStamp === curStamp && nextTomb && c.deleted_at === null))) return;
    }
    const row: LibraryRow = {
      kind: next.kind, item_key: next.key, payload: pg.cleanPayload(next), updated_at: new Date(next.updatedAt).toISOString(),
      deleted_at: next.deletedAt ? new Date(next.deletedAt).toISOString() : null,
    };
    await put(store, 'main', libraryItem(listenerId, row, Number(cur?.['v'] ?? 0) + 1), conditionFor(cur));
  });
}

export async function merge(store: Store, db: Db, listenerId: string, incomingItems: readonly LibraryIn[]): Promise<LibraryRow[]> {
  if (incomingItems.length === 0) return listAll(store, db, listenerId);
  const incoming = new Map<string, LibraryIn>();
  for (const i of incomingItems) {
    const k = `${i.kind}\u0001${i.key}`;
    const prev = incoming.get(k);
    if (prev === undefined || stampOf(i) >= stampOf(prev)) incoming.set(k, i);
  }
  const existing = new Map((await items(store, listenerId)).map((it) => [`${String(it['kind'])}\u0001${String(it['itemKey'])}`, it]));
  for (const [k, next] of incoming) await mergeOne(store, listenerId, next, existing.get(k));
  // Search history keeps its newest SEARCH_MAX live terms; the rest become tombstones (stamped now).
  const live = (await items(store, listenerId)).filter((it) => it['kind'] === 'search' && !it['deletedAt'])
    .sort((a, b) => String(b['updatedAt']).localeCompare(String(a['updatedAt'])));
  const now = isoNow(store.clock);
  for (const it of live.slice(SEARCH_MAX)) {
    await put(store, 'main', libraryItem(listenerId, { ...libraryRow(it), deleted_at: now }, Number(it['v'] ?? 0) + 1), conditionFor(it)).catch((e: unknown) => {
      // Changed meanwhile by another phone: its own merge decides; the cap runs again on the next sync.
      if ((e as { name?: string })?.name !== 'ConditionalCheckFailedException') throw e;
    });
  }
  const raw = bridgeOf(db);
  if (raw) await pg.merge(raw, listenerId, incomingItems);
  return listAll(store, db, listenerId);
}
