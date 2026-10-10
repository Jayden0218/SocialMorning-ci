// Guards of the paid lane on DynamoDB: one grant per purchase token under a race, refunds that remove only their own days, a redeem code never over-used, the PLUS digest queue.
/**
 * M26 lane PD (tasks.md PD-T07). Each guard was broken on mirror branch `lane-pd-red`, seen red, restored:
 * - G-M26-PD1 — ten notices of ONE purchase token racing grant once: one tip, one purchase, one `U#TXN`, nine
 *   answers `repeated`; and a notice whose first look predates the first commit (no overlap, so no transaction
 *   conflict helps) is answered `repeated` too. Break: in src/db/repos/account/paid-ddb/purchases.ts `create`, drop
 *   the purchase Put's `attribute_not_exists(PK)` condition and the `claimUnique(… U.txn …)` line → no `U#TXN`, and the
 *   late notice makes a third tip.
 * - G-M26-PD2 — a refund after a PLUS renewal by ANOTHER purchase removes only what that purchase still owns: the
 *   store row (now the renewal's) stays, the redeem code's days stay; refunding the renewal then removes the store
 *   row and the code keeps its own 30 days. Break: in `refundOne`, drop the `e.sourcePurchaseId !== p.id` skip and
 *   the delete's condition → the first refund takes the renewal's PLUS away.
 * - G-M26-PD3 — a 1-use code redeemed by two listeners at the same moment is redeemed once; a 10-use code raced by
 *   50 listeners is redeemed exactly 10 times. Break: in paid-ddb/redeem.ts `redeemCode`, drop `uses < maxUses AND`
 *   from the code's condition → both / all 50 succeed.
 * - G-M26-PD4 (lane's pick, AC-T07) — the weekly digest's PLUS queue: a PLUS purchase puts the member on
 *   `Q#plus#<their zone>`, a time-zone change moves them, the refund takes them off, and the digest step reads only
 *   zones where it is Monday noon. Break: in paid-ddb/common.ts `bumpPlus`, always REMOVE the queue keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb paid guards (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp } = await import('./harness.ts');
  const { fnv1a64 } = await import('@socialmorning/social-core');
  const K = await import('../src/db/ddb/keys.ts');
  const { get } = await import('../src/db/ddb/store.ts');
  const { grantGoogle, applyVoided, plusUntil, plusMembersDue } = await import('../src/db/repos/account/purchases.ts');
  const { createCodes, redeemCode } = await import('../src/db/repos/account/redeem.ts');
  const { claimGift } = await import('../src/db/repos/account/gifts.ts');
  const { setTz } = await import('../src/db/repos/account/digest.ts');
  const { deleteAccount } = await import('../src/db/repos/account/delete-account.ts');
  const { acScan } = await import('./fixtures.ts');
  type GooglePlay = import('../src/billing/google-play.ts').GooglePlay;

  const FEED = 'https://socialmorning-api.vercel.app/feeds/hosted.xml';
  const DAY = 86_400_000;
  const days = (iso: string | null) => (Date.parse(iso!) - Date.now()) / DAY;

  function fakePlay(state: { expiresAt: string } = { expiresAt: '2099-01-01T00:00:00.000Z' }): GooglePlay {
    return {
      ready: true,
      subscription: async (token) => ({ state: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: true, productId: 'plus_monthly', expiresAt: state.expiresAt, orderId: `GPA.${token}`, profileId: null, test: true }),
      product: async (_p, token) => ({ purchaseState: 0, acknowledged: true, orderId: `GPA.${token}`, profileId: fnv1a64(FEED), test: true }),
      acknowledge: async () => {},
      voided: async () => [],
    };
  }

  test('G-M26-PD1: ten notices of one purchase token racing grant once', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'tipper@example.com', 'Tipper');
    await t.q('INSERT INTO show_overrides (feed_url, tips_enabled) VALUES ($1, true)', [FEED]);
    const play = fakePlay();
    // Bridge off: this guard checks the DynamoDB items (Postgres's own unique index would otherwise stop the mirror).
    const { withStore } = await import('../src/db/backend-ddb.ts');
    const db = withStore(t.db, t.store!, { bridge: false });
    const out = await Promise.all(Array.from({ length: 10 }, () =>
      grantGoogle(db, play, { listenerId: a.id, productId: 'tip_small', purchaseToken: 'tok-race', feedUrl: FEED, allowTest: true })));
    assert.equal(new Set(out.map((o) => o.purchaseId)).size, 1, 'one purchase id for every answer');
    assert.equal(out.filter((o) => !o.repeated).length, 1, 'exactly one notice granted');
    assert.equal((await acScan(t.store!, 'main', 'tip')).length, 1, 'one tip, not ten');
    assert.equal((await acScan(t.store!, 'main', 'purchase')).length, 1);

    // The same race without overlapping transactions: a second notice whose first look happened BEFORE the first one
    // committed (its read of PUR# answers "none"), but whose write comes after. Only the conditional Put stops it.
    const { wrapStore } = await import('../src/db/ddb/store.ts');
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
    await grantGoogle(db, play, { listenerId: a.id, productId: 'tip_small', purchaseToken: 'tok-late', feedUrl: FEED, allowTest: true });
    let hidden = false;
    const stale = wrapStore(t.store!, async (cmd, next) => {
      const k = (cmd.input as { Key?: { PK?: string } }).Key;
      if (!hidden && cmd instanceof GetCommand && String(k?.PK).startsWith('PUR#')) { hidden = true; return {}; }
      return next(cmd);
    });
    const late = await grantGoogle(withStore(t.db, stale, { bridge: false }), play, { listenerId: a.id, productId: 'tip_small', purchaseToken: 'tok-late', feedUrl: FEED, allowTest: true });
    assert.equal(hidden, true, 'the stale first look happened');
    assert.equal(late.repeated, true, 'the late notice is answered as a repeat');
    assert.equal((await acScan(t.store!, 'main', 'tip')).length, 2, 'two tokens, two tips — never a third');
    assert.equal((await acScan(t.store!, 'main', 'unique')).filter((u) => String(u['PK']).startsWith('U#TXN#')).length, 2, 'one order-id item per purchase');
    await t.close();
  });

  test('G-M26-PD2: a refund after a PLUS renewal removes only that purchase\'s days; redeem days survive', async () => {
    const state = { expiresAt: new Date(Date.now() + 30 * DAY).toISOString() };
    const t = await freshDb();
    const play = fakePlay(state);
    const a = await signUp(t, 'plus@example.com', 'Plus');
    await grantGoogle(t.db, play, { listenerId: a.id, productId: 'plus_monthly', purchaseToken: 'tok-old', allowTest: true });
    const [code] = await createCodes(t.db, { grant: { kind: 'plus', days: 30 }, count: 1, maxUses: 1, note: '', expiresAt: null, createdBy: a.id });
    const g = await redeemCode(t.db, code!, a.id);
    assert.equal(g.kind === 'plus' && g.startsAt, state.expiresAt, 'the code waits after the store period');
    // The renewal comes as a NEW purchase (a new token): the store row is now its, 60 days; the code moves after it.
    state.expiresAt = new Date(Date.now() + 60 * DAY).toISOString();
    await grantGoogle(t.db, play, { listenerId: a.id, productId: 'plus_monthly', purchaseToken: 'tok-new', allowTest: true });
    assert.ok(Math.abs(days((await plusUntil(t.db, a.id)).until) - 90) < 0.1, 'store 60 + code 30');

    // Refund the OLD purchase: it owns nothing any more — the renewal's days and the code's days stay.
    assert.equal((await applyVoided(t.db, [{ purchaseToken: 'tok-old', voidedAt: Date.now() }])).withdrawn, 1);
    const after = await plusUntil(t.db, a.id);
    assert.equal(after.active, true, 'PLUS still on');
    assert.ok(Math.abs(days(after.until) - 90) < 0.1, `still 90 days, got ${days(after.until)}`);

    // Refund the renewal: its store row goes; the code keeps its own 30 days (a gap before them, as fix F-S says).
    assert.equal((await applyVoided(t.db, [{ purchaseToken: 'tok-new', voidedAt: Date.now() }])).withdrawn, 1);
    const rows = (await acScan(t.store!, 'main', 'entitlement')).filter((e) => e['listenerId'] === a.id);
    assert.deepEqual(rows.map((r) => r['ref']), [`code:${code}`], 'only the code row is left');
    assert.equal(Math.round((Date.parse(String(rows[0]!['until'])) - Date.parse(String(rows[0]!['startsAt']))) / DAY), 30);
    assert.deepEqual(await plusUntil(t.db, a.id), { active: false, until: null }, 'nothing now, the code starts later');
    await t.close();
  });

  test('G-M26-PD3: a code raced by many listeners is redeemed no more times than it allows', async () => {
    const t = await freshDb();
    const owner = await signUp(t, 'owner@example.com', 'Owner');
    const people = await Promise.all(Array.from({ length: 50 }, (_, i) => signUp(t, `p${i}@example.com`, `P${i}`)));
    // Two listeners, one use.
    const [one] = await createCodes(t.db, { grant: { kind: 'plus', days: 7 }, count: 1, maxUses: 1, note: '', expiresAt: null, createdBy: owner.id });
    const pair = await Promise.allSettled(people.slice(0, 2).map((p) => redeemCode(t.db, one!, p.id)));
    assert.equal(pair.filter((r) => r.status === 'fulfilled').length, 1, 'redeemed once');
    const refused = pair.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal((refused.reason as { code?: string }).code, 'cancelled', 'the other is told it is used up');
    // Fifty listeners, ten uses.
    const [ten] = await createCodes(t.db, { grant: { kind: 'plus', days: 7 }, count: 1, maxUses: 10, note: '', expiresAt: null, createdBy: owner.id });
    const all = await Promise.allSettled(people.map((p) => redeemCode(t.db, ten!, p.id)));
    assert.equal(all.filter((r) => r.status === 'fulfilled').length, 10, 'ten redeems, not more');
    const { codeHashOf } = await import('../src/db/repos/account/redeem.ts');
    const item = await get(t.store!, 'main', K.redeemCode(codeHashOf(ten!).toString('hex')));
    assert.equal(item?.['uses'], 10);
    assert.equal((await acScan(t.store!, 'main', 'redeemUse')).filter((u) => u['code'] === ten).length, 10, 'ten use markers');
    await t.close();
  });

  test('G-M26-PD4: PLUS puts a member on Q#plus#<zone>; a zone change moves them, a refund takes them off; only due zones are read', async () => {
    const MONDAY_NOON_UTC = new Date('2026-10-05T12:30:00Z');
    const MONDAY_NOON_KL = new Date('2026-10-05T04:30:00Z');
    const t = await freshDb();
    const a = await signUp(t, 'digest@example.com', 'Digest');
    await grantGoogle(t.db, fakePlay(), { listenerId: a.id, productId: 'plus_monthly', purchaseToken: 'tok-q', allowTest: true });
    const queue = async () => (await get(t.store!, 'main', K.plusVersion(a.id)))?.['G4PK'];
    assert.equal(await queue(), 'Q#plus#Asia/Kuala_Lumpur', 'no zone set: the default zone');
    assert.deepEqual(await plusMembersDue(t.db, MONDAY_NOON_KL), [a.id]);
    assert.deepEqual(await plusMembersDue(t.db, MONDAY_NOON_UTC), [], 'not noon in Kuala Lumpur');
    await setTz(t.db, a.id, 'UTC');
    assert.equal(await queue(), 'Q#plus#UTC', 'moved with the zone');
    assert.deepEqual(await plusMembersDue(t.db, MONDAY_NOON_UTC), [a.id]);
    assert.deepEqual(await plusMembersDue(t.db, MONDAY_NOON_KL), []);
    await applyVoided(t.db, [{ purchaseToken: 'tok-q', voidedAt: Date.now() }]);
    assert.equal(await queue(), undefined, 'refunded: off the queue');
    assert.deepEqual(await plusMembersDue(t.db, MONDAY_NOON_UTC), []);
    await t.close();
  });

  test('account deletion: the listener\'s purchases, order ids, gifts and what their gift gave go; a gift they claimed loses its claimer', async () => {
    const t = await freshDb();
    const owner = await signUp(t, 'owner@example.com', 'Owner');
    await t.q('INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, 2)', [owner.id, FEED, 'Hosted']);
    const a = await signUp(t, 'gone@example.com', 'Gone');
    const b = await signUp(t, 'friend@example.com', 'Friend');
    const c = await signUp(t, 'giver@example.com', 'Giver');
    const play = fakePlay();
    const mine = await grantGoogle(t.db, play, { listenerId: a.id, productId: 'gift_tier_2', purchaseToken: 'tok-a-gift', feedUrl: FEED, allowTest: true });
    await claimGift(t.db, mine.giftCode!, b.id);
    const theirs = await grantGoogle(t.db, play, { listenerId: c.id, productId: 'gift_tier_2', purchaseToken: 'tok-c-gift', feedUrl: FEED, allowTest: true });
    await claimGift(t.db, theirs.giftCode!, a.id);
    await grantGoogle(t.db, play, { listenerId: a.id, productId: 'plus_monthly', purchaseToken: 'tok-a-plus', allowTest: true });

    await deleteAccount(t.db, a.id);
    assert.equal((await acScan(t.store!, 'main', 'purchase')).filter((p) => p['listenerId'] === a.id).length, 0, 'no purchase of the account');
    assert.deepEqual((await acScan(t.store!, 'main', 'unique')).filter((u) => String(u['PK']).startsWith('U#TXN#')).map((u) => u['PK']), ['U#TXN#GPA.tok-c-gift'], 'only the other buyer\'s order id');
    const gifts = await acScan(t.store!, 'main', 'gift');
    assert.deepEqual(gifts.map((g) => g['code']), [theirs.giftCode], 'the gift the account bought is gone');
    assert.equal(gifts[0]!['claimedBy'], undefined, 'the gift the account claimed has no claimer now');
    assert.equal((await acScan(t.store!, 'main', 'entitlement')).filter((e) => e['listenerId'] === b.id).length, 0, 'what the account\'s gift gave went with its purchase');
    assert.equal((await acScan(t.store!, 'main', 'entitlement')).filter((e) => e['listenerId'] === a.id).length, 0);
    assert.equal(await get(t.store!, 'main', K.plusVersion(a.id)), undefined, 'off the digest queue');
    await t.close();
  });
}
