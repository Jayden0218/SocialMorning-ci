// Lane PD's rows for the copy test: purchases of every kind and state, PLUS rows from three sources, tips, gifts, redeem codes and uses.
/**
 * M26 lane MIG. Plain SQL on the old database, written the way the app left it (the grant/refund/claim/redeem code in
 * repos/account/*.ts): a refund marked the purchase and deleted what it granted and its tip, and cancelled its gift;
 * a gift claim gave the claimer the show with the gift's purchase as its source; a redeem wrote its use and bumped `uses`.
 * Edge cases: an unacknowledged Google purchase (on `Q#ack-due`), a test purchase with no token (keyed by its order id,
 * no earning), a refunded tip (no tip row, no earning), a refunded unclaimed gift, an ended PLUS row next to an
 * open-ended admin row, a waiting-free code row, a legacy code with no hash and no use row, a switched-off code,
 * a listener with no time zone (default zone). Ids: 00000005-…
 */
import { createHash } from 'node:crypto';
import type { SeedBase } from './mig-seed-base.ts';

const id = (n: number) => `00000005-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const hash = (code: string) => createHash('sha256').update(code.toUpperCase(), 'utf8').digest();

export async function seed(b: SeedBase): Promise<void> {
  const { pg, L, FEEDS } = b;
  const at = (h: number) => b.ago(h);

  type P = {
    n: number; who: string; store: 'google' | 'apple'; product: string; order: string; status: 'active' | 'expired' | 'refunded'; created: number;
    token?: string | null; expires?: number | null; amount?: number | null; currency?: string | null; ref?: string | null;
    acked?: number | null; voided?: number | null; accountHash?: string | null; test?: boolean;
  };
  const purchases: P[] = [
    // PLUS, live, acknowledged, tied to the account.
    { n: 1, who: L.bea, store: 'google', product: 'plus_monthly', order: 'GPA.mig-0001', status: 'active', created: 240, token: 'mig-tok-plus-bea', expires: -480, acked: 239, accountHash: 'acct-bea' },
    // PLUS refunded: its row was deleted by the refund.
    { n: 2, who: L.cy, store: 'google', product: 'plus_monthly', order: 'GPA.mig-0002', status: 'refunded', created: 400, token: 'mig-tok-plus-cy', expires: -100, acked: 399, voided: 10 },
    // A show bought, Google not told yet (on the ack queue), with an amount.
    { n: 3, who: L.eli, store: 'google', product: 'show_tier_2', order: 'GPA.mig-0003', status: 'active', created: 30, token: 'mig-tok-show-eli', ref: FEEDS.pi, amount: 4_990_000, currency: 'USD' },
    // A gift, claimed by gus.
    { n: 4, who: L.fay, store: 'google', product: 'gift_tier_1', order: 'GPA.mig-0004', status: 'active', created: 72, token: 'mig-tok-gift-fay', ref: FEEDS.stoic, acked: 71, amount: 2_990_000, currency: 'SGD' },
    // A gift refunded before anyone claimed it: cancelled.
    { n: 5, who: L.alex, store: 'google', product: 'gift_tier_1', order: 'GPA.mig-0005', status: 'refunded', created: 150, token: 'mig-tok-gift-alex', ref: FEEDS.stoic, acked: 149, voided: 140 },
    // A tip (its tip row below).
    { n: 6, who: L.bea, store: 'google', product: 'tip_small', order: 'GPA.mig-0006', status: 'active', created: 50, token: 'mig-tok-tip-bea', ref: FEEDS.bbc, acked: 50, amount: 990_000, currency: 'MYR' },
    // A tip refunded: its tip row was deleted (finding 3).
    { n: 7, who: L.cy, store: 'google', product: 'tip_medium', order: 'GPA.mig-0007', status: 'refunded', created: 60, token: 'mig-tok-tip-cy', ref: FEEDS.bbc, acked: 60, voided: 20 },
    // A licence-tester purchase from a store without tokens (keyed by its order id): never earnings.
    { n: 8, who: L.dee, store: 'apple', product: 'show_tier_1', order: 'APL.mig-0008', status: 'active', created: 90, token: null, ref: FEEDS.daily, acked: 90, test: true },
    // An old PLUS purchase that ran out.
    { n: 9, who: L.alex, store: 'google', product: 'plus_monthly', order: 'GPA.mig-0009', status: 'expired', created: 1500, token: 'mig-tok-plus-alex', expires: 100, acked: 1500 },
    // A second tip, on another show, from an account with no hash (bought before M23).
    { n: 10, who: L.eli, store: 'google', product: 'tip_large', order: 'GPA.mig-0010', status: 'active', created: 8, token: 'mig-tok-tip-eli', ref: FEEDS.fresh, acked: 8, amount: 4_990_000, currency: 'USD' },
  ];
  for (const p of purchases) {
    await pg.query(
      `INSERT INTO purchases (id, listener_id, store, product_id, store_txn_id, status, expires_at, amount_micros, currency, created_at,
                              purchase_token, ref, acknowledged_at, voided_at, account_hash, test)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [id(p.n), p.who, p.store, p.product, p.order, p.status, p.expires == null ? null : at(p.expires), p.amount ?? null, p.currency ?? null, at(p.created),
        p.token === undefined ? null : p.token, p.ref ?? null, p.acked == null ? null : at(p.acked), p.voided == null ? null : at(p.voided), p.accountHash ?? null, p.test ?? false]);
  }

  const ent = (listenerId: string, kind: 'plus' | 'show', ref: string, until: Date | null, startsAt: Date | null, source: number | null) => pg.query(
    'INSERT INTO entitlements (listener_id, kind, ref, until, starts_at, source_purchase_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [listenerId, kind, ref, until, startsAt, source === null ? null : id(source)]);
  await ent(L.bea, 'plus', '', at(-480), null, 1); // store PLUS
  await ent(L.alex, 'plus', '', at(100), null, 9); // ended
  await ent(L.alex, 'plus', 'admin', null, null, null); // given by the admin, no end
  await ent(L.fay, 'plus', 'code:MIGPLUS30', at(-696), at(24), null); // from a code, started a day ago
  await ent(L.eli, 'show', FEEDS.pi, null, null, 3); // bought
  await ent(L.gus, 'show', FEEDS.stoic, null, null, 4); // a claimed gift (source = the gift's purchase)
  await ent(L.dee, 'show', FEEDS.daily, null, null, 8); // test purchase
  await ent(L.eli, 'show', FEEDS.upfirst, null, null, null); // from a show code

  await pg.query('INSERT INTO tips (id, from_listener, to_feed_url, purchase_id, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id(0x21), L.bea, FEEDS.bbc, id(6), at(50)]);
  await pg.query('INSERT INTO tips (id, from_listener, to_feed_url, purchase_id, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id(0x22), L.eli, FEEDS.fresh, id(10), at(8)]);

  await pg.query(
    `INSERT INTO gifts (id, code, buyer_id, feed_url, purchase_id, claimed_by, claimed_at, cancelled_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8), ($9, $10, $11, $12, $13, NULL, NULL, $14, $15)`,
    [id(0x31), 'MigGift000000001', L.fay, FEEDS.stoic, id(4), L.gus, at(20), at(72),
      id(0x32), 'MigGift000000002', L.alex, FEEDS.stoic, id(5), at(140), at(150)]);

  const code = (c: string, grants: object, o: { hashed?: boolean; maxUses: number; uses: number; note?: string; created: number; expires?: number | null; disabled?: number | null; used?: number | null; createdBy?: string | null; usedBy?: string | null }) => pg.query(
    `INSERT INTO redeem_codes (code, grants, code_hash, max_uses, uses, note, expires_at, disabled_at, created_at, used_at, created_by, used_by)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [c, JSON.stringify(grants), o.hashed === false ? null : hash(c), o.maxUses, o.uses, o.note ?? '', o.expires == null ? null : at(o.expires),
      o.disabled == null ? null : at(o.disabled), at(o.created), o.used == null ? null : at(o.used), o.createdBy ?? null, o.usedBy ?? null]);
  await code('MIGPLUS30', { kind: 'plus', days: 30 }, { maxUses: 5, uses: 1, note: 'launch week', created: 50, used: 24, createdBy: L.alex });
  await code('MIGSHOWUP1', { kind: 'show', feedUrl: FEEDS.upfirst }, { maxUses: 1, uses: 1, created: 60, expires: -100, disabled: 2, used: 30 });
  // Legacy (before 025's hash and uses): used once, no use row, long expired, its creator's id kept.
  await code('MIGLEGACY1', { kind: 'plus', days: 7 }, { hashed: false, maxUses: 1, uses: 1, created: 1800, expires: 1000, used: 1500, createdBy: L.alex, usedBy: L.hal });
  // Unused.
  await code('MIGFRESH01', { kind: 'plus', days: 14 }, { maxUses: 100, uses: 0, note: 'newsletter', created: 5, expires: -720 });

  await pg.query('INSERT INTO redeem_uses (code, listener_id, used_at) VALUES ($1, $2, $3), ($4, $5, $6)',
    ['MIGPLUS30', L.fay, at(24), 'MIGSHOWUP1', L.eli, at(30)]);
}
