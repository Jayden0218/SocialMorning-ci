// M24 lane A1: reporting statuses, chat messages and lists; blocked words; notices; maintenance; user detail; appeals.
/**
 * Guards (specs/025-m24-gaps-and-look, lane A1):
 *  - G-M24-A1 (US1): a reported status, chat message and shared list reach Admin › Reports, and
 *    Remove hides each from every reader. Break: in `src/db/repos/safety/moderation.ts`, drop the
 *    `status` / `chat_message` / `list` branches of the `remove` case.
 *  - G-M24-A2 (US2): a blocked word is refused with 422 `blocked_word` on every checked write.
 *    Break: in `src/routes/safety/word-filter.ts`, skip the `assertNoBlockedWords` call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { aCall, adminSetup } from './admin-harness.ts';
import { signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { auditFull, setAvatarRow } from './sf-neutral.ts';
import { cancelDeletion, requestDeletion } from '../src/db/repos/account/deletion.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T;

/** Two listeners who follow each other (so they can chat). */
async function friends(t: TestDb) {
  const a = await signUp(t, 'a@example.com', 'Author');
  const r = await signUp(t, 'r@example.com', 'Reader');
  assert.equal((await t.call('PUT', `/v1/listeners/${r.id}/follow`, undefined, a.token)).status < 300, true);
  assert.equal((await t.call('PUT', `/v1/listeners/${a.id}/follow`, undefined, r.token)).status < 300, true);
  return { a, r };
}

type QueueItem = { targetKind: string; targetId: string; snapshot: Record<string, unknown>; actions: string[] };

test('G-M24-A1: a status, a chat message and a shared list can be reported; Admin removes each and every reader loses it; the author is told', async () => {
  const { t, owner } = await adminSetup();
  const { a, r } = await friends(t);
  const status = await json<{ id: string }>(t.call('POST', '/v1/voice-posts', { body: 'rude status' }, a.token));
  const msg = await json<{ message: { id: string } }>(t.call('POST', `/v1/me/chats/${r.id}`, { body: 'rude message' }, a.token));
  const list = await json<{ id: string }>(t.call('POST', '/v1/me/shared-lists', { title: 'Rude list', feedUrls: ['https://a.example/1.xml', 'https://a.example/2.xml'] }, a.token));

  // Only the person a message was sent to may report it; nobody reports their own.
  const outsider = await signUp(t, 'o@example.com', 'Outsider');
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'chat_message', targetId: msg.message.id, reason: 'harassment' }, outsider.token)).status, 404);
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'status', targetId: status.id, reason: 'spam' }, a.token)).status, 422, 'own content');
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'list', targetId: 'not-an-id', reason: 'spam' }, r.token)).status, 422);
  for (const [kind, id] of [['status', status.id], ['chat_message', msg.message.id], ['list', list.id]] as const) {
    assert.equal((await t.call('POST', '/v1/reports', { targetKind: kind, targetId: id, reason: 'harassment' }, r.token)).status, 201, kind);
  }
  // The reporter's own hidden list carries the new kinds (the phone refills from it).
  const hidden = await json<{ reported: { kind: string; id: string }[] }>(t.call('GET', '/v1/me/hidden', undefined, r.token));
  assert.deepEqual(hidden.reported.map((h) => h.kind).sort(), ['chat_message', 'list', 'status']);

  const open = await json<{ items: QueueItem[] }>(aCall(t, 'GET', '/v1/admin/reports?state=open', owner));
  const byKind = new Map(open.items.map((i) => [i.targetKind, i]));
  assert.equal(byKind.get('status')!.snapshot['body'], 'rude status');
  assert.equal(byKind.get('chat_message')!.snapshot['body'], 'rude message');
  assert.equal(byKind.get('chat_message')!.snapshot['authorId'], a.id);
  assert.equal(byKind.get('list')!.snapshot['title'], 'Rude list');
  for (const i of open.items) assert.deepEqual(i.actions, ['dismiss', 'remove', 'suspend']);

  for (const i of open.items) {
    assert.equal((await aCall(t, 'POST', '/v1/admin/reports/act', owner, { kind: i.targetKind, id: i.targetId, action: 'remove' })).status, 200, i.targetKind);
  }
  // Gone for every reader — the author too.
  assert.equal((await t.call('GET', `/v1/voice-posts/${status.id}`, undefined, a.token)).status, 404, 'status');
  const feed = await json<{ items: { id: string }[] }>(t.call('GET', '/v1/voice-posts', undefined, r.token));
  assert.equal(feed.items.some((p) => p.id === status.id), false);
  const thread = await json<{ messages: { id: string }[] }>(t.call('GET', `/v1/me/chats/${a.id}`, undefined, r.token));
  assert.equal(thread.messages.some((m) => m.id === msg.message.id), false, 'chat message');
  assert.equal((await json<{ conversations: unknown[] }>(t.call('GET', '/v1/me/chats', undefined, a.token))).conversations.length, 0);
  assert.equal((await t.call('GET', `/v1/lists/${list.id}`)).status, 404, 'list');
  assert.equal((await t.call('GET', `/l/${list.id}`)).status, 404, 'list page');
  assert.equal((await json<{ items: unknown[] }>(aCall(t, 'GET', '/v1/admin/reports?state=open', owner))).items.length, 0);

  // The author gets one system notice per removal, each with the Appeal button.
  const notices = await json<{ items: { title: string; action?: { route: string } }[] }>(t.call('GET', '/v1/me/notifications/system', undefined, a.token));
  assert.deepEqual(notices.items.map((n) => n.title).sort(), ['Your message was removed', 'Your shared list was removed', 'Your status was removed']);
  assert.ok(notices.items.every((n) => n.action?.route === '/appeal'));
  assert.equal((await json<{ items: unknown[] }>(t.call('GET', '/v1/me/notifications/system', undefined, r.token))).items.length, 0, 'account notices are private');
  await t.close();
});

test('G-M24-A2: a blocked word is refused with 422 blocked_word on comments, statuses, replies, chat, lists, playlists, clips and names', async () => {
  const { t, owner } = await adminSetup();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const { a, r } = await friends(t);
  const add = await aCall(t, 'POST', '/v1/admin/words', owner, { words: ['  Badword ', '坏词', 'BADWORD'] });
  assert.equal(add.status, 200);
  assert.deepEqual((await json<{ items: { word: string }[] }>(aCall(t, 'GET', '/v1/admin/words', owner))).items.map((w) => w.word), ['badword', '坏词']);
  assert.equal((await aCall(t, 'POST', '/v1/admin/words', owner, { words: ['   '] })).status, 422);

  const status = await json<{ id: string }>(t.call('POST', '/v1/voice-posts', { body: 'fine status' }, a.token));
  const refused: [string, string, unknown, string | undefined][] = [
    ['POST', `/v1/episodes/${EP}/comments`, { body: 'you BADWORD', offsetMs: 1 }, a.token],
    ['POST', `/v1/episodes/${EP}/clips`, { clientId: 'c1', startMs: 0, endMs: 10_000, caption: 'badword!' }, a.token],
    ['POST', '/v1/voice-posts', { body: '这是坏词' }, a.token],
    ['POST', `/v1/voice-posts/${status.id}/replies`, { body: 'badword' }, r.token],
    ['POST', `/v1/me/chats/${r.id}`, { body: 'hey badword' }, a.token],
    ['POST', '/v1/me/shared-lists', { title: 'Badword list', feedUrls: ['https://a.example/1.xml', 'https://a.example/2.xml'] }, a.token],
    ['POST', '/v1/me/playlists', { title: 'badword mix' }, a.token],
    ['PATCH', '/v1/me', { displayName: 'Mr Badword' }, a.token],
    ['PATCH', '/v1/me', { bio: 'I say badword' }, a.token],
    // M25 S3: sign-up is gone; a new account is named at /code/verify (checked before the code is).
    ['POST', '/v1/auth/code/verify', { email: 'n@example.com', code: '123456', displayName: 'badword' }, undefined],
  ];
  for (const [method, path, body, token] of refused) {
    const res = await t.call(method, path, body, token);
    assert.equal(res.status, 422, `${method} ${path} ${JSON.stringify(body)}`);
    assert.equal((await json<{ error: string }>(res)).error, 'blocked_word', `${method} ${path}`);
  }
  // A longer word that only contains it is fine; so is clean text.
  assert.equal((await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'badwordy is not the word', offsetMs: 1 }, a.token)).status, 200);
  assert.equal((await t.call('PATCH', '/v1/me', { displayName: 'Mr Fine' }, a.token)).status, 200);
  // Removed → allowed again at once.
  assert.equal((await aCall(t, 'DELETE', `/v1/admin/words/${encodeURIComponent('BadWord')}`, owner)).status, 200);
  assert.equal((await t.call('POST', '/v1/me/playlists', { title: 'badword mix' }, a.token)).status < 300, true);
  assert.equal((await aCall(t, 'DELETE', '/v1/admin/words/nothere', owner)).status, 404);
  const audit = (await auditFull(t)).filter((x) => x.area === 'safety');
  assert.deepEqual(audit.map((x) => x.action), ['add words', 'remove word']);
  await t.close();
});

test('M24 US3: a notice written in Admin shows on every phone; a push goes only to listeners whose System notices switch is on (not Popular — fix F-S)', async () => {
  const sent: { to: string; data: Record<string, string> }[] = [];
  const pushFetch = (async (_i: string | URL | Request, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as { to: string; data: Record<string, string> }[];
    sent.push(...batch);
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }), { status: 200 });
  }) as typeof fetch;
  const { t, owner } = await adminSetup({ pushFetch });
  const a = await signUp(t, 'a@example.com', 'Ann');
  const b = await signUp(t, 'b@example.com', 'Ben');
  await t.call('POST', '/v1/me/push-tokens', { token: 'ExponentPushToken[aaaaaaaaaaaa]', platform: 'android' }, a.token);
  await t.call('POST', '/v1/me/push-tokens', { token: 'ExponentPushToken[bbbbbbbbbbbb]', platform: 'ios' }, b.token);
  // Fix F-S: notices have their own switch. Popular off does not stop them; System off does.
  assert.equal((await t.call('PUT', '/v1/me/push-prefs', { popular: false }, a.token)).status, 204);
  assert.equal((await t.call('PUT', '/v1/me/push-prefs', { system: false }, b.token)).status, 204);
  assert.equal((await json<Record<string, boolean>>(t.call('GET', '/v1/me/push-prefs', undefined, b.token)))['system'], false);
  assert.equal((await json<Record<string, boolean>>(t.call('GET', '/v1/me/push-prefs', undefined, a.token)))['system'], true, 'default on');

  assert.equal((await aCall(t, 'POST', '/v1/admin/notices', owner, { title: 'Hi', body: 'Body', link: { label: 'Open', route: 'https://evil.example' } })).status, 422, 'a web address is not a link');
  const res = await aCall(t, 'POST', '/v1/admin/notices', owner, { title: 'New: chat', body: 'You can chat now.', link: { label: 'Open chats', route: '/inbox' }, push: true });
  assert.equal(res.status, 201);
  const made = await json<{ notice: { id: string }; pushed: { sent: number } }>(res);
  assert.equal(made.pushed.sent, 1);
  assert.deepEqual(sent.map((m) => [m.to, m.data['href']]), [['ExponentPushToken[aaaaaaaaaaaa]', '/notifications/system']]);

  for (const who of [a, b]) {
    const page = await json<{ items: { title: string; body: string; action?: { label: string; route: string } }[] }>(t.call('GET', '/v1/me/notifications/system', undefined, who.token));
    assert.deepEqual(page.items.map((n) => [n.title, n.body, n.action?.route]), [['New: chat', 'You can chat now.', '/inbox']]);
  }
  assert.equal((await json<{ items: unknown[] }>(aCall(t, 'GET', '/v1/admin/notices', owner))).items.length, 1);
  assert.equal((await aCall(t, 'DELETE', `/v1/admin/notices/${made.notice.id}`, owner)).status, 204);
  assert.equal((await json<{ items: unknown[] }>(t.call('GET', '/v1/me/notifications/system', undefined, a.token))).items.length, 0);
  assert.equal((await t.call('GET', '/v1/me/notifications/system')).status, 401);
  await t.close();
});

test('M24 US4: maintenance on → every API call but health/admin/sign-in answers 503 with the body the phone reads; off → 200', async () => {
  const { t, owner } = await adminSetup();
  const u = await signUp(t, 'u@example.com', 'User');
  assert.equal((await aCall(t, 'PUT', '/v1/admin/maintenance', owner, { on: true, message: 'Back soon.' })).status, 422, 'an end time is needed');
  assert.equal((await aCall(t, 'PUT', '/v1/admin/maintenance', owner, { on: true, until: new Date(Date.now() - 1000).toISOString() })).status, 422, 'in the future');
  const until = new Date(Date.now() + 3_600_000).toISOString();
  const on = await json<{ active: { until: string; message: string } }>(aCall(t, 'PUT', '/v1/admin/maintenance', owner, { on: true, message: 'Back soon.', until }));
  assert.deepEqual(on.active, { until, message: 'Back soon.' });

  const me = await t.call('GET', '/v1/me', undefined, u.token);
  assert.equal(me.status, 503);
  assert.deepEqual(await me.json(), { error: 'maintenance', message: 'Back soon.', maintenance: { until, message: 'Back soon.' } });
  assert.equal((await t.call('GET', '/v1/search?q=x')).status, 503);
  assert.deepEqual(await json(t.call('GET', '/v1/health')), { ok: true, db: 'ok', maintenance: { until, message: 'Back soon.' } });
  assert.equal((await aCall(t, 'GET', '/v1/admin/maintenance', owner)).status, 200, 'Admin still works');
  assert.equal((await t.call('POST', '/v1/auth/sign-in', { email: 'u@example.com', password: 'correct horse' })).status, 200, 'signing in still works');
  assert.notEqual((await t.call('GET', '/l/abcdefghij')).status, 503, 'pages are not the API');

  assert.equal((await aCall(t, 'PUT', '/v1/admin/maintenance', owner, { on: false })).status, 200);
  assert.equal((await t.call('GET', '/v1/me', undefined, u.token)).status, 200);
  assert.deepEqual(await json(t.call('GET', '/v1/health')), { ok: true, db: 'ok' });
  assert.deepEqual((await auditFull(t)).filter((x) => x.area === 'safety').map((x) => x.action), ['maintenance on', 'maintenance off']);
  await t.close();
});

test('M24 US5: one user in full; grant and revoke PLUS (recorded); remove a bio and a photo', async () => {
  const removed: string[] = [];
  const avatarStorage = { ready: true, put: async () => ({ url: 'https://blob/x.jpg', pathname: 'x.jpg' }), remove: async (u: string) => { removed.push(u); } };
  const { t, owner } = await adminSetup({ avatarStorage });
  const u = await signUp(t, 'u@example.com', 'User');
  await t.call('PATCH', '/v1/me', { bio: 'rude bio' }, u.token);
  await setAvatarRow(t, u.id, 'https://blob/old.jpg', 'old.jpg', 10);

  type Detail = { user: { id: string }; bio: string | null; avatarUrl: string | null; sessions: number; plus: { active: boolean; byAdmin: boolean }; purchases: unknown[]; reportsAgainst: unknown[]; deletion: unknown };
  const d = await json<Detail>(aCall(t, 'GET', `/v1/admin/users/${u.id}`, owner));
  assert.equal(d.user.id, u.id);
  assert.equal(d.bio, 'rude bio');
  assert.equal(d.sessions, 1);
  assert.equal(d.plus.active, false);
  assert.deepEqual([d.purchases, d.reportsAgainst, d.deletion], [[], [], null]);
  assert.equal((await aCall(t, 'GET', '/v1/admin/users/00000000-0000-4000-8000-000000000000', owner)).status, 404);

  const plusOf = async () => (await json<{ listener: { plus: boolean } }>(t.call('GET', '/v1/me', undefined, u.token))).listener.plus;
  assert.equal(await plusOf(), false);
  assert.equal((await json<Detail>(aCall(t, 'POST', `/v1/admin/users/${u.id}/plus`, owner, { days: 30 }))).plus.byAdmin, true);
  assert.equal(await plusOf(), true);
  assert.equal((await json<Detail>(aCall(t, 'DELETE', `/v1/admin/users/${u.id}/plus`, owner))).plus.active, false);
  assert.equal(await plusOf(), false);

  assert.equal((await json<Detail>(aCall(t, 'DELETE', `/v1/admin/users/${u.id}/bio`, owner))).bio, null);
  assert.equal((await json<Detail>(aCall(t, 'DELETE', `/v1/admin/users/${u.id}/avatar`, owner))).avatarUrl, null);
  assert.deepEqual(removed, ['https://blob/old.jpg'], 'the file leaves storage too');
  const audit = (await auditFull(t)).filter((x) => x.area === 'users');
  assert.deepEqual(audit.map((x) => x.action), ['grant plus 30 days', 'revoke plus', 'remove bio', 'remove photo']);
  await t.close();
});

test('M24 US6: a suspended listener appeals with the token the refusal carried, once; Accept restores the account; a removed comment appeal can be rejected', async () => {
  const { t, owner } = await adminSetup();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const u = await signUp(t, 'u@example.com', 'User');
  const rep = await signUp(t, 'rep@example.com', 'Reporter');

  // A removed comment: the author appeals with their session; Reject keeps it removed.
  const c = await json<{ comment?: { id: string }; id?: string }>(t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hm', offsetMs: 1 }, u.token));
  const commentId = c.comment?.id ?? c.id!;
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: commentId, reason: 'spam' }, rep.token);
  await aCall(t, 'POST', '/v1/admin/reports/act', owner, { kind: 'comment', id: commentId, action: 'remove' });
  const mine = await json<{ items: { actionId: string; action: string; what: string; appeal: unknown }[] }>(t.call('GET', '/v1/appeals', undefined, u.token));
  assert.deepEqual(mine.items.map((i) => [i.action, i.what, i.appeal]), [['remove', 'Your comment “hm” was removed', null]]);
  assert.equal((await t.call('GET', '/v1/appeals', undefined, rep.token)).status, 200);
  assert.equal((await t.call('POST', '/v1/appeals', { actionId: mine.items[0]!.actionId, text: 'not me' }, rep.token)).status, 404, 'not theirs');
  assert.equal((await t.call('POST', '/v1/appeals', { actionId: mine.items[0]!.actionId, text: 'It was a joke' }, u.token)).status, 201);
  assert.equal((await t.call('POST', '/v1/appeals', { actionId: mine.items[0]!.actionId, text: 'again' }, u.token)).status, 409, 'once per action');

  // Suspended: the session is refused, but the refusal carries an appeal token.
  assert.equal((await aCall(t, 'POST', `/v1/admin/users/${u.id}/suspend`, owner)).status, 200);
  const refused = await json<{ error: string; appealToken?: string }>(t.call('GET', '/v1/me', undefined, u.token));
  assert.equal(refused.error, 'suspended');
  assert.ok(refused.appealToken);
  assert.equal((await t.call('GET', '/v1/appeals', undefined, undefined, { 'x-appeal-token': `${refused.appealToken!.slice(0, -2)}xx` })).status, 401, 'a forged token');
  const withToken = await json<{ items: { actionId: string; action: string }[] }>(t.call('GET', '/v1/appeals', undefined, undefined, { 'x-appeal-token': refused.appealToken! }));
  const suspension = withToken.items.find((i) => i.action === 'suspend')!;
  assert.equal((await t.call('POST', '/v1/appeals', { actionId: suspension.actionId, text: 'Please' }, undefined, { 'x-appeal-token': refused.appealToken! })).status, 201);

  const open = await json<{ items: { id: string; action: { action: string }; text: string }[] }>(aCall(t, 'GET', '/v1/admin/appeals?state=open', owner));
  assert.deepEqual(open.items.map((i) => [i.action.action, i.text]), [['remove', 'It was a joke'], ['suspend', 'Please']]);
  const rejectId = open.items[0]!.id;
  const acceptId = open.items[1]!.id;
  assert.equal((await aCall(t, 'POST', `/v1/admin/appeals/${rejectId}/reject`, owner)).status, 200);
  assert.equal((await aCall(t, 'POST', `/v1/admin/appeals/${acceptId}/accept`, owner)).status, 200);
  assert.equal((await aCall(t, 'POST', `/v1/admin/appeals/${acceptId}/accept`, owner)).status, 409, 'decided once');
  assert.equal((await t.call('GET', '/v1/me', undefined, u.token)).status, 200, 'accepted: the account works again');
  assert.equal((await t.q('SELECT 1 FROM comments WHERE id = $1 AND removed_at IS NOT NULL', [commentId])).length, 1, 'rejected: still removed');
  const titles = (await json<{ items: { title: string }[] }>(t.call('GET', '/v1/me/notifications/system', undefined, u.token))).items.map((n) => n.title);
  assert.ok(titles.includes('Your appeal was accepted') && titles.includes('Your appeal was not accepted'));
  assert.equal((await json<{ items: unknown[] }>(aCall(t, 'GET', '/v1/admin/appeals?state=decided', owner))).items.length, 2);
  await t.close();
});

test('M24 US6: accepting the appeal of a removed comment brings it back', async () => {
  const { t, owner } = await adminSetup();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const u = await signUp(t, 'u@example.com', 'User');
  const rep = await signUp(t, 'rep@example.com', 'Reporter');
  const c = await json<{ comment?: { id: string }; id?: string }>(t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'fine really', offsetMs: 1 }, u.token));
  const commentId = c.comment?.id ?? c.id!;
  await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: commentId, reason: 'spam' }, rep.token);
  await aCall(t, 'POST', '/v1/admin/reports/act', owner, { kind: 'comment', id: commentId, action: 'remove' });
  const [item] = (await json<{ items: { actionId: string }[] }>(t.call('GET', '/v1/appeals', undefined, u.token))).items;
  await t.call('POST', '/v1/appeals', { actionId: item!.actionId, text: 'Look again' }, u.token);
  const [appeal] = (await json<{ items: { id: string }[] }>(aCall(t, 'GET', '/v1/admin/appeals', owner))).items;
  assert.equal((await aCall(t, 'POST', `/v1/admin/appeals/${appeal!.id}/accept`, owner)).status, 200);
  assert.equal((await t.q('SELECT 1 FROM comments WHERE id = $1 AND removed_at IS NULL', [commentId])).length, 1);
  await t.close();
});

test('M24 US7: Admin lists the accounts waiting for deletion, soonest first', async () => {
  const { t, owner } = await adminSetup();
  const u = await signUp(t, 'u@example.com', 'Leaving');
  await requestDeletion(t.db, u.id);
  const list = await json<{ items: { listenerId: string; displayName: string; dueAt: string }[] }>(aCall(t, 'GET', '/v1/admin/deletions', owner));
  assert.deepEqual(list.items.map((i) => [i.listenerId, i.displayName]), [[u.id, 'Leaving']]);
  await cancelDeletion(t.db, u.id);
  assert.equal((await json<{ items: unknown[] }>(aCall(t, 'GET', '/v1/admin/deletions', owner))).items.length, 0);
  await t.close();
});

test('M24 US17: "stop suggesting" drops a person from my suggested statuses, and undo brings them back', async () => {
  const { t } = await adminSetup();
  const me = await signUp(t, 'me@example.com', 'Me');
  const s = await signUp(t, 's@example.com', 'Stranger');
  await t.call('POST', '/v1/voice-posts', { body: 'hello world' }, s.token);
  const suggested = async () => (await json<{ items: { suggested: boolean; author: { id: string } }[] }>(t.call('GET', '/v1/voice-posts?suggested=1', undefined, me.token))).items.filter((p) => p.suggested).map((p) => p.author.id);
  assert.deepEqual(await suggested(), [s.id]);
  assert.equal((await t.call('PUT', `/v1/voice-posts/suggestions/muted/${s.id}`, undefined, me.token)).status, 204);
  assert.deepEqual(await suggested(), []);
  assert.equal((await t.call('PUT', `/v1/voice-posts/suggestions/muted/${me.id}`, undefined, me.token)).status, 404, 'not yourself');
  assert.equal((await t.call('DELETE', `/v1/voice-posts/suggestions/muted/${s.id}`, undefined, me.token)).status, 204);
  assert.deepEqual(await suggested(), [s.id]);
  await t.close();
});
