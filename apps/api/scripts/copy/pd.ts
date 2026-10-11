// Lane PD's copy module: purchases, entitlements, tips, gifts, redeem codes and uses → the paid lane's DynamoDB items.
/**
 * M26 lane MIG (data-model.md §18 "Lane PD changes", Appendix A rows 29–32, 92, 108). Every item is built with the
 * lane's own builders (src/db/repos/account/paid-ddb/common.ts `purchaseItem`, `purchasePtrItem`, `entItem`) or with
 * `encode` + keys.ts exactly as paid-ddb/*.ts writes it:
 *
 *   purchases     → PUR#<sha(token)>/P (granted, giftCode, tipKey, earnKey; G4 `Q#ack-due` while Google is not told;
 *                   G5 `REF#purchase#<id>`), L#<buyer>/PURCH#… pointer, U#TXN#<orderId>; and the Studio earnings
 *                   SH#<feedKey>/EARN#<at>#<pid> (sale / gift / tip, `refunded`; never for a test purchase; a refunded
 *                   tip has none — its tips row was deleted, finding 3)
 *   entitlements  → L#<id>/ENT#<kind>#<ref>; L#<id>/PLUSV (v 1, tz, G4 `Q#plus#<tz>`) for every listener with a PLUS
 *                   row; CFG#plus-zones (the zones in use; no item when no one has PLUS — DynamoDB has no empty set)
 *   tips          → L#<from>/TIP#<at>#<id>, G2 `SHTIPS#<feedKey>` (the purchase's amount/currency copied)
 *   gifts         → GIFT#<code>/G, L#<buyer>/GIFTB#<at>#<code>, L#<claimer>/GIFTC#<code>
 *   redeem_codes  → RC#<sha256 hex>/CODE, G4 `Q#codes` (created_by / used_by are not kept on DynamoDB — §18)
 *   redeem_uses   → L#<listener>/RUSE#<sha256 hex>
 *
 * NULL handling follows the writers: a purchase never stores NULL `accountHash` / `acknowledgedAt` / `voidedAt` /
 * `giftCode` / `tipKey` / `earnKey` (purchaseItem drops them; later writes test them with if_not_exists /
 * attribute_not_exists), `amountMicros` / `currency` are omitted when unknown (the grant never sets them); a gift
 * omits `claimedBy` / `claimedAt` / `cancelledAt` until set (the claim's condition is attribute_not_exists); a code
 * omits `disabledAt` (the redeem's condition) and `usedAt` until used.
 *
 * `granted` = the entitlement keys whose `source_purchase_id` is this purchase — the buyer's PLUS/show row and the show
 * a claimed gift gave its claimer (the claim's entitlement carries the gift's purchase as its source). A key the app
 * would still list after another purchase took the row over is not recoverable and not needed (the refund skips it).
 *
 * PLUSV's queue key (one deliberate, read-equivalent difference): the code sets `Q#plus#<tz>` / `<latest end or ~>#<id>`
 * while a PLUS row has not ended AT ITS LAST WRITE and removes it otherwise. The copy may not read a clock
 * (deterministic), so it sets the key from ALL the listener's PLUS rows: `~` when any row is open-ended, else the latest
 * end. A listener whose rows all ended gets an end in the past, and the only reader (`plusMembersDue`) queries
 * `G4SK > now` — the same answer the code's state gives; the next PLUS write of that listener removes the key.
 */
import { createHash } from 'node:crypto';
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item, Key } from '../../src/db/ddb/store.ts';
import { kindOf } from '../../src/billing/products.ts';
import { DEFAULT_TZ, validTz } from '../../src/db/repos/account/digest.ts';
import { ackDue, entItem, purchaseItem, purchaseKeyOf, purchasePtrItem, type PurchaseFields } from '../../src/db/repos/account/paid-ddb/common.ts';
import { bool, bytes, iso, isoReq, json, num, numReq, str, type CounterCheck, type ItemIndex, type LaneModule, type Mismatch, type Row, type TableSpec } from './types.ts';

const M = 'main' as const;
const keyText = (k: Key) => `${k.PK}|${k.SK}`;
const zone = (tz: unknown): string => (typeof tz === 'string' && validTz(tz) ? tz : DEFAULT_TZ);
/** The redeem lookup key: sha256 of the (upper-case) code, hex — `code_hash` when stored (migration 025), else computed the same way. */
const codeHashHex = (code: string, stored: unknown): string => bytes(stored)?.toString('hex') ?? createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex');
/** Omit instead of NULL (the writer never stores these as NULL). */
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** The kind of a Studio earning for a product (`sale` for a paid show), or undefined (PLUS, unknown). */
const earnKindOf = (productId: string): 'sale' | 'gift' | 'tip' | undefined => {
  const k = kindOf(productId);
  return k === 'show' ? 'sale' : k === 'gift' || k === 'tip' ? k : undefined;
};

// ---- purchases ----

const PURCHASES_SQL = `
  SELECT p.id::text AS id, p.listener_id::text AS listener_id, p.store, p.product_id, p.store_txn_id, p.status, p.expires_at,
         p.amount_micros::text AS amount_micros, p.currency, p.created_at, p.purchase_token, p.ref, p.acknowledged_at, p.voided_at,
         p.account_hash, p.test,
         (SELECT coalesce(json_agg(json_build_array(e.listener_id::text, e.kind, e.ref)
                                   ORDER BY (e.listener_id <> p.listener_id), e.kind, e.listener_id, e.ref), '[]'::json)
            FROM entitlements e WHERE e.source_purchase_id = p.id) AS granted,
         g.code AS gift_code, g.feed_url AS gift_feed,
         t.id::text AS tip_id, t.from_listener::text AS tip_from, t.created_at AS tip_at, t.to_feed_url AS tip_feed
    FROM purchases p
    LEFT JOIN LATERAL (SELECT code, feed_url FROM gifts WHERE purchase_id = p.id ORDER BY created_at, id LIMIT 1) g ON true
    LEFT JOIN LATERAL (SELECT id, from_listener, created_at, to_feed_url FROM tips WHERE purchase_id = p.id ORDER BY created_at, id LIMIT 1) t ON true`;

/** The purchase's fields as the app's grant would have left them (the key needs only token / order id). */
function purchaseFields(r: Row): PurchaseFields & { key: Key } {
  const id = String(r['id']);
  const listenerId = String(r['listener_id']);
  const createdAt = isoReq(r['created_at']);
  const productId = String(r['product_id']);
  const test = bool(r['test']);
  const granted = (json<[string, 'plus' | 'show', string][]>(r['granted']) ?? []).map(([lid, kind, ref]) => K.entitlement(lid, kind, ref));
  const giftCode = str(r['gift_code'])?.trim() || undefined;
  const tipKey = r['tip_id'] ? K.tip(String(r['tip_from']), isoReq(r['tip_at']), String(r['tip_id'])) : undefined;
  // The grant TX writes the earning (and its key) for a show, gift or tip that is not a test purchase. A refund keeps
  // `earnKey` on the purchase (only the earning changes), so a refunded tip keeps it too.
  const ek = earnKindOf(productId);
  const feed = str(r['gift_feed']) ?? str(r['tip_feed']) ?? str(r['ref']);
  const earnKey = ek && !test && feed ? K.earning(feed, createdAt, id) : undefined;
  const f: PurchaseFields = {
    id, listenerId, store: String(r['store']) as 'google' | 'apple', productId, storeTxnId: String(r['store_txn_id']),
    status: String(r['status']) as 'active' | 'expired' | 'refunded', expiresAt: iso(r['expires_at']),
    amountMicros: opt(num(r['amount_micros'])), currency: opt(str(r['currency'])), createdAt, purchaseToken: str(r['purchase_token']),
    ref: str(r['ref']), acknowledgedAt: opt(iso(r['acknowledged_at'])), voidedAt: opt(iso(r['voided_at'])), accountHash: str(r['account_hash']),
    test, granted, v: 1, ...(giftCode ? { giftCode } : {}), ...(tipKey ? { tipKey } : {}), ...(earnKey ? { earnKey } : {}),
  };
  return { ...f, key: purchaseKeyOf(f) };
}

/** Postgres earnings (repos/studio/studio-earnings.ts earningRowsPg): sales by `ref`, gifts by the gift's show, tips by the tip's show. */
const EARNINGS_SQL = `
  SELECT DISTINCT x.kind, x.purchase_id, x.feed_url, x.created_at, x.amount_micros, x.currency, x.status FROM (
    SELECT 'sale' AS kind, p.id::text AS purchase_id, p.ref AS feed_url, p.created_at, p.amount_micros::text AS amount_micros, p.currency, p.status
      FROM purchases p WHERE p.ref IS NOT NULL AND p.product_id LIKE 'show\\_tier\\_%' AND NOT p.test
    UNION ALL
    SELECT 'gift', p.id::text, g.feed_url, p.created_at, p.amount_micros::text, p.currency, p.status
      FROM gifts g JOIN purchases p ON p.id = g.purchase_id WHERE NOT p.test
    UNION ALL
    SELECT 'tip', p.id::text, t.to_feed_url, p.created_at, p.amount_micros::text, p.currency, p.status
      FROM tips t JOIN purchases p ON p.id = t.purchase_id WHERE NOT p.test
  ) x`;

const purchases: TableSpec = {
  pgTable: 'purchases',
  sources: [
    {
      name: 'pd.purchases',
      sql: PURCHASES_SQL,
      keys: ['id'],
      map(r) {
        const { key, ...f } = purchaseFields(r);
        return [
          { table: M, item: purchaseItem(f) },
          { table: M, item: purchasePtrItem({ listenerId: f.listenerId, id: f.id, createdAt: f.createdAt, key }) },
          { table: M, item: encode('unique', K.U.txn(f.storeTxnId), { owner: f.id }) },
        ];
      },
    },
    {
      name: 'pd.earnings',
      sql: EARNINGS_SQL,
      keys: ['kind', 'purchase_id', 'feed_url'],
      map(r) {
        const createdAt = isoReq(r['created_at']);
        const feedUrl = String(r['feed_url']);
        const purchaseId = String(r['purchase_id']);
        return [{
          table: M,
          item: encode('earning', K.earning(feedUrl, createdAt, purchaseId), {
            kind: String(r['kind']), purchaseId, feedUrl, amountMicros: num(r['amount_micros']), currency: str(r['currency']),
            refunded: String(r['status']) === 'refunded', createdAt,
          }),
        }];
      },
    },
  ],
  counts: [
    { type: 'purchase' },
    { label: 'purchases → purchasePtr', type: 'purchasePtr' },
    { label: 'purchases → U#TXN', type: 'unique', pk: 'U#TXN#' },
    {
      label: 'purchases → Q#ack-due', type: 'purchase', where: (i) => i['G4PK'] === 'Q#ack-due',
      sql: "SELECT count(*)::int AS n FROM purchases WHERE store = 'google' AND status = 'active' AND acknowledged_at IS NULL AND purchase_token IS NOT NULL AND purchase_token <> ''",
    },
    { label: 'purchases → earning', type: 'earning', sql: `SELECT count(*)::int AS n FROM (SELECT DISTINCT kind, purchase_id, feed_url FROM (${EARNINGS_SQL}) e) d` },
  ],
  back: [{
    pgTable: 'purchases',
    pk: ['id'],
    match: (i) => i['t'] === 'purchase',
    toRow: (i) => ({
      id: i['id'], listener_id: i['listenerId'], store: i['store'], product_id: i['productId'], store_txn_id: i['storeTxnId'], status: i['status'],
      expires_at: i['expiresAt'] ?? null, amount_micros: i['amountMicros'] ?? null, currency: i['currency'] ?? null, created_at: i['createdAt'],
      purchase_token: i['purchaseToken'] ?? null, ref: i['ref'] ?? null, acknowledged_at: i['acknowledgedAt'] ?? null, voided_at: i['voidedAt'] ?? null,
      account_hash: i['accountHash'] ?? null, test: Boolean(i['test']),
    }),
  }],
};

// ---- entitlements, the PLUS version and its zones ----

const entitlements: TableSpec = {
  pgTable: 'entitlements',
  sources: [
    {
      name: 'pd.entitlements',
      sql: 'SELECT listener_id::text AS listener_id, kind, ref, until, starts_at, source_purchase_id::text AS source_purchase_id FROM entitlements',
      keys: ['listener_id', 'kind', 'ref'],
      map: (r) => [{
        table: M,
        item: entItem({
          listenerId: String(r['listener_id']), kind: String(r['kind']) as 'plus' | 'show', ref: String(r['ref']),
          until: iso(r['until']), startsAt: iso(r['starts_at']), sourcePurchaseId: str(r['source_purchase_id']),
        }),
      }],
    },
    {
      // One PLUSV per listener with a PLUS row (the header explains the queue key).
      name: 'pd.plusv',
      sql: `SELECT e.listener_id::text AS listener_id, l.tz, bool_or(e.until IS NULL) AS forever, max(e.until) AS last_end
              FROM entitlements e JOIN listeners l ON l.id = e.listener_id WHERE e.kind = 'plus' GROUP BY e.listener_id, l.tz`,
      keys: ['listener_id'],
      map(r) {
        const listenerId = String(r['listener_id']);
        const tz = zone(r['tz']);
        const end = bool(r['forever']) ? null : isoReq(r['last_end']);
        return [{ table: M, item: encode('plusVersion', K.plusVersion(listenerId), { listenerId, tz, v: 1 }, { gsi: K.G4plus(tz, end, listenerId) }) }];
      },
    },
    {
      // The zones that have a `Q#plus#<tz>` queue; no row (no item) when nobody has PLUS.
      name: 'pd.plus-zones',
      sql: `SELECT 'plus-zones' AS k, array_agg(DISTINCT coalesce(l.tz, '')) AS tzs
              FROM entitlements e JOIN listeners l ON l.id = e.listener_id WHERE e.kind = 'plus' HAVING count(*) > 0`,
      keys: ['k'],
      map(r) {
        const raw = r['tzs'];
        const list = Array.isArray(raw) ? raw : String(raw ?? '{}').replace(/^\{|\}$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
        const zones = new Set(list.map((z) => zone(z === '' || z === 'NULL' ? null : z)));
        return [{ table: M, item: encode('plusZones', K.plusZones(), { zones }) }];
      },
    },
  ],
  counts: [
    { type: 'entitlement' },
    { label: 'entitlements → PLUSV', type: 'plusVersion', sql: "SELECT count(DISTINCT listener_id)::int AS n FROM entitlements WHERE kind = 'plus'" },
    { label: 'entitlements → CFG#plus-zones', type: 'plusZones', sql: "SELECT (CASE WHEN EXISTS (SELECT 1 FROM entitlements WHERE kind = 'plus') THEN 1 ELSE 0 END)::int AS n" },
  ],
  back: [{
    pgTable: 'entitlements',
    pk: ['listener_id', 'kind', 'ref'],
    match: (i) => i['t'] === 'entitlement',
    toRow: (i) => ({
      listener_id: i['listenerId'], kind: i['kind'], ref: i['ref'], until: i['until'] ?? null, starts_at: i['startsAt'] ?? null,
      source_purchase_id: i['sourcePurchaseId'] ?? null,
    }),
  }],
};

// ---- tips ----

const tips: TableSpec = {
  pgTable: 'tips',
  sources: [{
    name: 'pd.tips',
    sql: `SELECT t.id::text AS id, t.from_listener::text AS from_listener, t.to_feed_url, t.purchase_id::text AS purchase_id, t.created_at,
                 p.purchase_token, p.store_txn_id, p.amount_micros::text AS amount_micros, p.currency
            FROM tips t JOIN purchases p ON p.id = t.purchase_id`,
    keys: ['id'],
    map(r) {
      const id = String(r['id']);
      const from = String(r['from_listener']);
      const createdAt = isoReq(r['created_at']);
      const feed = String(r['to_feed_url']);
      const pk = purchaseKeyOf({ purchaseToken: str(r['purchase_token']), storeTxnId: String(r['store_txn_id']) }).PK;
      return [{
        table: M,
        item: encode('tip', K.tip(from, createdAt, id), {
          id, fromListener: from, toFeedUrl: feed, purchaseId: String(r['purchase_id']), purchasePK: pk,
          amountMicros: num(r['amount_micros']), currency: str(r['currency']), createdAt,
        }, { gsi: K.G2tips(feed, createdAt, id) }),
      }];
    },
  }],
  counts: [{ type: 'tip' }],
  back: [{
    pgTable: 'tips',
    pk: ['id'],
    match: (i) => i['t'] === 'tip',
    toRow: (i) => ({ id: i['id'], from_listener: i['fromListener'], to_feed_url: i['toFeedUrl'], purchase_id: i['purchaseId'], created_at: i['createdAt'] }),
  }],
};

// ---- gifts ----

const gifts: TableSpec = {
  pgTable: 'gifts',
  sources: [{
    name: 'pd.gifts',
    sql: `SELECT g.id::text AS id, g.code, g.buyer_id::text AS buyer_id, g.feed_url, g.purchase_id::text AS purchase_id, g.claimed_by::text AS claimed_by,
                 g.claimed_at, g.cancelled_at, g.created_at, p.purchase_token, p.store_txn_id
            FROM gifts g JOIN purchases p ON p.id = g.purchase_id`,
    keys: ['id'],
    map(r) {
      const code = String(r['code']).trim();
      const buyerId = String(r['buyer_id']);
      const createdAt = isoReq(r['created_at']);
      const claimedBy = str(r['claimed_by']);
      const claimedAt = iso(r['claimed_at']);
      const pk = purchaseKeyOf({ purchaseToken: str(r['purchase_token']), storeTxnId: String(r['store_txn_id']) }).PK;
      const out = [
        {
          table: M,
          item: encode('gift', K.gift(code), {
            id: String(r['id']), code, buyerId, feedUrl: String(r['feed_url']), purchaseId: String(r['purchase_id']), purchasePK: pk, createdAt,
            claimedBy: opt(claimedBy), claimedAt: opt(claimedAt), cancelledAt: opt(iso(r['cancelled_at'])),
          }),
        },
        { table: M, item: encode('giftPtr', K.giftBought(buyerId, createdAt, code), { code, createdAt }) },
      ];
      if (claimedBy) out.push({ table: M, item: encode('giftPtr', K.giftClaimed(claimedBy, code), { code, createdAt: claimedAt ?? createdAt }) });
      return out;
    },
  }],
  counts: [
    { type: 'gift' },
    { label: 'gifts → GIFTB# pointer', type: 'giftPtr', where: (i) => String(i['SK']).startsWith(K.PD_SK.giftsBought) },
    { label: 'gifts → GIFTC# pointer', type: 'giftPtr', where: (i) => String(i['SK']).startsWith(K.PD_SK.giftsClaimed), sql: 'SELECT count(*)::int AS n FROM gifts WHERE claimed_by IS NOT NULL' },
  ],
  back: [{
    pgTable: 'gifts',
    pk: ['id'],
    match: (i) => i['t'] === 'gift',
    toRow: (i) => ({
      id: i['id'], code: i['code'], buyer_id: i['buyerId'], feed_url: i['feedUrl'], purchase_id: i['purchaseId'], claimed_by: i['claimedBy'] ?? null,
      claimed_at: i['claimedAt'] ?? null, cancelled_at: i['cancelledAt'] ?? null, created_at: i['createdAt'],
    }),
  }],
};

// ---- redeem codes and uses ----

const redeemCodes: TableSpec = {
  pgTable: 'redeem_codes',
  sources: [{
    name: 'pd.redeem-codes',
    sql: 'SELECT code, grants, code_hash, max_uses, uses, note, expires_at, disabled_at, created_at, used_at FROM redeem_codes',
    keys: ['code'],
    map(r) {
      const code = String(r['code']);
      const hash = codeHashHex(code, r['code_hash']);
      const createdAt = isoReq(r['created_at']);
      return [{
        table: M,
        item: encode('redeemCode', K.redeemCode(hash), {
          code, codeHash: hash, grants: json(r['grants']), maxUses: numReq(r['max_uses']), uses: numReq(r['uses']), note: String(r['note'] ?? ''),
          expiresAt: iso(r['expires_at']), disabledAt: opt(iso(r['disabled_at'])), createdAt, usedAt: opt(iso(r['used_at'])),
        }, { gsi: K.G4('codes', createdAt, code) }),
      }];
    },
  }],
  counts: [{ type: 'redeemCode' }],
  back: [{
    // created_by / used_by are not kept on DynamoDB (§18): they come back NULL.
    pgTable: 'redeem_codes',
    pk: ['code'],
    match: (i) => i['t'] === 'redeemCode',
    toRow: (i) => ({
      code: i['code'], grants: i['grants'], code_hash: Buffer.from(String(i['codeHash']), 'hex'), max_uses: i['maxUses'], uses: i['uses'], note: i['note'] ?? '',
      expires_at: i['expiresAt'] ?? null, disabled_at: i['disabledAt'] ?? null, created_at: i['createdAt'], used_at: i['usedAt'] ?? null,
    }),
  }],
};

const redeemUses: TableSpec = {
  pgTable: 'redeem_uses',
  sources: [{
    name: 'pd.redeem-uses',
    sql: `SELECT u.code, u.listener_id::text AS listener_id, u.used_at, r.code_hash
            FROM redeem_uses u JOIN redeem_codes r ON r.code = u.code`,
    keys: ['code', 'listener_id'],
    map(r) {
      const code = String(r['code']);
      return [{ table: M, item: encode('redeemUse', K.redeemUse(codeHashHex(code, r['code_hash']), String(r['listener_id'])), { code, usedAt: isoReq(r['used_at']) }) }];
    },
  }],
  counts: [{ type: 'redeemUse' }],
  back: [{
    pgTable: 'redeem_uses',
    pk: ['code', 'listener_id'],
    match: (i) => i['t'] === 'redeemUse',
    toRow: (i) => ({ code: i['code'], listener_id: String(i['PK']).slice(2), used_at: i['usedAt'] }),
  }],
};

// ---- counter checks (read only) ----

const keyOfItem = (i: Item): Key => ({ PK: String(i['PK']), SK: String(i['SK']) });

/** `granted` = exactly the entitlements whose `sourcePurchaseId` is this purchase (what a refund removes). */
const grantedCheck: CounterCheck = {
  name: 'purchase.granted',
  check(ix: ItemIndex): Mismatch[] {
    const bySource = new Map<string, string[]>();
    for (const e of ix.ofType('entitlement')) {
      const s = e['sourcePurchaseId'];
      if (typeof s === 'string' && s) (bySource.get(s) ?? bySource.set(s, []).get(s)!).push(keyText(keyOfItem(e)));
    }
    const out: Mismatch[] = [];
    for (const p of ix.ofType('purchase')) {
      const stored = ((p['granted'] as Key[] | undefined) ?? []).map(keyText).sort();
      const re = (bySource.get(String(p['id'])) ?? []).sort();
      if (stored.join(',') !== re.join(',')) out.push({ counter: 'purchase.granted', key: keyText(keyOfItem(p)), stored: stored.length, recomputed: re.length });
    }
    return out;
  },
};

/** The ack queue key is there exactly while `ackDue` (acknowledgeDue's old WHERE). */
const ackQueueCheck: CounterCheck = {
  name: 'purchase.ackDue',
  check(ix: ItemIndex): Mismatch[] {
    const out: Mismatch[] = [];
    for (const p of ix.ofType('purchase')) {
      const want = ackDue(p as unknown as { store: string; status: string; purchaseToken?: string | null; acknowledgedAt?: string | null });
      const has = p['G4PK'] === 'Q#ack-due';
      if (want !== has) out.push({ counter: 'purchase.ackDue', key: keyText(keyOfItem(p)), stored: has, recomputed: want });
    }
    return out;
  },
};

/** A redeem code's `uses` counts its RUSE# markers (legacy single-use codes may count one without a marker) and never exceeds maxUses. */
const usesCheck: CounterCheck = {
  name: 'redeemCode.uses',
  check(ix: ItemIndex): Mismatch[] {
    const used = new Map<string, number>();
    for (const u of ix.ofType('redeemUse')) {
      const h = String(u['SK']).slice(K.PD_SK.redeemUses.length);
      used.set(h, (used.get(h) ?? 0) + 1);
    }
    const out: Mismatch[] = [];
    for (const c of ix.ofType('redeemCode')) {
      const uses = Number(c['uses'] ?? 0);
      const re = used.get(String(c['codeHash'])) ?? 0;
      if (uses < re || uses > Number(c['maxUses'])) out.push({ counter: 'redeemCode.uses', key: keyText(keyOfItem(c)), stored: uses, recomputed: re });
    }
    return out;
  },
};

/** Every listener with a PLUS row has PLUSV on `Q#plus#<its tz>` with the latest end (or `~`), and its zone is in CFG#plus-zones. */
const plusQueueCheck: CounterCheck = {
  name: 'plusVersion.queue',
  check(ix: ItemIndex): Mismatch[] {
    const rows = new Map<string, Item[]>();
    for (const e of ix.ofType('entitlement')) if (e['kind'] === 'plus') {
      const id = String(e['listenerId']);
      (rows.get(id) ?? rows.set(id, []).get(id)!).push(e);
    }
    const zones = ix.get(M, K.plusZones().PK, K.plusZones().SK)?.['zones'] as Set<string> | undefined;
    const out: Mismatch[] = [];
    for (const [id, rs] of rows) {
      const k = K.plusVersion(id);
      const pv = ix.get(M, k.PK, k.SK);
      const forever = rs.some((r) => r['until'] === null || r['until'] === undefined);
      const end = forever ? null : rs.map((r) => String(r['until'])).sort().pop()!;
      const tz = typeof pv?.['tz'] === 'string' ? String(pv['tz']) : DEFAULT_TZ;
      const want = K.G4plus(tz, end, id);
      if (!pv || pv['G4PK'] !== want.G4PK || pv['G4SK'] !== want.G4SK) {
        out.push({ counter: 'plusVersion.queue', key: keyText(k), stored: pv ? `${String(pv['G4PK'])}|${String(pv['G4SK'])}` : null, recomputed: `${want.G4PK}|${want.G4SK}` });
      }
      if (pv && !zones?.has(tz)) out.push({ counter: 'plusZones.zones', key: keyText(K.plusZones()), stored: zones ? zones.size : null, recomputed: tz === DEFAULT_TZ ? 'default zone' : 'a listener zone' });
    }
    return out;
  },
};

export const lane: LaneModule = {
  lane: 'pd',
  tables: [purchases, entitlements, tips, gifts, redeemCodes, redeemUses],
  counters: [grantedCheck, ackQueueCheck, usesCheck, plusQueueCheck],
};
