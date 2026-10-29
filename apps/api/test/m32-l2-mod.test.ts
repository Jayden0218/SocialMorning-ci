// M32 T042 (review B9): /mod login hashes for an unknown email too; CSRF is compared in constant time.
/**
 * Guards G-M32-B9a/b. Break: in src/pages/mod.ts drop the dummy hash (`row?.password_hash ?? dummy`) -> (a) goes red;
 * put `!==` back in csrfOk -> behaviour is the same, so (b) only proves wrong is refused and right accepted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { modLoginHashCalls } from '../src/pages/mod.ts';

async function web(t: TestDb, method: string, path: string, body?: Record<string, string>, cookie?: string) {
  return t.app.request(path, { method, headers: { ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? new URLSearchParams(body).toString() : undefined, redirect: 'manual' });
}

test('G-M32-B9a: login runs the password hash once for an unknown email, a non-owner, and the owner', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  void a;
  for (const email of ['nobody@example.com', 'a@example.com', 'o@example.com']) {
    const before = modLoginHashCalls.count;
    await web(t, 'POST', '/mod/login', { email, password: 'wrong password' });
    assert.equal(modLoginHashCalls.count - before, 1, `hash calls for ${email}`);
  }
  await t.close();
});

test('G-M32-B9b: a wrong CSRF value is refused, the right one is accepted', async () => {
  const t = await freshDb();
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const r = await web(t, 'POST', '/mod/login', { email: 'o@example.com', password: 'correct horse' });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
  await web(t, 'POST', '/mod/code', { code: t.lastCode!('o@example.com') }, cookie);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await (await web(t, 'GET', '/mod', undefined, cookie)).text())![1]!;
  const item = `profile:${o.id}`;
  for (const bad of ['', 'x', csrf.slice(0, -1), csrf + 'x']) {
    const res = await web(t, 'POST', '/mod/act', { item, action: 'dismiss', csrf: bad }, cookie);
    assert.equal(res.status, 403, `csrf "${bad}"`);
  }
  const ok = await web(t, 'POST', '/mod/act', { item, action: 'dismiss', csrf }, cookie);
  assert.notEqual(ok.status, 403, 'right csrf passes the check');
  await t.close();
});
