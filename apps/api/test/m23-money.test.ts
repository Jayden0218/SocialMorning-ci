// Tests M23 money and deletion: refunds all-or-nothing, clean placeholders, purchase account hash, the error log.
/**
 * M23 (specs/024-m23-hardening). Guards and the break that turns each red:
 * - G-M23-5 (US4): a refund that fails halfway leaves the purchase un-voided and its
 *   entitlement in place; the next run withdraws it whole.
 *   Break: in applyVoided (db/repos/account/purchases.ts) run the statements on `db`, not in
 *   `db.transaction`.
 * - G-M23-6 (US4): an account's comment placeholders keep no words, transcript, voice, picture
 *   or country — exactly like deleting one comment.
 *   Break: drop `country = NULL` or `transcript = NULL` from placeholderComments
 *   (db/repos/social/comments.ts).
 * - US4 account hash: a Google purchase carrying another account's hash is refused.
 *   Break: remove the `given !== mine` check in checkAccount.
 * - US8 error log: POST /v1/errors counts repeats, caps a batch at 20 and a stack at 2 KB;
 *   /mod/errors is the owner's only; sweepErrorReports deletes rows unseen for 30 days.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { addErrorLogRow, ageErrorLog, entitlementRows, errorLogRows, purchaseByToken, purchaseRows, seedEntitlement, seedPurchase } from './pd-neutral.ts';
import type { Db } from '../src/db/db.ts';
import { putEpisode } from './put-episode.ts';
import { seedComment } from './sc-neutral.ts';
import { applyVoided, accountHashOf } from '../src/db/repos/account/purchases.ts';
import { deleteAccount } from '../src/db/repos/account/delete-account.ts';
import { deleteComment } from '../src/db/repos/social/comments.ts';
import { sweepErrorReports } from '../src/db/repos/account/error-reports.ts';
import type { GooglePlay, GoogleSubscription } from '../src/billing/google-play.ts';

async function purchaseWithEntitlement(t: TestDb, listenerId: string, token: string): Promise<string> {
  const id = await seedPurchase(t, { listenerId, store: 'google', productId: 'show_tier_1', orderId: token, purchaseToken: token });
  await seedEntitlement(t, { listenerId, kind: 'show', ref: 'https://feeds.example.com/paid.xml', until: null, sourcePurchaseId: id });
  return id;
}

/**
 * Makes the refund's later step fail. Postgres: the `tips` table is renamed away. DynamoDB (M26 lane PD): every
 * transaction touching the buyer's partition (the entitlement delete) fails — the same "fails halfway" for a refund
 * that is now ONE TransactWriteItems. Returns the Db to refund with and how to undo the break.
 */
async function breakRefund(t: TestDb, listenerId: string): Promise<{ db: Db; restore: () => Promise<void> }> {
  if (t.store) {
    const { withStore } = await import('../src/db/backend-ddb.ts');
    const { withFaults } = await import('../src/db/ddb/test-wrappers.ts');
    return { db: withStore(t.db, withFaults(t.store, [{ command: 'TransactWriteCommand', prefix: `L#${listenerId}` }])), restore: async () => undefined };
  }
  await t.q('ALTER TABLE tips RENAME TO tips_away'); // the tips step now fails
  return { db: t.db, restore: async () => { await t.q('ALTER TABLE tips_away RENAME TO tips'); } };
}

test('G-M23-5: a refund that fails halfway records nothing; the next run withdraws it whole', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  await purchaseWithEntitlement(t, a.id, 'tok-1');
  const broken = await breakRefund(t, a.id);
  const first = await applyVoided(broken.db, [{ purchaseToken: 'tok-1', voidedAt: Date.now() }]);
  assert.deepEqual(first, { withdrawn: 0, unknown: 0, failed: 1 });
  const p = await purchaseByToken(t, 'tok-1');
  assert.equal(p!.status, 'active', 'not marked refunded');
  assert.equal(p!.voided_at, null);
  assert.equal((await entitlementRows(t, { listenerId: a.id })).length, 1, 'the entitlement is still there');

  await broken.restore();
  assert.deepEqual(await applyVoided(t.db, [{ purchaseToken: 'tok-1', voidedAt: Date.now() }]), { withdrawn: 1, unknown: 0 });
  assert.equal((await entitlementRows(t, { listenerId: a.id })).length, 0);
  assert.equal((await purchaseByToken(t, 'tok-1'))!.status, 'refunded');
  await t.close();
});

const ep = { feedUrl: 'https://feeds.example.com/del.xml', guid: 'g1', title: 'Ep', enclosureUrl: 'https://cdn.example.com/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const FULL = `body, transcript, country, voice_url, voice_path, voice_ms, image_url, image_path, image_w, image_h, image_bytes`;

// M26 lane SC: through sc-neutral, so the comment exists wherever the comment lane runs (DynamoDB + its Postgres bridge row).
async function heavyComment(t: TestDb, authorId: string): Promise<string> {
  return seedComment(t, {
    episodeId: `${EP}`, authorId, body: 'words', country: 'MY',
    voice: { url: 'https://blob.example/v.m4a', path: 'v.m4a', ms: 3000, transcript: 'spoken words' },
    image: { url: 'https://blob.example/i.jpg', path: 'i.jpg', w: 10, h: 10, bytes: 100 },
  });
}
const reply = (t: TestDb, parentId: string, authorId: string) => seedComment(t, { episodeId: `${EP}`, authorId, body: 'a reply', parentId });

test('G-M23-6: account deletion leaves the same empty placeholders as deleting one comment, in set-based statements', async () => {
  const t = await freshDb();
  await putEpisode(t, EP, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bo');
  // One comment deleted on its own, two removed with the account; each has a reply by b.
  const single = await heavyComment(t, a.id);
  await reply(t, single, b.id);
  await deleteComment(t.db, single);
  const kept = [await heavyComment(t, a.id), await heavyComment(t, a.id)];
  for (const id of kept) await reply(t, id, b.id);
  const lonely = await heavyComment(t, a.id); // no replies → deleted
  const r = await deleteAccount(t.db, a.id);
  assert.equal(r.placeholders, 2);
  assert.equal(r.deleted, 1);
  assert.equal((await t.q('SELECT 1 FROM comments WHERE id = $1', [lonely])).length, 0);
  const rows = await t.q<Record<string, unknown>>(`SELECT id, author_id, deleted_at, ${FULL} FROM comments WHERE id = ANY($1::uuid[])`, [[single, ...kept]]);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row['author_id'], null);
    assert.ok(row['deleted_at'], 'marked deleted');
    for (const col of FULL.split(', ')) assert.equal(row[col], null, `${col} is empty on ${row['id'] === single ? 'the single delete' : 'an account placeholder'}`);
  }
  assert.equal((await t.q("SELECT 1 FROM comments WHERE body = 'a reply'")).length, 3, 'the replies stay');
  await t.close();
});

function fakePlay(sub: Partial<GoogleSubscription>): GooglePlay {
  return {
    ready: true,
    subscription: async () => ({ state: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: true, productId: 'plus_monthly', expiresAt: '2099-01-01T00:00:00.000Z', orderId: `GPA.${Math.random()}`, profileId: null, test: true, ...sub }),
    product: async () => ({ purchaseState: 0, acknowledged: true, orderId: 'GPA.x', profileId: null, test: true }),
    acknowledge: async () => {},
    voided: async () => [],
  };
}

test('US4: a Google purchase is tied to its account — another account\'s hash is refused; no hash (older build) is accepted', async () => {
  const other = await (async () => { const t = await freshDb(); const o = await signUp(t, 'o@example.com', 'O'); await t.close(); return o.id; })();
  for (const [given, want] of [['theirs', 409], ['mine', 200], ['none', 200]] as const) {
    let mineId = '';
    const play: GooglePlay = {
      ...fakePlay({}),
      subscription: async () => (await fakePlay({ accountId: given === 'theirs' ? accountHashOf(other) : given === 'mine' ? accountHashOf(mineId) : null }).subscription('')),
    };
    const t = await freshDb({ play });
    const a = await signUp(t, 'a@example.com', 'Al');
    mineId = a.id;
    const r = await t.call('POST', '/v1/me/purchases/google', { productId: 'plus_monthly', purchaseToken: `tok-${given}` }, a.token);
    assert.equal(r.status, want, given);
    if (want === 200) {
      const [row] = await purchaseRows(t);
      assert.equal(row!.account_hash, given === 'mine' ? accountHashOf(a.id) : null);
    } else {
      assert.equal((await entitlementRows(t)).length, 0, 'nothing granted');
    }
    await t.close();
  }
});

async function ownerCookie(t: TestDb, email: string): Promise<string> {
  const r = await t.app.request('/mod/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email, password: 'correct horse' }).toString(), redirect: 'manual' });
  const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
  // M25 SB: then the code emailed to the owner (the /mod second factor).
  await t.app.request('/mod/code', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams({ code: t.lastCode!(email) }).toString(), redirect: 'manual' });
  return cookie;
}

test('US8: the error log — repeats count up, 20 a batch, stacks cut to 2 KB, owner-only page, 30-day sweep', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const one = { scope: 'player', message: 'Load timed out', stack: 'x'.repeat(5000), appVersion: '1.2.0', platform: 'android' };
  assert.equal((await t.call('POST', '/v1/errors', { reports: [one, one] })).status, 202, 'signed out is fine');
  assert.equal((await t.call('POST', '/v1/errors', { reports: [one] }, a.token)).status, 202);
  const [row] = await errorLogRows(t);
  assert.equal(row!.count, 3);
  assert.equal(row!.stack!.length, 2048);
  assert.equal(row!.listener_id, a.id);
  const many = Array.from({ length: 21 }, (_, i) => ({ scope: 's', message: `m${i}` }));
  assert.equal((await t.call('POST', '/v1/errors', { reports: many })).status, 422);
  assert.equal((await t.call('POST', '/v1/errors', { reports: [{ scope: '', message: 'x' }] })).status, 422);

  // Per address: 60 batches an hour.
  for (let i = 0; i < 60; i++) await t.call('POST', '/v1/errors', { reports: [] }, undefined, { 'x-forwarded-for': '203.0.113.9' });
  assert.equal((await t.call('POST', '/v1/errors', { reports: [] }, undefined, { 'x-forwarded-for': '203.0.113.9' })).status, 429);

  assert.equal((await t.app.request('/mod/errors')).status, 403, 'no cookie');
  const cookie = await ownerCookie(t, 'o@example.com');
  const page = await t.app.request('/mod/errors', { headers: { cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Load timed out/);
  assert.match(html, /android/);
  assert.ok(!html.includes('a@example.com') && !html.includes('Al<'), 'no listener named');

  await ageErrorLog(t, 31);
  await addErrorLogRow(t, 'fresh', 'stays');
  assert.equal(await sweepErrorReports(t.db), 1);
  assert.deepEqual((await errorLogRows(t)).map((r) => r.scope), ['fresh']);
  await t.close();
});
