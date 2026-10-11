// Shared pieces of the paid lane on DynamoDB: item shapes, the PLUS version and digest queue, and the Postgres mirror.
/**
 * M26 lane PD (data-model.md §3 `PUR#`, `RC#`, `GIFT#`, `L#…/ENT#`, and "Lane PD changes"). Every export of the files
 * in this folder takes `(store, db, ...args)` — the switch's shape (src/db/backend.ts `dual`); `db` is the app's
 * Postgres handle with the Store attached.
 *
 * Items (all STRICT in codec.ts):
 *   PUR#<sha(token)>/P            purchase; `granted` = the entitlement keys it created (a refund deletes those whose
 *                                 `sourcePurchaseId` is still this purchase), `tipKey`, `giftCode`, `earnKey`;
 *                                 G4 `Q#ack-due` while unacknowledged; G5 `REF#purchase#<id>`
 *   U#TXN#<orderId>               the store order id is unique (claimed in the creating transaction)
 *   L#<id>/PURCH#<at>#<id>        the buyer's pointer (wallet, deletion)
 *   L#<id>/ENT#<kind>#<ref>       entitlement (a show's ref = its feed key; the URL is on the item)
 *   L#<id>/PLUSV                  PLUS version: every PLUS change bumps `v` in its transaction (the old FOR UPDATE)
 *                                 and sets G4 `Q#plus#<tz>` while the listener has PLUS that has not ended
 *   L#<id>/TIP#<at>#<id>          tip, with the purchase's amount copied; G2 `SHTIPS#<feedKey>`
 *   SH#<feedKey>/EARN#<at>#<pid>  a sale, gift or tip for the Studio's earnings (not for test purchases)
 *   GIFT#<code>/G                 gift; L#<buyer>/GIFTB#…, L#<claimer>/GIFTC#… pointers
 *   RC#<sha256 hex>/CODE          redeem code (hash = key: one strong GetItem, unique by construction); G4 `Q#codes`
 *   L#<id>/RUSE#<sha256 hex>      "this account used this code" (the old redeem_uses primary key)
 *
 * The write BRIDGE (hybrid): lanes still on Postgres read `purchases`, `entitlements`, `tips`, `gifts` (Studio tips
 * and earnings, paid episodes, the dashboard, admin), so each write here also mirrors its rows there (bridge.ts).
 * Redeem codes and uses are read by nobody else and are not mirrored.
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, update, type Item, type Key, type Store } from '../../../ddb/store.ts';
import { DEFAULT_TZ, validTz } from '../digest.ts';
import type { TxA } from '../ddb/common.ts';
import * as B from './bridge.ts';

export const DAY_MS = 86_400_000;
export const nowMs = (store: Store): number => store.clock.now();
export const iso = (ms: number): string => new Date(ms).toISOString();
/** Any time value → ISO, or null. */
export const isoOf = (v: unknown): string | null => (v === undefined || v === null ? null : new Date(v as string).toISOString());
export const keyOf = (i: object): Key => ({ PK: String((i as Record<string, unknown>)['PK']), SK: String((i as Record<string, unknown>)['SK']) });
export const sameKey = (a: Key, b: Key): boolean => a.PK === b.PK && a.SK === b.SK;
export const newId = (): string => randomUUID();

// ---- purchases ----

export type PurchaseFields = {
  id: string; listenerId: string; store: 'google' | 'apple'; productId: string; storeTxnId: string; status: 'active' | 'expired' | 'refunded';
  expiresAt?: string | null; amountMicros?: number | null; currency?: string | null; createdAt: string; purchaseToken?: string | null;
  ref?: string | null; acknowledgedAt?: string; voidedAt?: string; accountHash?: string | null; test: boolean;
  granted?: Key[]; giftCode?: string; tipKey?: Key; earnKey?: Key; v?: number;
};
export type PurchaseItem = Item & PurchaseFields;

/** A purchase's key: by the token (a store without tokens — none today — would use its order id). */
export const purchaseKeyOf = (p: { purchaseToken?: string | null; storeTxnId: string }): Key => K.purchase(p.purchaseToken ?? p.storeTxnId);

/** On the `Q#ack-due` queue exactly while Google has not been told (acknowledgeDue's old WHERE). */
export function ackDue(p: { store: string; status: string; purchaseToken?: string | null; acknowledgedAt?: string | null }): boolean {
  return p.store === 'google' && p.status === 'active' && !p.acknowledgedAt && Boolean(p.purchaseToken);
}

/** The purchase item as Put (G4 / G5 keys from its state). */
export function purchaseItem(p: PurchaseFields): Item {
  const attrs: Record<string, unknown> = {};
  // An absent value is NOT stored as NULL where a later write tests it with if_not_exists / attribute_not_exists
  // (accountHash = COALESCE(account_hash, …); acknowledged; voided).
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || ['PK', 'SK', 't', 'G4PK', 'G4SK', 'G5PK', 'G5SK'].includes(k)) continue;
    if (v === null && ['accountHash', 'acknowledgedAt', 'voidedAt', 'giftCode', 'tipKey', 'earnKey'].includes(k)) continue;
    attrs[k] = v;
  }
  return encode('purchase', purchaseKeyOf(p), attrs, {
    gsi: { ...K.G5('purchase', p.id, p.createdAt), ...(ackDue(p) ? K.G4('ack-due', p.createdAt, p.id) : {}) },
  });
}

export const purchasePtrItem = (p: { listenerId: string; id: string; createdAt: string; key: Key }): Item =>
  encode('purchasePtr', K.purchasePtr(p.listenerId, p.createdAt, p.id), { purchaseId: p.id, purchasePK: p.key.PK, createdAt: p.createdAt });

export async function getPurchase(store: Store, key: Key): Promise<PurchaseItem | undefined> {
  return (await get(store, 'main', key)) as PurchaseItem | undefined;
}

/** The listener's purchases, newest first (pointers, then one BatchGet). */
export async function purchasesOfListener(store: Store, listenerId: string, limit?: number): Promise<PurchaseItem[]> {
  const ptrs = (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': K.PD_SK.purchases },
    ScanIndexForward: false, ConsistentRead: true,
  }, limit !== undefined ? { max: limit } : {})).items;
  const { batchGetAll } = await import('../../../ddb/batch.ts');
  const got = await batchGetAll(store, 'main', ptrs.map((p) => ({ PK: String(p['purchasePK']), SK: 'P' })));
  const byPk = new Map(got.map((g) => [String(g['PK']), g as PurchaseItem]));
  return ptrs.map((p) => byPk.get(String(p['purchasePK']))).filter((p): p is PurchaseItem => p !== undefined);
}

// ---- entitlements and the PLUS version ----

export type EntItem = Item & { listenerId: string; kind: 'plus' | 'show'; ref: string; until?: string | null; startsAt?: string | null; sourcePurchaseId?: string | null };

export function entItem(e: { listenerId: string; kind: 'plus' | 'show'; ref: string; until?: string | null; startsAt?: string | null; sourcePurchaseId?: string | null }): Item {
  return encode('entitlement', K.entitlement(e.listenerId, e.kind, e.ref), {
    listenerId: e.listenerId, kind: e.kind, ref: e.ref, until: e.until ?? null, startsAt: e.startsAt ?? null, sourcePurchaseId: e.sourcePurchaseId ?? null,
  });
}

export async function entitlementsOf(store: Store, listenerId: string, prefix: string = K.LISTENER_SK.entitlements): Promise<EntItem[]> {
  return (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': prefix }, ConsistentRead: true,
  })).items as EntItem[];
}

export const ms = (v: string | null | undefined): number | null => (v === null || v === undefined ? null : Date.parse(v));

/** A PLUS row has not ended (the old `until IS NULL OR until > now()`). */
export const notEnded = (e: EntItem, now: number): boolean => e.until === null || e.until === undefined || Date.parse(e.until) > now;
/** A PLUS row holds now (PLUS_LIVE_SQL). */
export const liveNow = (e: EntItem, now: number): boolean => (e.startsAt === null || e.startsAt === undefined || Date.parse(e.startsAt) <= now) && notEnded(e, now);

export type PlusState = { v: number; exists: boolean; rows: EntItem[] };

/** The version first, then the rows: a writer that changes the rows after this read has bumped the version, so our TX fails. */
export async function readPlus(store: Store, listenerId: string): Promise<PlusState> {
  const pv = await get(store, 'main', K.plusVersion(listenerId));
  const rows = await entitlementsOf(store, listenerId, K.PD_SK.plus);
  return { v: Number(pv?.['v'] ?? 0), exists: Boolean(pv), rows };
}

/** The listener's digest zone: their own time zone when valid, else the default (the digest's own rule). */
export async function zoneOf(store: Store, listenerId: string): Promise<string> {
  const l = await get(store, 'main', K.listener(listenerId));
  const tz = l?.['tz'];
  return typeof tz === 'string' && validTz(tz) ? tz : DEFAULT_TZ;
}

/** Remembers that `Q#plus#<tz>` may hold someone (not transactional: an extra zone only costs one empty Query). */
export async function addZone(store: Store, tz: string): Promise<void> {
  await update(store, 'main', K.plusZones(), {
    update: 'ADD #z :z SET #t = :t', names: { '#z': 'zones', '#t': 't' }, values: { ':z': new Set([tz]), ':t': 'plusZones' },
  });
}

/**
 * Adds the PLUS version bump to a transaction: condition on the version read, `v + 1`, and the digest queue key from
 * the rows as they will be AFTER this transaction (`after`): on `Q#plus#<tz>` with the latest end while any row has
 * not ended, off it otherwise. Label `plusv` (a failure = someone changed PLUS meanwhile → retry).
 */
export function bumpPlus(t: TxA, listenerId: string, st: PlusState, after: readonly EntItem[], tz: string, now: number): void {
  const live = after.filter((e) => notEnded(e, now));
  const forever = live.some((e) => e.until === null || e.until === undefined);
  const end = forever ? null : live.length ? iso(Math.max(...live.map((e) => Date.parse(e.until!)))) : undefined;
  const q = end === undefined ? undefined : K.G4plus(tz, end, listenerId);
  t.update('main', K.plusVersion(listenerId), {
    update: q ? 'SET v = :nv, t = :t, listenerId = :l, tz = :tz, G4PK = :qp, G4SK = :qs' : 'SET v = :nv, t = :t, listenerId = :l, tz = :tz REMOVE G4PK, G4SK',
    condition: st.exists ? 'v = :seen' : 'attribute_not_exists(PK)',
    values: { ':nv': st.v + 1, ':t': 'plusVersion', ':l': listenerId, ':tz': tz, ...(st.exists ? { ':seen': st.v } : {}), ...(q ? { ':qp': q.G4PK, ':qs': q.G4SK } : {}) },
    label: 'plusv',
  });
}

/**
 * Fix F-S (purchases.ts `rechainCodes`) in code: codes that have not started yet move after the latest end of every
 * other PLUS row that has not ended, in (startsAt, ref) order, each keeping its length; started codes never move,
 * nothing moves earlier. Returns the moved rows (new startsAt/until).
 */
export function rechain(rows: readonly EntItem[], now: number): EntItem[] {
  const isCode = (r: EntItem) => r.ref === 'code' || r.ref.startsWith('code:');
  const waiting = rows.filter((r) => isCode(r) && r.startsAt && Date.parse(r.startsAt) > now && r.until)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!) || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  if (waiting.length === 0) return [];
  const base = rows.filter((r) => !waiting.includes(r) && notEnded(r, now));
  if (base.some((r) => r.until === null || r.until === undefined)) return [];
  let cursor = Math.max(now, ...base.map((r) => Date.parse(r.until!)), 0);
  const moved: EntItem[] = [];
  for (const w of waiting) {
    const start = Date.parse(w.startsAt!);
    const length = Date.parse(w.until!) - start;
    const next = Math.max(start, cursor);
    if (next !== start) moved.push({ ...w, startsAt: iso(next), until: iso(next + length) });
    cursor = next + length;
  }
  return moved;
}

/** The rows after replacing/adding `changed` and removing `removed` keys. */
export function applyRows(rows: readonly EntItem[], changed: readonly EntItem[], removed: readonly Key[] = []): EntItem[] {
  const k = (e: object) => { const r = keyOf(e); return `${r.PK}|${r.SK}`; };
  const out = new Map(rows.map((r) => [k(r), r]));
  for (const r of removed) out.delete(k(r));
  for (const c of changed) out.set(k(c), c);
  return [...out.values()];
}

/** Puts the moved code rows into the transaction (their own keys; the version guards them). */
export function putRows(t: TxA, rows: readonly EntItem[]): void {
  for (const r of rows) t.put('main', entItem(r));
}

// ---- the bridge ----

/** Mirrors purchases (first: entitlements, tips and gifts point at them), then the listeners' entitlements, tips, gifts. */
export async function mirror(store: Store, db: Db, m: { purchases?: Key[]; listeners?: string[]; tips?: { key: Key; id: string }[]; gifts?: string[] }): Promise<void> {
  const raw = bridgeOf(db);
  if (!raw) return;
  for (const k of m.purchases ?? []) { const p = await getPurchase(store, k); if (p) await B.mirrorPurchase(raw, p); }
  for (const t of m.tips ?? []) await B.mirrorTip(raw, t.id, await get(store, 'main', t.key));
  for (const code of m.gifts ?? []) { const g = await get(store, 'main', K.gift(code)); if (g) await B.mirrorGift(raw, g); }
  for (const id of [...new Set(m.listeners ?? [])]) await B.mirrorEntitlements(raw, id, await entitlementsOf(store, id));
}
