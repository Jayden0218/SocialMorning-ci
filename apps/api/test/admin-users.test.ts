// Tests that admin suspend, restore and report actions match the moderation page.
/**
 * M15 guard G-U1 (FR-030, FR-031): suspend/restore and report actions in Admin go through the
 * SAME `act()` as `/mod`, so both pages agree by construction.
 *
 * The break that turns it red (watched once, named in the commit): in `src/routes/admin/`
 * `POST /users/:id/suspend`, replace `adminAct(…)` with
 * `await c.get('db').query('UPDATE listeners SET suspended_at = now() WHERE id = $1', [id])`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { aCall, adminSetup, auditRows } from './admin-harness.ts';
import { putEpisode } from './put-episode.ts';
import { signUp } from './harness.ts';
import { actionRows, auditFull } from './sf-neutral.ts';

test('G-U1: suspend and restore in Admin are moderation actions (/mod lists them), and the account is refused exactly as /mod would', async () => {
  const { t, owner } = await adminSetup();
  const u = await signUp(t, 'user@example.com', 'Troll');

  const found = (await (await aCall(t, 'GET', '/v1/admin/users?q=trol', owner)).json()) as { items: { id: string; email: string; suspended: boolean; madeByAdmin: boolean }[] };
  assert.deepEqual(found.items.map((i) => [i.id, i.email, i.suspended, i.madeByAdmin]), [[u.id, 'user@example.com', false, false]]);
  assert.equal(((await (await aCall(t, 'GET', '/v1/admin/users?q=user@exa', owner)).json()) as { items: unknown[] }).items.length, 1, 'by email too');

  assert.equal((await aCall(t, 'POST', `/v1/admin/users/${u.id}/suspend`, owner)).status, 200);
  const acts = await actionRows(t);
  assert.deepEqual(acts, [{ action: 'suspend', target_kind: 'profile', target_id: u.id, actor_id: owner.id }]);
  const refused = await t.call('GET', '/v1/me', undefined, u.token);
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as { error: string }).error, 'suspended');

  assert.equal((await aCall(t, 'POST', `/v1/admin/users/${u.id}/restore`, owner)).status, 200);
  assert.equal((await t.call('GET', '/v1/me', undefined, u.token)).status, 200);

  // /mod's "Recent actions" shows both — the same rows.
  const reports = (await (await aCall(t, 'GET', '/v1/admin/reports', owner)).json()) as { actions: { action: string; targetId: string }[] };
  assert.deepEqual(reports.actions.map((a) => [a.action, a.targetId]), [['unsuspend', u.id], ['suspend', u.id]]);
  assert.deepEqual((await auditRows(t)).map((r) => [r.area, r.action]), [['users', 'suspend'], ['users', 'unsuspend']]);
  assert.equal((await aCall(t, 'POST', `/v1/admin/users/${owner.id}/suspend`, owner)).status, 422, 'never yourself');
  await t.close();
});

test('reports: the queue in Admin is /mod\'s queue; acting on an item closes it for both', async () => {
  const { t, owner } = await adminSetup();
  const a = await signUp(t, 'a@example.com', 'Author');
  const r = await signUp(t, 'r@example.com', 'Reporter');
  const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
  const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const c = (await (await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'rude', offsetMs: 1 }, a.token)).json()) as { comment?: { id: string }; id?: string };
  const commentId = c.comment?.id ?? c.id!;
  assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: commentId, reason: 'harassment' }, r.token)).status < 300, true);

  const open = (await (await aCall(t, 'GET', '/v1/admin/reports?state=open', owner)).json()) as { items: { targetKind: string; targetId: string; count: number; actions: string[] }[] };
  assert.deepEqual(open.items.map((i) => [i.targetKind, i.targetId, i.count]), [['comment', commentId, 1]]);
  assert.deepEqual(open.items[0]!.actions, ['dismiss', 'remove', 'suspend']);

  assert.equal((await aCall(t, 'POST', '/v1/admin/reports/act', owner, { kind: 'comment', id: commentId, action: 'hide_show' })).status, 422, 'an action that does not fit the item');
  const act = await aCall(t, 'POST', '/v1/admin/reports/act', owner, { kind: 'comment', id: commentId, action: 'remove' });
  assert.equal(act.status, 200);
  assert.equal(((await (await aCall(t, 'GET', '/v1/admin/reports?state=open', owner)).json()) as { items: unknown[] }).items.length, 0);
  const closed = (await (await aCall(t, 'GET', '/v1/admin/reports?state=closed', owner)).json()) as { items: { targetId: string; closeReason: string }[] };
  assert.deepEqual(closed.items.map((i) => [i.targetId, i.closeReason]), [[commentId, 'remove']]);
  assert.equal((await t.q('SELECT 1 FROM comments WHERE id = $1 AND removed_at IS NOT NULL', [commentId])).length, 1);
  assert.deepEqual((await auditRows(t)).map((x) => [x.area, x.action, x.target]), [['reports', 'remove', `comment:${commentId}`]]);
  await t.close();
});

test('rename a listener whose display name breaks the rules; recorded with before and after', async () => {
  const { t, owner } = await adminSetup();
  const u = await signUp(t, 'n@example.com', 'Bad Name');
  const res = await aCall(t, 'PATCH', `/v1/admin/users/${u.id}`, owner, { displayName: 'Listener' });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: { displayName: string } }).user.displayName, 'Listener');
  const [row] = (await auditFull(t)) as unknown as { before: { displayName: string }; after: { displayName: string } }[];
  assert.deepEqual([row!.before.displayName, row!.after.displayName], ['Bad Name', 'Listener']);
  await t.close();
});
