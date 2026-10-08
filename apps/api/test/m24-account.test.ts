// Tests M24 lane A3: redeem codes (admin makes, phone redeems once per account) and changing the sign-in email.
/**
 * Guards (spec 025, lane A3):
 *  - G-M24-A3-1 — a code cannot be used twice by one account. Break: in `redeemCode`
 *    (src/db/repos/account/redeem.ts) change the redeem_uses INSERT to always return a row
 *    (drop `ON CONFLICT … DO NOTHING RETURNING` → e.g. `ON CONFLICT (code, listener_id) DO UPDATE SET used_at = now() RETURNING code`)
 *    → the second redeem by the same account succeeds and this test goes red.
 *  - G-M24-A3-2 — an email change needs the right code. Break: in src/routes/account/email.ts make the
 *    compare always pass → a wrong code switches the email and this test goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { aCall, adminSetup } from './admin-harness.ts';
import { normalizeCode, newRedeemCode, sameCode, parseGrant } from '../src/db/repos/account/redeem.ts';
import { maskEmail } from '../src/routes/account/email.ts';

const FEED = 'https://socialmorning-api.vercel.app/feeds/paid.xml';
type Grant = { grant: { kind: string; days?: number; until?: string | null; feedUrl?: string; title?: string | null } };
const err = async (r: Response) => ((await r.json()) as { error: string }).error;

async function phoneToken(t: TestDb, email: string): Promise<string> {
  const r = await t.call('POST', '/v1/auth/sign-in', { email, password: 'correct horse' });
  return ((await r.json()) as { token: string }).token;
}

async function makeCodes(t: TestDb, who: Parameters<typeof aCall>[3], body: Record<string, unknown>): Promise<string[]> {
  const r = await aCall(t, 'POST', '/v1/admin/redeem', who, body);
  assert.equal(r.status, 201, await r.clone().text());
  return ((await r.json()) as { codes: string[] }).codes;
}

test('codes: 12 symbols with no 0/O/1/I/L; typed with dashes, spaces or lower case still match', () => {
  for (let i = 0; i < 50; i++) assert.match(newRedeemCode(), /^[A-HJKMNP-Z2-9]{12}$/);
  assert.equal(normalizeCode('abcd-efgh jkmn'), 'ABCDEFGHJKMN');
  assert.equal(normalizeCode('ab'), undefined);
  assert.equal(normalizeCode('abc$defgh'), undefined);
  assert.equal(sameCode('ABCDEFGHJKMN', 'ABCDEFGHJKMN'), true);
  assert.equal(sameCode('ABCDEFGHJKMN', 'ABCDEFGHJKMP'), false);
  assert.equal(sameCode('ABCDEFGHJKMN', 'ABCDEFGHJKM'), false);
  assert.deepEqual(parseGrant({ kind: 'plus', days: 30 }), { kind: 'plus', days: 30 });
  assert.deepEqual(parseGrant('{"kind":"show","feedUrl":"https://x"}'), { kind: 'show', feedUrl: 'https://x' });
  assert.equal(parseGrant({ kind: 'plus', days: 0 }), undefined);
  assert.equal(parseGrant({ kind: 'money', amount: 5 }), undefined);
});

test('G-M24-A3-1: a PLUS code gives PLUS days; the same account cannot use it twice; another account can while uses remain', async () => {
  const { t, owner, other } = await adminSetup();
  const [code] = await makeCodes(t, owner, { kind: 'plus', days: 30, maxUses: 2, note: 'launch' });
  assert.ok(code);
  const tok = await phoneToken(t, 'other@example.com');
  assert.equal(((await (await t.call('GET', '/v1/me', undefined, tok)).json()) as { listener: { plus: boolean } }).listener.plus, false);
  // Typed in lower case with a dash, as a person might.
  const typed = `${code!.slice(0, 4).toLowerCase()}-${code!.slice(4)}`;
  const first = await t.call('POST', '/v1/me/redeem', { code: typed }, tok);
  assert.equal(first.status, 200, await first.clone().text());
  const g = (await first.json()) as Grant;
  assert.equal(g.grant.kind, 'plus');
  assert.equal(g.grant.days, 30);
  const days = (Date.parse(g.grant.until!) - Date.now()) / 86_400_000;
  assert.ok(days > 29.9 && days < 30.1, `until is 30 days away, got ${days}`);
  assert.equal(((await (await t.call('GET', '/v1/me', undefined, tok)).json()) as { listener: { plus: boolean } }).listener.plus, true);
  // The guard: a second use by the same account is refused and gives nothing more.
  const again = await t.call('POST', '/v1/me/redeem', { code }, tok);
  assert.equal(again.status, 409);
  assert.equal(await err(again), 'already_claimed');
  const [ent] = await t.q<{ until: string }>("SELECT until FROM entitlements WHERE listener_id = $1 AND kind = 'plus'", [other.id]);
  assert.equal(new Date(ent!.until).toISOString(), g.grant.until, 'the second try did not add days');
  assert.equal((await t.q('SELECT 1 FROM redeem_uses WHERE listener_id = $1', [other.id])).length, 1);
  // A second account may use it (max 2), a third may not (used up).
  const b = await signUp(t, 'b@example.com', 'Bea');
  assert.equal((await t.call('POST', '/v1/me/redeem', { code }, b.token)).status, 200);
  const c3 = await signUp(t, 'c@example.com', 'Cy');
  const late = await t.call('POST', '/v1/me/redeem', { code }, c3.token);
  assert.equal(late.status, 410);
  assert.equal((await t.q('SELECT 1 FROM redeem_uses WHERE listener_id = $1', [c3.id])).length, 0, 'a refused use is rolled back');
  await t.close();
});

test('a show code gives the paid show; refused (and kept) for someone who already has it; a wrong code is a 404', async () => {
  const { t, owner, other } = await adminSetup();
  await t.q('INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, 2)', [owner.id, FEED, 'Paid one']);
  await t.q('INSERT INTO hosted_shows (owner_id, feed_url, title) VALUES ($1, $2, $3)', [owner.id, 'https://socialmorning-api.vercel.app/feeds/free.xml', 'Free one']);
  // Only a paid show can be given.
  const free = await aCall(t, 'POST', '/v1/admin/redeem', owner, { kind: 'show', feedUrl: 'https://socialmorning-api.vercel.app/feeds/free.xml' });
  assert.equal(free.status, 422);
  const list0 = (await (await aCall(t, 'GET', '/v1/admin/redeem', owner)).json()) as { paidShows: { feedUrl: string; title: string }[] };
  assert.deepEqual(list0.paidShows, [{ feedUrl: FEED, title: 'Paid one' }]);
  const [code] = await makeCodes(t, owner, { kind: 'show', feedUrl: FEED, maxUses: 5 });
  const tok = await phoneToken(t, 'other@example.com');
  const r = await t.call('POST', '/v1/me/redeem', { code }, tok);
  assert.equal(r.status, 200);
  assert.deepEqual(((await r.json()) as Grant).grant, { kind: 'show', feedUrl: FEED, title: 'Paid one' });
  assert.equal((await t.q("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show' AND ref = $2", [other.id, FEED])).length, 1);
  // Someone who bought it already: refused, and the code is not used up for them.
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.q("INSERT INTO entitlements (listener_id, kind, ref) VALUES ($1, 'show', $2)", [b.id, FEED]);
  const owned = await t.call('POST', '/v1/me/redeem', { code }, b.token);
  assert.equal(owned.status, 409);
  assert.equal(await err(owned), 'already_owned');
  assert.equal((await t.q('SELECT 1 FROM redeem_uses WHERE listener_id = $1', [b.id])).length, 0);
  // Wrong or malformed codes.
  assert.equal((await t.call('POST', '/v1/me/redeem', { code: 'ZZZZZZZZZZZZ' }, tok)).status, 404);
  assert.equal((await t.call('POST', '/v1/me/redeem', { code: '!!' }, tok)).status, 404);
  assert.equal((await t.call('POST', '/v1/me/redeem', { code })).status, 401, 'signed out');
  await t.close();
});

test('admin: list shows uses; a switched-off or expired code is refused; every write leaves an audit row', async () => {
  const { t, owner } = await adminSetup();
  const codes = await makeCodes(t, owner, { kind: 'plus', days: 7, count: 3, note: 'friends' });
  assert.equal(codes.length, 3);
  assert.equal(new Set(codes).size, 3);
  const list = (await (await aCall(t, 'GET', '/v1/admin/redeem', owner)).json()) as { items: { code: string; kind: string; days: number; uses: number; maxUses: number; note: string; disabled: boolean }[] };
  assert.equal(list.items.length, 3);
  assert.deepEqual(list.items.map((i) => [i.kind, i.days, i.uses, i.maxUses, i.note, i.disabled]), [0, 1, 2].map(() => ['plus', 7, 0, 1, 'friends', false]));
  assert.equal((await aCall(t, 'POST', `/v1/admin/redeem/${codes[0]}/disable`, owner, {})).status, 200);
  assert.equal((await aCall(t, 'POST', '/v1/admin/redeem/NOSUCHCODE12/disable', owner, {})).status, 404);
  const user = await signUp(t, 'u@example.com', 'Uma');
  const off = await t.call('POST', '/v1/me/redeem', { code: codes[0] }, user.token);
  assert.equal(off.status, 410);
  await t.q("UPDATE redeem_codes SET expires_at = now() - interval '1 minute' WHERE code = $1", [codes[1]]);
  assert.equal((await t.call('POST', '/v1/me/redeem', { code: codes[1] }, user.token)).status, 410);
  assert.equal((await t.call('POST', '/v1/me/redeem', { code: codes[2] }, user.token)).status, 200);
  const audit = await t.q<{ area: string; action: string }>('SELECT area, action FROM admin_audit ORDER BY id');
  assert.deepEqual(audit.map((a) => `${a.area}:${a.action}`), ['accounts:redeem.create', 'accounts:redeem.disable']);
  // Bad bodies.
  assert.equal((await aCall(t, 'POST', '/v1/admin/redeem', owner, { kind: 'plus' })).status, 422);
  assert.equal((await aCall(t, 'POST', '/v1/admin/redeem', owner, { kind: 'plus', days: 5, count: 101 })).status, 422);
  assert.equal((await aCall(t, 'POST', '/v1/admin/redeem', owner, { kind: 'plus', days: 5, expiresAt: '2020-01-01T00:00:00Z' })).status, 422);
  await t.close();
});

test('redeem is rate-limited: the 11th try in an hour is refused with 429, right or wrong', async () => {
  const { t, owner } = await adminSetup();
  const [code] = await makeCodes(t, owner, { kind: 'plus', days: 1 });
  const u = await signUp(t, 'r@example.com', 'Rae');
  for (let i = 0; i < 10; i++) assert.equal((await t.call('POST', '/v1/me/redeem', { code: 'WRONGWRONG22' }, u.token)).status, 404, `try ${i + 1}`);
  const locked = await t.call('POST', '/v1/me/redeem', { code }, u.token);
  assert.equal(locked.status, 429);
  assert.equal(await err(locked), 'locked');
  await t.close();
});

test('G-M24-A3-2: changing the email needs the right code sent to the NEW address; the old address is told', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const start = await t.call('POST', '/v1/me/email/start', { email: 'New@Example.com' }, a.token);
  assert.equal(start.status, 200, await start.clone().text());
  const code = t.lastCode!('new@example.com');
  assert.ok(!t.mail!.some((m) => m.to === 'a@example.com'), 'nothing goes to the old address before the change');
  const wrong = code === '000000' ? '111111' : '000000';
  // The guard: a wrong code changes nothing.
  const bad = await t.call('POST', '/v1/me/email/confirm', { code: wrong }, a.token);
  assert.equal(bad.status, 422);
  assert.equal((await t.q<{ email: string }>('SELECT email FROM listeners WHERE id = $1', [a.id]))[0]!.email, 'a@example.com');
  const ok = await t.call('POST', '/v1/me/email/confirm', { code }, a.token);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.deepEqual(await ok.json(), { email: 'new@example.com', signedOut: 0 }, 'fix F-S: no other session to sign out');
  assert.equal((await t.q<{ email: string }>('SELECT email FROM listeners WHERE id = $1', [a.id]))[0]!.email, 'new@example.com');
  const notice = t.mail!.find((m) => m.to === 'a@example.com');
  assert.ok(notice, 'the old address got a notice');
  assert.match(notice!.text, /n\*+w@example\.com/);
  // The code is used up; the session still works; GET /v1/me shows the new email.
  assert.equal((await t.call('POST', '/v1/me/email/confirm', { code }, a.token)).status, 422);
  const me = (await (await t.call('GET', '/v1/me', undefined, a.token)).json()) as { listener: { email: string } };
  assert.equal(me.listener.email, 'new@example.com');
  // Sign-in works with the new address.
  await t.call('POST', '/v1/auth/code', { email: 'new@example.com' });
  const signIn = await t.call('POST', '/v1/auth/code/verify', { email: 'new@example.com', code: t.lastCode!('new@example.com') });
  assert.equal(((await signIn.json()) as { listener: { id: string } }).listener.id, a.id);
  await t.close();
});

test('email change: refused for an address in use or your own; five wrong tries end the code; no mailer → 503', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  await signUp(t, 'b@example.com', 'Bea');
  const taken = await t.call('POST', '/v1/me/email/start', { email: 'B@example.com' }, a.token);
  assert.equal(taken.status, 409);
  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'a@example.com' }, a.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'c@example.com' })).status, 401);
  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'c@example.com' }, a.token)).status, 200);
  // A second code within 30 s is refused.
  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'c@example.com' }, a.token)).status, 429);
  const right = t.lastCode!('c@example.com');
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await t.call('POST', '/v1/me/email/confirm', { code: wrong }, a.token)).status, 422, `try ${i + 1}`);
  assert.equal((await t.call('POST', '/v1/me/email/confirm', { code: right }, a.token)).status, 422, 'after five wrong tries even the right code fails');
  assert.equal((await t.q<{ email: string }>('SELECT email FROM listeners WHERE id = $1', [a.id]))[0]!.email, 'a@example.com');
  // Someone takes the address between start and confirm.
  await t.q("UPDATE email_changes SET sent_at = now() - interval '1 minute'");
  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'd@example.com' }, a.token)).status, 200);
  const code = t.lastCode!('d@example.com');
  await signUp(t, 'd@example.com', 'Dee');
  const race = await t.call('POST', '/v1/me/email/confirm', { code }, a.token);
  assert.equal(race.status, 409);
  assert.equal((await t.q<{ email: string }>('SELECT email FROM listeners WHERE id = $1', [a.id]))[0]!.email, 'a@example.com');
  await t.close();
  const n = await freshDb({ noMailer: true });
  const x = await signUp(n, 'x@example.com', 'Xi');
  assert.equal((await n.call('POST', '/v1/me/email/start', { email: 'y@example.com' }, x.token)).status, 503);
  await n.close();
});

test('maskEmail keeps the first letter, the last before @, and the domain', () => {
  assert.equal(maskEmail('someone@example.com'), 's*****e@example.com');
  assert.equal(maskEmail('ab@example.com'), 'ab@example.com');
});
