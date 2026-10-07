// Tests the 15-day deletion wait: hidden and signed out at once, Keep restores everything, the due step deletes.
/**
 * M22 US11 (FR-033–FR-035; contracts/api.md "Account deletion"). Guard G-M22-8: an account waiting
 * to be deleted is invisible in public reads (profile, comments, statuses, search) and comes back
 * whole on Keep. Break: drop the `if (l.hidden_at && viewerId !== id) return undefined;` line in
 * profile() in src/db/repos/social/profiles.ts → the profile read goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';

const JOB = 'job-token-not-secret';
const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

test('G-M22-8: a deletion request hides the account and signs it out; sign-in offers Keep; Keep brings it all back', async () => {
  const t = await freshDb({ jobToken: JOB });
  await putEpisode(t, `${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Alexandra');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const posted = await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hello from A' }, a.token);
  assert.equal(posted.status, 200);
  const commentsSeenBy = async (token?: string) =>
    ((await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, token)).json()) as { comments: { authorId: string | null }[] }).comments.filter((x) => x.authorId === a.id).length;
  assert.equal((await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).status, 200);
  assert.equal(await commentsSeenBy(b.token), 1);

  const del = await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token);
  assert.equal(del.status, 202);
  const { dueAt } = (await del.json()) as { dueAt: string };
  const days = (new Date(dueAt).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 14.9 && days <= 15, `due in ${days} days`);
  assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 401, 'signed out everywhere');

  // Hidden from everyone else: profile, comments, people search.
  assert.equal((await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).status, 404);
  assert.equal((await t.call('GET', `/v1/listeners/${a.id}`)).status, 404);
  assert.equal(await commentsSeenBy(b.token), 0);
  assert.equal(await commentsSeenBy(), 0);
  const people = await t.call('GET', '/v1/search/people?q=Alexandra', undefined, b.token);
  if (people.status === 200) assert.doesNotMatch(await people.text(), new RegExp(a.id));

  // Signing in during the wait: allowed, and it says when.
  const signIn = (await (await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' })).json()) as { token: string; pendingDeletion: { dueAt: string } | null };
  assert.deepEqual(signIn.pendingDeletion, { dueAt });
  assert.equal((await t.call('POST', '/v1/me/deletion/cancel', undefined, signIn.token)).status, 204);
  const again = (await (await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' })).json()) as { pendingDeletion: unknown };
  assert.equal(again.pendingDeletion, null);
  assert.equal((await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).status, 200, 'Keep: the profile is back');
  assert.equal(await commentsSeenBy(b.token), 1, 'Keep: the comment is back');
  // The step finds nothing to delete after Keep, even when the old date passes.
  await t.q("UPDATE account_deletions SET due_at = now() - interval '1 second'");
  const step = await t.call('POST', '/v1/internal/rebuild', { step: 'deletions' }, undefined, { authorization: `Bearer ${JOB}` });
  assert.deepEqual(((await step.json()) as { counts: unknown }).counts, { deleted: 0, failed: 0 });
  assert.equal((await t.q('SELECT 1 FROM listeners WHERE id = $1', [a.id])).length, 1);
  await t.close();
});

test('the due step deletes exactly as the old immediate deletion did; not before the 15 days', async () => {
  const t = await freshDb({ jobToken: JOB });
  await putEpisode(t, `${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Alex');
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'lone' }, a.token);
  assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token)).status, 202);
  const run = async () => ((await (await t.call('POST', '/v1/internal/rebuild', { step: 'deletions' }, undefined, { authorization: `Bearer ${JOB}` })).json()) as { counts: { deleted: number } }).counts.deleted;
  assert.equal(await run(), 0, 'not due yet');
  assert.equal((await t.q('SELECT 1 FROM listeners WHERE id = $1', [a.id])).length, 1);
  await t.q("UPDATE account_deletions SET due_at = now() - interval '1 second'");
  assert.equal(await run(), 1);
  assert.equal((await t.q('SELECT 1 FROM listeners WHERE id = $1', [a.id])).length, 0);
  assert.equal((await t.q('SELECT 1 FROM comments')).length, 0, 'the lone comment went with it');
  assert.equal((await t.q('SELECT 1 FROM account_deletions')).length, 0);
  const re = await t.call('POST', '/v1/auth/sign-up', { email: 'a@example.com', password: 'new password 1', displayName: 'Alex again' });
  assert.equal(re.status, 200, 'the email is free again');
  await t.close();
});
