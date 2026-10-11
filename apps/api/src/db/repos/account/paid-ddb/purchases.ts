// Store purchases on DynamoDB: granted once per token, refunded in one transaction, PLUS chained under a version.
/**
 * M26 lane PD (PD-T01…T03, T06; patterns PD-01…PD-21, PD-40…PD-42). Postgres twins: ../purchases.ts.
 *
 * - Grant (PD-01, PD-06): the purchase item is keyed by the token's hash and Put with attribute_not_exists in ONE
 *   transaction with `U#TXN#<orderId>`, the buyer's pointer and what it grants (PLUS row + moved codes + the PLUS
 *   version; a show entitlement; a gift; a tip) and its Studio earning. Two notices for one token race on that
 *   condition: one transaction wins, the other is cancelled and answers `repeated` — never a second grant
 *   (guard G-M26-PD1). `granted` records the entitlement keys it created.
 * - Access-patterns finding 2 is KEPT (owner to decide): a NEW token whose order id is already stored fails on
 *   `U#TXN#` and throws, as the Postgres unique violation did (a 500).
 * - Refund (PD-12…PD-15, M23 US4): GetItem, then ONE transaction: purchase voided (condition: not voided yet), each
 *   granted entitlement deleted only while its `sourcePurchaseId` is still this purchase (a renewal by another purchase
 *   keeps it), the tip deleted, the gift cancelled, the earning marked refunded (a tip's earning deleted — finding 3
 *   kept). A fault anywhere leaves everything as it was; the next run retries it whole (G-M23-5, G-M26-PD2).
 * - PLUS (fix F-S, PD-17…PD-20): one row per source in `L#<id>/ENT#plus#<ref>`; every change reads the PLUS version,
 *   computes the chain in code (common.ts `rechain`) and writes rows + version in one transaction (the old
 *   FOR UPDATE). The version item carries the digest queue key `Q#plus#<tz>` (AC-T07's PLUS half).
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import type { GooglePlay } from '../../../../billing/google-play.ts';
import { kindOf, tierOf } from '../../../../billing/products.ts';
import { fnv1a64 } from '@socialmorning/social-core';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { isConflict, withRetry } from '../../../ddb/retry.ts';
import { get, type Item, type Key, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { claimUnique } from '../../../ddb/unique.ts';
import { readEntry, writeEntry } from '../../library/ddb/cache.ts';
import { showNewest } from '../../library/ddb/episodes.ts';
import { txa, upd, unlessCondition } from '../ddb/common.ts';
import { DEFAULT_TZ, localClock, validTz } from '../digest.ts';
import { newGiftCode } from '../gifts.ts';
import {
  ACTIVE_STATES, checkAccount, checkTest, plusRun,
  type EntitlementListRow, type GiftAdminRow, type GrantIn, type Granted, type MoneyRow, type PurchaseListRow, type TipAdminRow, type TipListRow,
} from '../purchases.ts';
import {
  addZone, applyRows, bumpPlus, DAY_MS, entItem, entitlementsOf, getPurchase, iso, isoOf, keyOf, liveNow, mirror, newId, notEnded,
  nowMs, purchaseItem, purchasePtrItem, purchasesOfListener, putRows, readPlus, rechain, zoneOf, ackDue, type EntItem, type PurchaseItem,
} from './common.ts';
import { hostedPriceTier, tipsEnabled } from './foreign.ts';

const PLUS_STORE = '';

/** Retry a grant/refund/PLUS change cancelled by a moved version or a concurrent writer (not by a real refusal). */
const retryable = (...labels: string[]) => (e: unknown) => isConflict(e) || (e instanceof TxCancelled && labels.some((l) => e.failed(l)));

// ---- grant (PD-01 … PD-11) ----

type Outcome = { id: string; raced: boolean; giftCode?: string | undefined };

export async function grantGoogle(store: Store, db: Db, play: GooglePlay, p: GrantIn): Promise<Granted> {
  const kind = kindOf(p.productId);
  if (!kind) throw new ApiError('validation', 'No such product.', { fields: ['productId'] });
  const key = K.purchase(p.purchaseToken);
  const seen = await getPurchase(store, key);
  if (seen && seen.listenerId !== p.listenerId) throw new ApiError('conflict', 'This purchase belongs to another account.');
  if (seen) checkAccount(undefined, p.listenerId, seen.accountHash ?? null);
  if (seen && kind !== 'plus') {
    return { purchaseId: seen.id, kind, status: seen.status, expiresAt: isoOf(seen.expiresAt), repeated: true, ...(kind === 'gift' && seen.giftCode ? { giftCode: seen.giftCode } : {}) };
  }

  let expiresAt: string | null = null;
  let orderId: string | null = null;
  let acknowledged = false;
  let feedUrl: string | null = null;
  let accountHash: string | null = null;
  let test = false;
  if (kind === 'plus') {
    const s = await play.subscription(p.purchaseToken);
    if (s.productId !== p.productId) throw new ApiError('validation', 'That purchase is for another product.', { fields: ['productId'] });
    test = checkTest(s.test, p.allowTest);
    accountHash = checkAccount(s.accountId, p.listenerId);
    if (!ACTIVE_STATES.has(s.state)) {
      if (seen) {
        await unlessCondition(upd(store, 'main', key, { update: 'SET status = :x REMOVE G4PK, G4SK', condition: 'status = :a', values: { ':x': 'expired', ':a': 'active' } }));
        await mirror(store, db, { purchases: [key] });
      }
      throw new ApiError('not_paid', 'Google has not taken this payment.');
    }
    expiresAt = s.expiresAt; orderId = s.orderId; acknowledged = s.acknowledged;
  } else {
    if (!p.feedUrl) throw new ApiError('validation', 'Say which show.', { fields: ['feedUrl'] });
    const g = await play.product(p.productId, p.purchaseToken);
    if (g.purchaseState !== 0) throw new ApiError('not_paid', 'Google has not taken this payment.');
    test = checkTest(g.test, p.allowTest);
    accountHash = checkAccount(g.accountId, p.listenerId);
    if (g.profileId !== fnv1a64(p.feedUrl)) throw new ApiError('validation', 'That purchase is for another show.', { fields: ['feedUrl'] });
    if (kind === 'show' || kind === 'gift') {
      const show = await hostedPriceTier(db, p.feedUrl);
      if (!show || show.price_tier === null) throw new ApiError('validation', 'This show sells nothing.', { fields: ['feedUrl'] });
      if (show.price_tier !== tierOf(p.productId)) throw new ApiError('validation', 'That is not this show\'s price.', { fields: ['productId'] });
    } else if (!(await tipsEnabled(db, p.feedUrl))) {
      throw new ApiError('validation', 'This show does not take tips.', { fields: ['feedUrl'] });
    }
    feedUrl = p.feedUrl; orderId = g.orderId; acknowledged = g.acknowledged;
  }

  const w = { kind, productId: p.productId, key, expiresAt: isoOf(expiresAt), orderId, feedUrl, accountHash, test }; // stored as ISO; answered as Google sent it
  let out: Outcome;
  try {
    out = await withRetry(async (attempt) => {
      const now = attempt === 1 ? seen : await getPurchase(store, key);
      if (now && !seen) {
        // Another notice for this token committed first: it granted; grant nothing here (the old `raced`).
        if (now.listenerId !== p.listenerId) throw new ApiError('conflict', 'This purchase belongs to another account.');
        return { id: now.id, raced: true, giftCode: now.giftCode };
      }
      return now ? renewPlus(store, db, p.listenerId, now, w) : create(store, db, p.listenerId, p.purchaseToken, w);
    }, { tries: 8, retryOn: (e) => isConflict(e) || (e instanceof TxCancelled && (e.failed('purchase') || e.failed('plusv') || e.failed('ent') || e.failed('gift'))) });
  } catch (e) {
    if (!(e instanceof TxCancelled && e.failed('unique:TXN'))) throw e;
    const again = seen ? undefined : await getPurchase(store, key);
    // The same token, committed by a racing notice (its order id is the same too): that one granted.
    if (again && again.listenerId === p.listenerId) out = { id: again.id, raced: true, giftCode: again.giftCode };
    // Access-patterns finding 2, kept: a NEW token with a stored order id fails as the Postgres unique violation
    // on store_txn_id did (a 500) — never a silent grant. The owner decides (tasks.md PD-T01).
    else throw new Error('purchase: this store order id is already stored under another purchase token');
  }

  const at = iso(nowMs(store));
  if (!acknowledged && !out.raced) {
    try {
      await play.acknowledge(kind === 'plus' ? 'subscription' : 'product', p.productId, p.purchaseToken);
      await upd(store, 'main', key, { update: 'SET acknowledgedAt = :now REMOVE G4PK, G4SK', condition: 'attribute_exists(PK)', values: { ':now': at } });
      await mirror(store, db, { purchases: [key] });
    } catch (e) {
      console.error('google acknowledge failed; the cycle retries', e instanceof Error ? e.message : String(e));
    }
  } else if (acknowledged) {
    await upd(store, 'main', key, { update: 'SET acknowledgedAt = if_not_exists(acknowledgedAt, :now) REMOVE G4PK, G4SK', condition: 'attribute_exists(PK)', values: { ':now': at } });
    await mirror(store, db, { purchases: [key] });
  }
  const giftCode = kind === 'gift' ? out.giftCode : undefined;
  return { purchaseId: out.id, kind, status: 'active', expiresAt, repeated: Boolean(seen) || out.raced, ...(giftCode ? { giftCode } : {}) };
}

type Write = { kind: 'plus' | 'show' | 'gift' | 'tip'; productId: string; key: Key; expiresAt: string | null; orderId: string | null; feedUrl: string | null; accountHash: string | null; test: boolean };

/** The PLUS rows after the store row is set to `until` (its start kept), the codes it pushes later, and the version bump. */
async function plusChange(store: Store, t: ReturnType<typeof txa>, listenerId: string, row: { ref: string; until: string | null; sourcePurchaseId: string | null }): Promise<void> {
  const st = await readPlus(store, listenerId);
  const now = nowMs(store);
  const cur = st.rows.find((r) => r.ref === row.ref);
  const next = { listenerId, kind: 'plus' as const, ref: row.ref, until: row.until, startsAt: cur?.startsAt ?? null, sourcePurchaseId: row.sourcePurchaseId } as EntItem;
  const after = applyRows(st.rows, [{ ...next, ...K.entitlement(listenerId, 'plus', row.ref) } as EntItem]);
  const moved = rechain(after, now);
  t.put('main', entItem(next));
  putRows(t, moved);
  const tz = await zoneOf(store, listenerId);
  await addZone(store, tz);
  bumpPlus(t, listenerId, st, applyRows(after, moved), tz, now);
}

async function create(store: Store, db: Db, listenerId: string, token: string, w: Write): Promise<Outcome> {
  const id = newId();
  const createdAt = iso(nowMs(store));
  const t = txa(store);
  const granted: Key[] = [];
  let giftCode: string | undefined;
  let tipKey: Key | undefined;
  let tipId: string | undefined;
  let earnKey: Key | undefined;
  if (w.kind === 'plus') {
    await plusChange(store, t, listenerId, { ref: PLUS_STORE, until: w.expiresAt, sourcePurchaseId: id });
    granted.push(K.entitlement(listenerId, 'plus', PLUS_STORE));
  } else if (w.kind === 'show') {
    const ek = K.entitlement(listenerId, 'show', w.feedUrl!);
    // ON CONFLICT DO NOTHING: a show already owned (a gift, a code) keeps its own source.
    if (await get(store, 'main', ek)) t.check('main', ek, { condition: 'attribute_exists(PK)', label: 'ent' });
    else {
      t.put('main', entItem({ listenerId, kind: 'show', ref: w.feedUrl!, until: null, sourcePurchaseId: id }), { condition: 'attribute_not_exists(PK)', label: 'ent' });
      granted.push(ek);
    }
  } else if (w.kind === 'gift') {
    // M22 US14: the buyer gets a code, not the show (FR-042). A taken code cancels the TX; the retry draws another.
    giftCode = newGiftCode();
    t.put('main', encode('gift', K.gift(giftCode), { id: newId(), code: giftCode, buyerId: listenerId, feedUrl: w.feedUrl!, purchaseId: id, purchasePK: w.key.PK, createdAt }), { condition: 'attribute_not_exists(PK)', label: 'gift' });
    t.put('main', encode('giftPtr', K.giftBought(listenerId, createdAt, giftCode), { code: giftCode, createdAt }));
  } else {
    tipId = newId();
    tipKey = K.tip(listenerId, createdAt, tipId);
    t.put('main', encode('tip', tipKey, { id: tipId, fromListener: listenerId, toFeedUrl: w.feedUrl!, purchaseId: id, purchasePK: w.key.PK, amountMicros: null, currency: null, createdAt }, { gsi: K.G2tips(w.feedUrl!, createdAt, tipId) }));
  }
  if (w.kind !== 'plus' && !w.test) {
    // The Studio's earnings (ST-T08 reads these): never a test purchase (M25 SB).
    earnKey = K.earning(w.feedUrl!, createdAt, id);
    t.put('main', encode('earning', earnKey, { kind: w.kind === 'show' ? 'sale' : w.kind, purchaseId: id, feedUrl: w.feedUrl!, amountMicros: null, currency: null, refunded: false, createdAt }));
  }
  t.put('main', purchaseItem({
    id, listenerId, store: 'google', productId: w.productId, storeTxnId: w.orderId ?? token, status: 'active', expiresAt: w.expiresAt, createdAt, purchaseToken: token,
    ref: w.feedUrl, accountHash: w.accountHash, test: w.test, granted, v: 1, ...(giftCode ? { giftCode } : {}), ...(tipKey ? { tipKey } : {}), ...(earnKey ? { earnKey } : {}),
  } as PurchaseItem), { condition: 'attribute_not_exists(PK)', label: 'purchase' });
  claimUnique(t.raw, K.U.txn(w.orderId ?? token), id);
  t.put('main', purchasePtrItem({ listenerId, id, createdAt, key: w.key }));
  await t.commit();
  await mirror(store, db, { purchases: [w.key], listeners: w.kind === 'plus' || w.kind === 'show' ? [listenerId] : [], ...(tipKey ? { tips: [{ key: tipKey, id: tipId! }] } : {}), ...(giftCode ? { gifts: [giftCode] } : {}) });
  return { id, raced: false, giftCode };
}

/** PLUS sent again: the purchase is active again until Google's new expiry; the store row follows; waiting codes move later. */
async function renewPlus(store: Store, db: Db, listenerId: string, seen: PurchaseItem, w: Write): Promise<Outcome> {
  const t = txa(store);
  await plusChange(store, t, listenerId, { ref: PLUS_STORE, until: w.expiresAt, sourcePurchaseId: seen.id });
  const ent = K.entitlement(listenerId, 'plus', PLUS_STORE);
  const granted = (seen.granted ?? []).some((g) => g.PK === ent.PK && g.SK === ent.SK) ? seen.granted! : [...(seen.granted ?? []), ent];
  const q = ackDue({ ...seen, status: 'active' }) ? K.G4('ack-due', seen.createdAt, seen.id) : undefined;
  t.update('main', w.key, {
    update: `SET status = :a, expiresAt = :e, granted = :g${w.accountHash ? ', accountHash = if_not_exists(accountHash, :h)' : ''}${q ? ', G4PK = :qp, G4SK = :qs' : ' REMOVE G4PK, G4SK'}`,
    condition: 'attribute_exists(PK)',
    values: { ':a': 'active', ':e': w.expiresAt, ':g': granted, ...(w.accountHash ? { ':h': w.accountHash } : {}), ...(q ? { ':qp': q.G4PK, ':qs': q.G4SK } : {}) },
    label: 'purchase',
  });
  await t.commit();
  await mirror(store, db, { purchases: [w.key], listeners: [listenerId] });
  return { id: seen.id, raced: false };
}

// ---- refund (PD-12 … PD-15) ----

export async function applyVoided(store: Store, db: Db, voided: { purchaseToken: string; voidedAt: number }[]): Promise<{ withdrawn: number; unknown: number; failed?: number }> {
  let withdrawn = 0;
  let unknown = 0;
  let failed = 0;
  for (const v of voided) {
    try {
      const outcome = await withRetry(() => refundOne(store, db, v), { tries: 4, retryOn: retryable('purchase', 'ent', 'plusv') });
      if (outcome === 'withdrawn') withdrawn++;
      if (outcome === 'unknown') { unknown++; console.warn('google refund for a purchase this server never saw'); }
    } catch (e) {
      failed++;
      console.error('google refund failed; the next run retries it', e instanceof Error ? e.message : String(e));
    }
  }
  return { withdrawn, unknown, ...(failed > 0 ? { failed } : {}) };
}

async function refundOne(store: Store, db: Db, v: { purchaseToken: string; voidedAt: number }): Promise<'withdrawn' | 'seen' | 'unknown'> {
  const key = K.purchase(v.purchaseToken);
  const p = await getPurchase(store, key);
  if (!p) return 'unknown';
  if (p.voidedAt) return 'seen';
  const now = nowMs(store);
  const t = txa(store);
  t.update('main', key, {
    update: 'SET status = :r, voidedAt = :at REMOVE G4PK, G4SK',
    condition: 'attribute_exists(PK) AND attribute_not_exists(voidedAt)',
    values: { ':r': 'refunded', ':at': iso(v.voidedAt) }, label: 'purchase',
  });
  const listeners = new Set<string>();
  const plusGone = new Map<string, Key[]>();
  for (const gk of p.granted ?? []) {
    const e = (await get(store, 'main', keyOf(gk))) as EntItem | undefined;
    if (!e || e.sourcePurchaseId !== p.id) continue; // a later purchase (or a gift, a code) owns it now
    t.delete('main', keyOf(gk), { condition: 'sourcePurchaseId = :pid', values: { ':pid': p.id }, label: 'ent' });
    listeners.add(e.listenerId);
    if (e.kind === 'plus') plusGone.set(e.listenerId, [...(plusGone.get(e.listenerId) ?? []), keyOf(gk)]);
  }
  for (const [lid, gone] of plusGone) {
    const st = await readPlus(store, lid);
    bumpPlus(t, lid, st, applyRows(st.rows, [], gone), await zoneOf(store, lid), now);
  }
  let tip: { key: Key; id: string } | undefined;
  if (p.tipKey && (await get(store, 'main', keyOf(p.tipKey)))) {
    tip = { key: keyOf(p.tipKey), id: String(p.tipKey.SK).split('#').pop()! };
    t.delete('main', tip.key);
  }
  if (p.giftCode && (await get(store, 'main', K.gift(p.giftCode)))) {
    // M22 US14 (FR-044, G-M22-9): cancelled (the old UPDATE … WHERE cancelled_at IS NULL — claimed or not).
    t.update('main', K.gift(p.giftCode), { update: 'SET cancelledAt = if_not_exists(cancelledAt, :now)', values: { ':now': iso(now) } });
  }
  if (p.earnKey) {
    const earn = await get(store, 'main', keyOf(p.earnKey));
    // Finding 3 kept: a refunded tip's row was deleted, so it never shows as "refunded" in the Studio.
    if (earn?.['kind'] === 'tip') t.delete('main', keyOf(p.earnKey));
    else if (earn) t.update('main', keyOf(p.earnKey), { update: 'SET refunded = :y', values: { ':y': true } });
  }
  await t.commit();
  await mirror(store, db, { purchases: [key], listeners: [...listeners], ...(tip ? { tips: [tip] } : {}), ...(p.giftCode ? { gifts: [p.giftCode] } : {}) });
  return 'withdrawn';
}

/** Purchases not yet acknowledged (the first try failed): try again, oldest first (G4 `Q#ack-due`, a job read). */
export async function acknowledgeDue(store: Store, db: Db, play: GooglePlay): Promise<{ done: number; failed: number }> {
  const cut = iso(nowMs(store) - 10 * 60_000);
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK < :c', ExpressionAttributeValues: { ':q': 'Q#ack-due', ':c': cut },
  }, { max: 50 });
  let done = 0;
  let failed = 0;
  for (const r of items as PurchaseItem[]) {
    if (!ackDue(r)) continue; // the index lags a change
    try {
      await play.acknowledge(kindOf(r.productId) === 'plus' ? 'subscription' : 'product', r.productId, String(r.purchaseToken));
      await upd(store, 'main', keyOf(r), { update: 'SET acknowledgedAt = :now REMOVE G4PK, G4SK', condition: 'attribute_exists(PK)', values: { ':now': iso(nowMs(store)) } });
      await mirror(store, db, { purchases: [keyOf(r)] });
      done++;
    } catch {
      failed++;
    }
  }
  return { done, failed };
}

// ---- PLUS (fix F-S) ----

export async function rechainCodes(store: Store, db: Db, listenerId: string): Promise<number> {
  const moved = await withRetry(async () => {
    const st = await readPlus(store, listenerId);
    const now = nowMs(store);
    const m = rechain(st.rows, now);
    if (m.length === 0) return 0;
    const t = txa(store);
    putRows(t, m);
    bumpPlus(t, listenerId, st, applyRows(st.rows, m), await zoneOf(store, listenerId), now);
    await t.commit();
    return m.length;
  }, { tries: 5, retryOn: retryable('plusv') });
  if (moved > 0) await mirror(store, db, { listeners: [listenerId] });
  return moved;
}

const plusRows = (store: Store, listenerId: string) => entitlementsOf(store, listenerId, K.PD_SK.plus);

export async function plusUntil(store: Store, _db: Db, listenerId: string): Promise<{ active: boolean; until: string | null }> {
  const now = nowMs(store);
  const rows = (await plusRows(store, listenerId)).filter((r) => notEnded(r, now));
  const run = plusRun(rows.map((r) => ({ start: r.startsAt ? Date.parse(r.startsAt) : null, end: r.until ? Date.parse(r.until) : null })), now);
  return { active: run.active, until: run.until === null ? null : iso(run.until) };
}

export async function hasPlus(store: Store, _db: Db, listenerId: string): Promise<boolean> {
  const now = nowMs(store);
  return (await plusRows(store, listenerId)).some((r) => liveNow(r, now));
}

/** Admin (M24 US5): PLUS for `days` from now under `ref`, no purchase — with the codes it pushes later, in one transaction. */
export async function grantPlusByAdmin(store: Store, db: Db, listenerId: string, ref: string, days: number): Promise<void> {
  await withRetry(async () => {
    const t = txa(store);
    const cur = (await plusRows(store, listenerId)).find((r) => r.ref === ref);
    await plusChange(store, t, listenerId, { ref, until: iso(nowMs(store) + days * DAY_MS), sourcePurchaseId: cur?.sourcePurchaseId ?? null });
    await t.commit();
  }, { tries: 5, retryOn: retryable('plusv') });
  await mirror(store, db, { listeners: [listenerId] });
}

/** Admin: every PLUS row goes, bought or given (the digest queue entry with them). */
export async function revokeAllPlus(store: Store, db: Db, listenerId: string): Promise<Record<string, unknown>[]> {
  await withRetry(async () => {
    const st = await readPlus(store, listenerId);
    const t = txa(store);
    for (const r of st.rows) t.delete('main', keyOf(r));
    bumpPlus(t, listenerId, st, [], await zoneOf(store, listenerId), nowMs(store));
    await t.commit();
  }, { tries: 5, retryOn: retryable('plusv') });
  await mirror(store, db, { listeners: [listenerId] });
  return [];
}

export async function plusEntitlements(store: Store, _db: Db, listenerId: string): Promise<{ ref: string; until: string | null; source_purchase_id: string | null }[]> {
  const rows = await plusRows(store, listenerId);
  // ORDER BY until DESC NULLS FIRST
  rows.sort((a, b) => (a.until ? Date.parse(a.until) : Infinity) < (b.until ? Date.parse(b.until) : Infinity) ? 1 : -1);
  return rows.map((r) => ({ ref: r.ref, until: r.until ?? null, source_purchase_id: r.sourcePurchaseId ?? null }));
}

/**
 * AC-T07 (PLUS half): the weekly digest's candidates at `now` — listeners on `Q#plus#<tz>` for each zone where it is
 * Monday 12:xx now, whose PLUS holds now (the old `EXISTS … PLUS_LIVE_SQL`). Zones not due are never read.
 */
export async function plusMembersDue(store: Store, _db: Db, now: Date): Promise<string[]> {
  const zones = (await get(store, 'main', K.plusZones()))?.['zones'] as Set<string> | undefined;
  const due = [...(zones ?? [])].filter((z) => validTz(z) && (() => { const c = localClock(now, z); return c.weekday === 1 && c.hour === 12; })());
  const at = nowMs(store);
  const out: string[] = [];
  for (const z of due.sort()) {
    const { items } = await queryAll(store, 'main', {
      IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK > :now', ExpressionAttributeValues: { ':q': `Q#plus#${z}`, ':now': iso(at) },
    });
    for (const it of items) {
      const id = String(it['listenerId']);
      if (await hasPlus(store, _db, id)) out.push(id);
    }
  }
  return out;
}

/** The listener changed time zone: their `Q#plus#<tz>` entry moves with them (called by the account lane's setTz). */
export async function plusQueueRetz(store: Store, listenerId: string, tz: string): Promise<void> {
  const zone = validTz(tz) ? tz : DEFAULT_TZ;
  await withRetry(async () => {
    const pv = await get(store, 'main', K.plusVersion(listenerId));
    if (!pv || pv['tz'] === zone) return;
    await addZone(store, zone);
    const sk = pv['G4SK'];
    await upd(store, 'main', K.plusVersion(listenerId), {
      update: sk ? 'SET tz = :tz, v = :nv, G4PK = :q' : 'SET tz = :tz, v = :nv',
      condition: 'v = :seen', values: { ':tz': zone, ':nv': Number(pv['v']) + 1, ':seen': Number(pv['v']), ...(sk ? { ':q': `Q#plus#${zone}` } : {}) },
    });
  }, { tries: 5, retryOn: (e) => isConflict(e) || (e as { name?: string })?.name === 'ConditionalCheckFailedException' });
}

// ---- the wallet and admin reads (PD-40 … PD-42) ----

const purchaseRow = (p: PurchaseItem): PurchaseListRow & MoneyRow => ({
  id: p.id, store: p.store, product_id: p.productId, status: p.status, expires_at: p.expiresAt ?? null,
  amount_micros: p.amountMicros ?? null, currency: p.currency ?? null, created_at: p.createdAt,
});

export async function listPurchaseRows(store: Store, _db: Db, listenerId: string): Promise<PurchaseListRow[]> {
  return (await purchasesOfListener(store, listenerId, 200)).map(purchaseRow);
}

export async function purchasesOf(store: Store, _db: Db, listenerId: string): Promise<MoneyRow[]> {
  return (await purchasesOfListener(store, listenerId, 100)).map(purchaseRow);
}

export async function listEntitlementRows(store: Store, _db: Db, listenerId: string): Promise<EntitlementListRow[]> {
  const rows = await entitlementsOf(store, listenerId);
  rows.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  return rows.map((e) => ({ kind: e.kind, ref: e.ref, starts_at: e.startsAt ?? null, until: e.until ?? null }));
}

async function tipsOf(store: Store, listenerId: string, limit: number): Promise<Item[]> {
  return (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': K.PD_SK.tips },
    ScanIndexForward: false, ConsistentRead: true,
  }, { max: limit })).items;
}

export async function listTipRows(store: Store, _db: Db, listenerId: string): Promise<TipListRow[]> {
  const titles = new Map<string, string | null>();
  const out: TipListRow[] = [];
  for (const t of await tipsOf(store, listenerId, 200)) {
    const feed = String(t['toFeedUrl']);
    if (!titles.has(feed)) titles.set(feed, (await showNewest(store, feed)).title);
    out.push({ id: String(t['id']), to_feed_url: feed, created_at: String(t['createdAt']), amount_micros: (t['amountMicros'] as number | null | undefined) ?? null, currency: (t['currency'] as string | null | undefined) ?? null, show_title: titles.get(feed) ?? null });
  }
  return out;
}

export async function tipsSentBy(store: Store, _db: Db, listenerId: string): Promise<TipAdminRow[]> {
  const tips = await tipsOf(store, listenerId, 100);
  const ps = await batchGetAll(store, 'main', [...new Set(tips.map((t) => String(t['purchasePK'])))].map((pk) => ({ PK: pk, SK: 'P' })));
  const status = new Map(ps.map((p) => [String(p['id']), String(p['status'])]));
  return tips.map((t) => ({ id: String(t['id']), to_feed_url: String(t['toFeedUrl']), created_at: String(t['createdAt']), status: status.get(String(t['purchaseId'])) ?? 'active' }));
}

export async function giftsOf(store: Store, _db: Db, listenerId: string): Promise<GiftAdminRow[]> {
  const ptrs = (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :a AND :b', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':a': 'GIFTB#', ':b': 'GIFTC#~' }, ConsistentRead: true,
  })).items;
  const gifts = await batchGetAll(store, 'main', [...new Set(ptrs.map((p) => String(p['code'])))].map((c) => K.gift(c)));
  return gifts
    .map((g) => ({ id: String(g['id']), feed_url: String(g['feedUrl']), bought: g['buyerId'] === listenerId, claimed_at: (g['claimedAt'] as string | undefined) ?? null, cancelled_at: (g['cancelledAt'] as string | undefined) ?? null, created_at: String(g['createdAt']) }))
    .filter((g, i) => g.bought || gifts[i]?.['claimedBy'] === listenerId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, 100);
}

// ---- the refund check's cache row (lane LB's cache) ----

const VOIDED = 'billing:voided';

export async function lastVoidedCheckRows(store: Store, _db: Db): Promise<{ fetched_at: string }[]> {
  const row = await readEntry(store, VOIDED);
  return row ? [{ fetched_at: row.fetchedAt }] : [];
}

export async function saveVoidedCheck(store: Store, _db: Db, v: unknown): Promise<void> {
  await writeEntry(store, VOIDED, v, nowMs(store));
}

// ---- data export (AC-T08's paid sections) and account deletion (AC-T09's paid phase) ----

/** The four export sections as the old `SELECT *` rows (snake_case; the export drops token/hash columns itself). */
export async function exportPaidRows(store: Store, _db: Db, listenerId: string): Promise<Record<string, Record<string, unknown>[]>> {
  const ps = (await purchasesOfListener(store, listenerId)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const tips = await tipsOf(store, listenerId, 10_000);
  const ptrs = (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': K.PD_SK.giftsBought }, ConsistentRead: true,
  })).items;
  const gifts = await batchGetAll(store, 'main', ptrs.map((p) => K.gift(String(p['code']))));
  return {
    purchases: ps.map((p) => ({
      id: p.id, listener_id: p.listenerId, store: p.store, product_id: p.productId, store_txn_id: p.storeTxnId, status: p.status, expires_at: p.expiresAt ?? null,
      amount_micros: p.amountMicros ?? null, currency: p.currency ?? null, created_at: p.createdAt, purchase_token: p.purchaseToken ?? null, ref: p.ref ?? null,
      acknowledged_at: p.acknowledgedAt ?? null, voided_at: p.voidedAt ?? null, account_hash: p.accountHash ?? null, test: p.test,
    })),
    entitlements: (await entitlementsOf(store, listenerId)).map((e) => ({ listener_id: e.listenerId, kind: e.kind, ref: e.ref, until: e.until ?? null, source_purchase_id: e.sourcePurchaseId ?? null, starts_at: e.startsAt ?? null })),
    tips: tips.map((t) => ({ id: t['id'], from_listener: t['fromListener'], to_feed_url: t['toFeedUrl'], purchase_id: t['purchaseId'], created_at: t['createdAt'] })),
    giftsBought: gifts.map((g) => ({
      id: g['id'], code: g['code'], buyer_id: g['buyerId'], feed_url: g['feedUrl'], purchase_id: g['purchaseId'], claimed_by: g['claimedBy'] ?? null,
      claimed_at: g['claimedAt'] ?? null, cancelled_at: g['cancelledAt'] ?? null, created_at: g['createdAt'],
    })),
  };
}

/**
 * The deletion job's `paid` phase (the old cascades from listeners → purchases → entitlements/tips/gifts, and
 * gifts.claimed_by SET NULL). One step = up to 25 of the listener's purchases, each removed in one transaction with
 * its order-id item, earning, gift (+ the claimer's pointer and the entitlement the gift gave — it cascaded from the
 * purchase); then the gifts this listener claimed lose their claimer. Items in `L#<id>` go in the job's `partition`
 * phase. Returns true when nothing is left to do. Idempotent: a crashed step is simply run again.
 */
export async function deletePaidStep(store: Store, listenerId: string): Promise<boolean> {
  const ptrs = (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': K.PD_SK.purchases }, ConsistentRead: true,
  }, { max: 25 })).items;
  for (const ptr of ptrs) {
    const p = (await get(store, 'main', { PK: String(ptr['purchasePK']), SK: 'P' })) as PurchaseItem | undefined;
    const t = txa(store);
    if (p) {
      t.delete('main', keyOf(p));
      t.delete('main', K.U.txn(p.storeTxnId), { condition: 'attribute_not_exists(PK) OR #o = :id', names: { '#o': 'owner' }, values: { ':id': p.id } });
      if (p.earnKey) t.delete('main', keyOf(p.earnKey));
      for (const gk of p.granted ?? []) {
        if (gk.PK === K.L(listenerId)) continue; // the listener's own rows go with the partition
        const e = await get(store, 'main', keyOf(gk));
        if (e && e['sourcePurchaseId'] === p.id) t.delete('main', keyOf(gk), { condition: 'sourcePurchaseId = :pid', values: { ':pid': p.id } });
      }
      if (p.giftCode) {
        const g = await get(store, 'main', K.gift(p.giftCode));
        t.delete('main', K.gift(p.giftCode));
        if (g?.['claimedBy']) t.delete('main', K.giftClaimed(String(g['claimedBy']), p.giftCode));
      }
    }
    t.delete('main', keyOf(ptr));
    await t.commit();
  }
  if (ptrs.length > 0) return false;
  const claimed = (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)', ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': K.PD_SK.giftsClaimed }, ConsistentRead: true,
  }, { max: 25 })).items;
  for (const c of claimed) {
    await unlessCondition(upd(store, 'main', K.gift(String(c['code'])), { update: 'REMOVE claimedBy', condition: 'claimedBy = :me', values: { ':me': listenerId } }));
    await txa(store).delete('main', keyOf(c)).commit();
  }
  return claimed.length === 0;
}
