/** quickstart A7 (the /mod page: G5, G6, G9), A8 (retention), pages (/privacy /rules /get). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, TEST_APPEALS, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'One', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
type Comment = { id: string; body: string | null; deleted: boolean; removed?: boolean; mine?: boolean; replies: Comment[] };

async function post(t: TestDb, token: string, body: Record<string, unknown>) {
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  return ((await (await t.call('POST', `/v1/episodes/${EP}/comments`, body, token)).json()) as { comment: Comment }).comment;
}
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
async function web(t: TestDb, method: string, path: string, body?: Record<string, string>, cookie?: string) {
  return t.app.request(path, { method, headers: { ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? form(body) : undefined, redirect: 'manual' });
}
async function login(t: TestDb, email: string, password = 'correct horse'): Promise<{ status: number; cookie?: string }> {
  const r = await web(t, 'POST', '/mod/login', { email, password });
  const set = r.headers.get('set-cookie') ?? undefined;
  return { status: r.status, ...(set ? { cookie: set.split(';')[0]! } : {}) };
}
const csrfOf = (html: string) => /name="csrf" value="([^"]+)"/.exec(html)![1]!;

test('A7 / G9: /mod is a form without a cookie, 503 without an owner, 403 for the wrong account; the owner signs in with an HttpOnly Strict cookie', async () => {
  const t = await freshDb();
  assert.equal((await web(t, 'GET', '/mod')).status, 503, 'no owner configured');
  const a = await signUp(t, 'a@example.com', 'Al');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const page = await web(t, 'GET', '/mod');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<form method="post" action="\/mod\/login"/);
  assert.equal((await login(t, 'a@example.com')).status, 403, 'a listener who is not the owner');
  assert.equal((await login(t, 'o@example.com', 'wrong')).status, 403);
  const r = await web(t, 'POST', '/mod/login', { email: 'o@example.com', password: 'correct horse' });
  assert.equal(r.status, 303);
  const set = r.headers.get('set-cookie')!;
  assert.match(set, /^mod=/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Path=\/mod/);
  const queue = await web(t, 'GET', '/mod', undefined, set.split(';')[0]!);
  assert.equal(queue.status, 200);
  assert.match(await queue.text(), /Moderation queue/);
  // acting without the cookie / with a wrong csrf
  assert.equal((await web(t, 'POST', '/mod/act', { item: `profile:${a.id}`, action: 'suspend', csrf: 'x' })).status, 403);
  assert.equal((await web(t, 'POST', '/mod/act', { item: `profile:${a.id}`, action: 'suspend', csrf: 'x' }, set.split(';')[0]!)).status, 403);
  await t.close();
});

test('A7: the queue shows a report with its copy; Remove → placeholder for everyone, "removed" for the author, the ETag changes (G5); dismiss changes nothing for the reporter; the closed list keeps the copy after the author deletes (G4)', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const c1 = await post(t, a.token, { body: 'rude thing', offsetMs: 1000, durationMs: 60_000 });
  const c2 = await post(t, a.token, { body: 'fine thing', offsetMs: 2000 });
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'harassment', note: 'look' }, b.token);
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c2.id, reason: 'spam' }, b.token);
  const { cookie } = await login(t, 'o@example.com');
  const html = await (await web(t, 'GET', '/mod', undefined, cookie)).text();
  assert.match(html, /Open \(2\)/);
  assert.match(html, /rude thing/);
  assert.match(html, /by Al at 0:01/);
  assert.match(html, /Reasons: harassment · Reported by: Bea/);
  assert.match(html, /<li>look<\/li>/);
  const csrf = csrfOf(html);

  const before = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, a.token);
  const etag = before.headers.get('etag')!;
  const rm = await web(t, 'POST', '/mod/act', { item: `comment:${c1.id}`, action: 'remove', csrf }, cookie);
  assert.equal(rm.status, 303);
  // G5: the poll's ETag moved, and the comment is a placeholder
  const after = await t.call('GET', `/v1/episodes/${EP}/social`, undefined, a.token, { 'if-none-match': etag });
  assert.equal(after.status, 200, 'G5: a removal changes the ETag');
  const body = (await after.json()) as { comments: Comment[] };
  const removed = body.comments.find((c) => c.id === c1.id)!;
  assert.equal(removed.deleted, true);
  assert.equal(removed.body, null);
  assert.equal(removed.removed, true);
  assert.equal(removed.mine, true, 'the author sees it is theirs and removed');
  const anon = (await (await t.call('GET', `/v1/episodes/${EP}/social`)).json()) as { comments: Comment[] };
  const anonRemoved = anon.comments.find((c) => c.id === c1.id)!;
  assert.equal(anonRemoved.removed, true);
  assert.equal(anonRemoved.mine, undefined);
  assert.equal(anon.comments.find((c) => c.id === c2.id)!.body, 'fine thing', 'the author\'s other content untouched');
  const feed = await t.q(`SELECT 1 FROM activity WHERE kind = 'commented' AND ref_id = $1`, [c1.id]);
  assert.equal(feed.length, 0, 'gone from feeds');

  // dismiss c2 → nothing changes for the reporter (still hidden for B)
  assert.equal((await web(t, 'POST', '/mod/act', { item: `comment:${c2.id}`, action: 'dismiss', csrf }, cookie)).status, 303);
  const asB = (await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, b.token)).json()) as { comments: Comment[] };
  assert.equal(asB.comments.find((c) => c.id === c2.id), undefined);
  const html2 = await (await web(t, 'GET', '/mod', undefined, cookie)).text();
  assert.match(html2, /Open \(0\)/);
  assert.match(html2, /Closed in the last 90 days \(2\)/);
  assert.match(html2, /<b>remove<\/b>/);
  assert.match(html2, /<b>dismiss<\/b>/);
  const acts = await t.q<{ action: string; actor_id: string }>('SELECT action, actor_id FROM moderation_actions ORDER BY created_at');
  assert.deepEqual(acts.map((x) => x.action), ['remove', 'dismiss']);
  assert.ok(acts.every((x) => x.actor_id === o.id));

  // G4: the author deletes c2 → the closed copy still reads
  await t.call('DELETE', `/v1/comments/${c2.id}`, undefined, a.token);
  const html3 = await (await web(t, 'GET', '/mod', undefined, cookie)).text();
  assert.match(html3, /fine thing/);
  // a bad action for the kind
  assert.equal((await web(t, 'POST', '/mod/act', { item: `comment:${c1.id}`, action: 'hide_show', csrf }, cookie)).status, 400);
  assert.equal((await web(t, 'POST', '/mod/act', { item: `profile:${o.id}`, action: 'suspend', csrf }, cookie)).status, 400, 'cannot suspend yourself');
  // logout ends the cookie session
  assert.equal((await web(t, 'POST', '/mod/logout', { csrf }, cookie)).status, 303);
  assert.match(await (await web(t, 'GET', '/mod', undefined, cookie)).text(), /action="\/mod\/login"/);
  await t.close();
});

test('A7 / G6: suspend ends every session, refuses every route and sign-in with the appeals address, shows the profile as suspended; un-suspend restores', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const c1 = await post(t, a.token, { body: 'x', offsetMs: 1000, durationMs: 60_000 });
  await t.call('POST', '/v1/reports', { targetKind: 'profile', targetId: a.id, reason: 'harassment' }, b.token);
  const { cookie } = await login(t, 'o@example.com');
  const csrf = csrfOf(await (await web(t, 'GET', '/mod', undefined, cookie)).text());
  assert.equal((await web(t, 'POST', '/mod/act', { item: `profile:${a.id}`, action: 'suspend', csrf }, cookie)).status, 303);

  const me = await t.call('GET', '/v1/me', undefined, a.token);
  assert.equal(me.status, 403);
  const j = (await me.json()) as { error: string; message: string; appeals: string };
  assert.equal(j.error, 'suspended');
  assert.equal(j.appeals, TEST_APPEALS);
  assert.match(j.message, new RegExp(TEST_APPEALS));
  assert.equal((await t.q('SELECT 1 FROM sessions WHERE listener_id = $1', [a.id])).length, 0, 'every session ended');
  const signIn = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal(signIn.status, 403);
  assert.equal(((await signIn.json()) as { error: string }).error, 'suspended');
  const prof = (await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).json()) as { profile: { suspended?: boolean; recent: unknown[] } };
  assert.equal(prof.profile.suspended, true);
  assert.deepEqual(prof.profile.recent, []);
  // content stays unless removed separately
  const anon = (await (await t.call('GET', `/v1/episodes/${EP}/social`)).json()) as { comments: Comment[] };
  assert.equal(anon.comments.find((c) => c.id === c1.id)!.body, 'x');
  // suspending via a comment item suspends its author
  const c2 = await post(t, b.token, { body: 'y', offsetMs: 1000 });
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c2.id, reason: 'spam' }, o.token);
  assert.equal((await web(t, 'POST', '/mod/act', { item: `comment:${c2.id}`, action: 'suspend', csrf }, cookie)).status, 303);
  assert.equal((await t.call('GET', '/v1/me', undefined, b.token)).status, 403);
  // un-suspend
  assert.equal((await web(t, 'POST', '/mod/act', { item: `profile:${a.id}`, action: 'unsuspend', csrf }, cookie)).status, 303);
  const again = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal(again.status, 200);
  await t.close();
});

test('A8: closed reports older than 90 days are purged on the next /mod open; a deleted reporter stays anonymised; reports against a deleted author close as author_deleted', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const c1 = await post(t, a.token, { body: 'old', offsetMs: 1000, durationMs: 60_000 });
  const c2 = await post(t, a.token, { body: 'new', offsetMs: 2000 });
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c1.id, reason: 'spam' }, b.token);
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: c2.id, reason: 'spam' }, b.token);
  await t.q("UPDATE reports SET closed_at = now() - interval '91 days', close_reason = 'dismiss' WHERE target_id = $1", [c1.id]);
  const { cookie } = await login(t, 'o@example.com');
  await web(t, 'GET', '/mod', undefined, cookie);
  assert.equal((await t.q('SELECT 1 FROM reports WHERE target_id = $1', [c1.id])).length, 0, 'purged');
  // the reporter deletes their account → the report stays, anonymised
  assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, b.token)).status, 200);
  const [r] = await t.q<{ reporter_id: string | null; closed_at: string | null }>('SELECT reporter_id, closed_at FROM reports WHERE target_id = $1', [c2.id]);
  assert.equal(r!.reporter_id, null);
  assert.equal(r!.closed_at, null, 'still open');
  assert.match(await (await web(t, 'GET', '/mod', undefined, cookie)).text(), /a deleted account/);
  // the author deletes their account → reports against their content close as author_deleted, the copy stays
  assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token)).status, 200);
  const [r2] = await t.q<{ close_reason: string | null; snapshot: { body: string } }>('SELECT close_reason, snapshot FROM reports WHERE target_id = $1', [c2.id]);
  assert.equal(r2!.close_reason, 'author_deleted');
  assert.equal(r2!.snapshot.body, 'new');
  await t.close();
});

test('pages: /privacy, /rules and /get answer 200 with the appeals address and the release link; the clip page links /get', async () => {
  const t = await freshDb({ releaseSha256: 'abc123' });
  for (const p of ['/privacy', '/rules', '/get']) {
    const r = await t.app.request(p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    assert.doesNotMatch(html, /test-pepper|DATABASE_URL/);
    if (p !== '/get') assert.match(html, new RegExp(TEST_APPEALS));
  }
  const get = await (await t.app.request('/get')).text();
  assert.match(get, /github\.com\/Jayden0218\/SocialMorning-ci\/releases\/latest/);
  assert.match(get, /abc123/);
  assert.match(await (await t.app.request('/privacy')).text(), /Delete my account/);
  assert.match(await (await t.app.request('/rules')).text(), /Harassment/);
  await t.close();
});
