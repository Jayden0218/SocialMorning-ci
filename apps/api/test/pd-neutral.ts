// Paid-lane test helpers that work on both backends: Postgres SQL today, DynamoDB items when the test runs hybrid (TEST_BACKEND=ddb).
/**
 * M26 lane PD. The money tests seed and assert purchases, entitlements, tips, gifts and redeem uses. Those rows live in
 * Postgres on the gate and in DynamoDB under ddb-api.yml, so each helper does the same thing on whichever backend `t`
 * runs: with `t.store` it reads/writes items (test/fixtures.ts, loaded dynamically so the Postgres coverage run never
 * loads them), otherwise the SQL the tests used to inline. Times come back as ISO strings on both. CUT deletes the
 * Postgres branches. (On DynamoDB the Postgres rows exist too — the bridge — but a test must check the truth.)
 */
import type { Key } from '../src/db/ddb/store.ts';
import type { TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());
/** Purchases seeded on DynamoDB in this process, for tips that point at them. */
const seeded = new Map<string, { key: Key; amountMicros: number | null; currency: string | null }>();

export type SeedPurchase = { listenerId: string; store: 'apple' | 'google'; productId: string; orderId: string; status?: 'active' | 'expired' | 'refunded'; purchaseToken?: string | null; amountMicros?: number | null; currency?: string | null };

/** A purchase row; returns its id. */
export async function seedPurchase(t: TestDb, p: SeedPurchase): Promise<string> {
  if (t.store) {
    const r = await (await fx()).purchaseItem(t.store, { listenerId: p.listenerId, store: p.store, productId: p.productId, orderId: p.orderId, status: p.status ?? 'active', purchaseToken: p.purchaseToken ?? null, amountMicros: p.amountMicros ?? null, currency: p.currency ?? null });
    seeded.set(r.id, { key: r.key, amountMicros: p.amountMicros ?? null, currency: p.currency ?? null });
    return r.id;
  }
  const [row] = await t.q<{ id: string }>(
    'INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, purchase_token, amount_micros, currency) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [p.listenerId, p.store, p.productId, p.orderId, p.status ?? 'active', p.purchaseToken ?? null, p.amountMicros ?? null, p.currency ?? null]);
  return row!.id;
}

/** An entitlement row (on DynamoDB, a purchase it names is recorded as granted by it, as the app does). */
export async function seedEntitlement(t: TestDb, e: { listenerId: string; kind: 'plus' | 'show'; ref?: string; until?: string | null; startsAt?: string | null; sourcePurchaseId?: string | null }): Promise<void> {
  const ref = e.ref ?? '';
  if (t.store) {
    const f = await fx();
    const key = await f.entitlementItem(t.store, { listenerId: e.listenerId, kind: e.kind, ref, until: e.until ?? null, startsAt: e.startsAt ?? null, sourcePurchaseId: e.sourcePurchaseId ?? null });
    const p = e.sourcePurchaseId ? seeded.get(e.sourcePurchaseId) : undefined;
    if (p) {
      const { update } = await import('../src/db/ddb/store.ts');
      await update(t.store, 'main', p.key, { update: 'SET #g = list_append(if_not_exists(#g, :e), :k)', names: { '#g': 'granted' }, values: { ':e': [], ':k': [key] } });
    }
    return;
  }
  await t.q('INSERT INTO entitlements (listener_id, kind, ref, until, starts_at, source_purchase_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [e.listenerId, e.kind, ref, e.until ?? null, e.startsAt ?? null, e.sourcePurchaseId ?? null]);
}

/** A tip row for a seeded purchase. */
export async function seedTip(t: TestDb, tip: { fromListener: string; feedUrl: string; purchaseId: string }): Promise<void> {
  if (t.store) {
    const p = seeded.get(tip.purchaseId);
    if (!p) throw new Error('seedTip: seed the purchase with seedPurchase first');
    await (await fx()).tipItem(t.store, { fromListener: tip.fromListener, feedUrl: tip.feedUrl, purchaseId: tip.purchaseId, purchaseKey: p.key, amountMicros: p.amountMicros, currency: p.currency });
    return;
  }
  await t.q('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [tip.fromListener, tip.feedUrl, tip.purchaseId]);
}

/** Every purchase as { status, test, account_hash, voided_at, purchase_token }. */
export async function purchaseRows(t: TestDb): Promise<{ status: string; test: boolean; account_hash: string | null; voided_at: string | null; purchase_token: string | null }[]> {
  if (t.store) {
    return (await (await fx()).pdItems(t.store, 'purchase')).map((p) => ({
      status: String(p['status']), test: Boolean(p['test']), account_hash: (p['accountHash'] as string | null | undefined) ?? null,
      voided_at: isoOrNull(p['voidedAt']), purchase_token: (p['purchaseToken'] as string | null | undefined) ?? null,
    }));
  }
  return (await t.q<Row>('SELECT status, test, account_hash, voided_at, purchase_token FROM purchases')).map((r) => ({
    status: String(r['status']), test: Boolean(r['test']), account_hash: (r['account_hash'] as string | null) ?? null, voided_at: isoOrNull(r['voided_at']), purchase_token: (r['purchase_token'] as string | null) ?? null,
  }));
}

export async function purchaseByToken(t: TestDb, token: string): Promise<{ status: string; voided_at: string | null } | undefined> {
  return (await purchaseRows(t)).find((p) => p.purchase_token === token);
}

export async function tipCount(t: TestDb): Promise<number> {
  if (t.store) return (await (await fx()).pdItems(t.store, 'tip')).length;
  return (await t.q('SELECT 1 FROM tips')).length;
}

export async function giftCount(t: TestDb): Promise<number> {
  if (t.store) return (await (await fx()).pdItems(t.store, 'gift')).length;
  return (await t.q('SELECT 1 FROM gifts')).length;
}

export type EntRow = { listener_id: string; kind: string; ref: string; starts_at: string | null; until: string | null };

/** Entitlement rows, filtered: `ref` exact, or `refPrefix` (the old `ref LIKE 'code:%'`); sorted by starts_at. */
export async function entitlementRows(t: TestDb, f: { listenerId?: string; kind?: 'plus' | 'show'; ref?: string; refs?: string[]; refPrefix?: string } = {}): Promise<EntRow[]> {
  let rows: EntRow[];
  if (t.store) {
    rows = (await (await fx()).pdItems(t.store, 'entitlement')).map((e) => ({
      listener_id: String(e['listenerId']), kind: String(e['kind']), ref: String(e['ref']), starts_at: isoOrNull(e['startsAt']), until: isoOrNull(e['until']),
    }));
  } else {
    rows = (await t.q<Row>('SELECT listener_id, kind, ref, starts_at, until FROM entitlements')).map((e) => ({
      listener_id: String(e['listener_id']), kind: String(e['kind']), ref: String(e['ref']), starts_at: isoOrNull(e['starts_at']), until: isoOrNull(e['until']),
    }));
  }
  return rows
    .filter((r) => (f.listenerId === undefined || r.listener_id === f.listenerId) && (f.kind === undefined || r.kind === f.kind)
      && (f.ref === undefined || r.ref === f.ref) && (f.refs === undefined || f.refs.includes(r.ref)) && (f.refPrefix === undefined || r.ref.startsWith(f.refPrefix)))
    .sort((a, b) => (a.starts_at ?? '') < (b.starts_at ?? '') ? -1 : (a.starts_at ?? '') > (b.starts_at ?? '') ? 1 : 0);
}

/** How many redeem uses this listener has. */
export async function redeemUseCount(t: TestDb, listenerId: string): Promise<number> {
  if (t.store) {
    const { queryAll } = await import('../src/db/ddb/paginate.ts');
    return (await queryAll(t.store, 'main', { KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': `L#${listenerId}`, ':sk': 'RUSE#' }, ConsistentRead: true })).items.length;
  }
  return (await t.q('SELECT 1 FROM redeem_uses WHERE listener_id = $1', [listenerId])).length;
}

/** A code's expiry moved (to make it expired). */
export async function setCodeExpiry(t: TestDb, code: string, iso: string): Promise<void> {
  if (t.store) { await (await fx()).pdSetCodeExpiry(t.store, code, iso); return; }
  await t.q('UPDATE redeem_codes SET expires_at = $2 WHERE code = $1', [code, iso]);
}

// ---- the error log, for test/m23-money.test.ts's US8 (lane AC's items) ----

export async function errorLogRows(t: TestDb): Promise<{ scope: string; count: number; stack: string | null; listener_id: string | null }[]> {
  if (t.store) {
    return (await (await fx()).acScan(t.store, 'main', 'errorReport')).map((e) => ({
      scope: String(e['scope']), count: Number(e['count']), stack: (e['stack'] as string | null | undefined) ?? null, listener_id: (e['listenerId'] as string | null | undefined) ?? null,
    }));
  }
  return t.q<{ scope: string; count: number; stack: string | null; listener_id: string | null }>('SELECT scope, count, stack, listener_id FROM error_reports');
}

/** Every error-log row was last seen `days` ago (its sweep queue key too). */
export async function ageErrorLog(t: TestDb, days: number): Promise<void> {
  const iso = new Date(Date.now() - days * 86_400_000).toISOString();
  if (t.store) {
    const { update } = await import('../src/db/ddb/store.ts');
    for (const e of await (await fx()).acScan(t.store, 'main', 'errorReport')) {
      const sk = String(e['G4SK'] ?? '');
      await update(t.store, 'main', { PK: String(e['PK']), SK: String(e['SK']) }, {
        update: 'SET #l = :l, G4SK = :sk', names: { '#l': 'lastSeen' }, values: { ':l': iso, ':sk': `${iso}${sk.slice(sk.indexOf('#'))}` },
      });
    }
    return;
  }
  await t.q('UPDATE error_reports SET last_seen = $1', [iso]);
}

/** A fresh error-log row with no sender. */
export async function addErrorLogRow(t: TestDb, scope: string, message: string): Promise<void> {
  if (t.store) {
    const { recordErrors } = await import('../src/db/repos/account/error-reports.ts');
    await recordErrors(t.db, null, [{ scope, message }]);
    return;
  }
  await t.q('INSERT INTO error_reports (scope, message) VALUES ($1, $2)', [scope, message]);
}
